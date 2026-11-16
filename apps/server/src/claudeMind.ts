/**
 * The Claude-backed mind. Every call goes through one gateway that:
 * - checks the daily budget before calling, and logs the real cost after,
 * - limits how many calls run at once and drops work when the queue is full,
 * - asks for structured output (validated with zod), and
 * - falls back to the scripted mind on any failure, so the town never stops.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import {
  ScriptedMind,
  type ConverseRequest,
  type ConverseResult,
  type DecideRequest,
  type DecideResult,
  type Mind,
  type PlanRequest,
  type PlanResult,
  type ReactRequest,
  type ReactResult,
  type ReflectRequest,
  type ReflectResult,
} from '@agentville/core';
import { Budget, BudgetExceededError, costOf } from './budget';
import { conversePrompt, decidePrompt, planPrompt, reactPrompt, reflectPrompt } from './prompts';
import type { Store } from './store';

const QUEUE_LIMIT = 40;

export interface MindStatus {
  mind: 'claude' | 'gemini' | 'scripted';
  note: string | null;
}

interface Call<T> {
  purpose: string;
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

export class ClaudeMind implements Mind {
  private client: Anthropic;
  private scripted = new ScriptedMind();
  private running = 0;
  private queue: (() => void)[] = [];
  private lastNote: string | null = null;

  constructor(
    private opts: { routineModel: string; deepModel: string; maxConcurrent: number },
    private budget: Budget,
    private store: Store,
    private onStatus: (s: MindStatus) => void,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  async converse(req: ConverseRequest): Promise<ConverseResult> {
    // Close friends and rivals get the stronger model: those conversations matter more.
    const strong = /close friend|dislike/.test(req.feelings.join(' '));
    return this.run({ ...conversePrompt(req), model: strong ? this.opts.deepModel : this.opts.routineModel }, () => this.scripted.converse(req));
  }

  /** Big life decisions are rare and matter, so they go to the stronger model. */
  decide(req: DecideRequest): Promise<DecideResult> {
    return this.run({ ...decidePrompt(req), model: this.opts.deepModel }, () => this.scripted.decide(req));
  }

  planDay(req: PlanRequest): Promise<PlanResult> {
    return this.run({ ...planPrompt(req), model: this.opts.routineModel }, () => this.scripted.planDay(req));
  }

  reflect(req: ReflectRequest): Promise<ReflectResult> {
    return this.run({ ...reflectPrompt(req), model: this.opts.deepModel }, () => this.scripted.reflect(req));
  }

  react(req: ReactRequest): Promise<ReactResult> {
    return this.run({ ...reactPrompt(req), model: this.opts.routineModel }, () => this.scripted.react(req));
  }

  /** Make one structured call, or fall back to the scripted mind. */
  private async run<T>(call: Call<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.queue.length >= QUEUE_LIMIT) return fallback();
    try {
      this.budget.check(0.002);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        this.status('scripted', `Today's LLM budget ($${err.capUsd.toFixed(2)}) is used up. Conversations are scripted until midnight UTC.`);
        return fallback();
      }
      throw err;
    }
    await this.slot();
    try {
      const result = await this.call(call);
      this.status('claude', null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Anthropic.AuthenticationError) this.status('scripted', 'The Claude API key was rejected. Check ANTHROPIC_API_KEY.');
      else if (err instanceof Anthropic.RateLimitError) this.status('scripted', 'Claude is rate limiting the town. Some conversations are scripted for now.');
      console.warn(`[mind] ${call.purpose} failed, using the scripted mind: ${message}`);
      return fallback();
    } finally {
      this.release();
    }
  }

  private async call<T>(c: Call<T>): Promise<T> {
    const deep = c.model === this.opts.deepModel;
    const at = new Date().toISOString();
    let model = c.model;
    try {
      const res = await this.client.beta.messages.parse({
        model: c.model,
        max_tokens: c.maxTokens,
        system: c.system,
        messages: [{ role: 'user', content: c.prompt }],
        output_config: { effort: 'low', format: betaZodOutputFormat(c.schema) },
        // The stronger model gets a server-side fallback if a safety classifier declines the request.
        ...(deep ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      });
      model = res.model;
      const cost = costOf(res.model, res.usage);
      this.budget.record(cost);
      await this.store.logLlmCall({ at, purpose: c.purpose, model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costUsd: cost, ok: true });
      if (res.stop_reason === 'refusal') throw new Error('the model declined this request');
      if (res.stop_reason === 'max_tokens') throw new Error('the reply was cut off');
      if (!res.parsed_output) throw new Error('the reply did not match the expected format');
      return res.parsed_output as T;
    } catch (err) {
      if (!(err instanceof Error && /declined|cut off|expected format/.test(err.message))) {
        await this.store.logLlmCall({ at, purpose: c.purpose, model, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false, error: String(err) }).catch(() => {});
      }
      throw err;
    }
  }

  private slot(): Promise<void> {
    if (this.running < this.opts.maxConcurrent) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(() => (this.running++, resolve())));
  }

  private release(): void {
    this.running--;
    this.queue.shift()?.();
  }

  private status(mind: MindStatus['mind'], note: string | null): void {
    if (note === this.lastNote) return;
    this.lastNote = note;
    this.onStatus({ mind, note });
  }
}
