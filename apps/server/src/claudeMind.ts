/**
 * The Claude-backed mind. Every call goes through one gateway that:
 * - checks the daily budget before calling, and logs the real cost after,
 * - limits how many calls run at once and drops work when the queue is full,
 * - asks for structured output (validated with zod), and
 * - falls back to the scripted mind on any failure, so the town never stops.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import {
  MAX_CONVERSATION_LINES,
  ScriptedMind,
  type ConverseRequest,
  type ConverseResult,
  type Mind,
  type PersonBrief,
  type PlanRequest,
  type PlanResult,
  type ReactRequest,
  type ReactResult,
  type ReflectRequest,
  type ReflectResult,
} from '@agentville/core';
import { Budget, BudgetExceededError, costOf } from './budget';
import type { Store } from './store';

const QUEUE_LIMIT = 40;

const ConversationSchema = z.object({
  lines: z.array(z.object({ speaker: z.enum(['a', 'b']), text: z.string() })),
  topic: z.string(),
  tone: z.enum(['warm', 'friendly', 'neutral', 'tense', 'heated']),
  summary: z.string(),
  aAffinityChange: z.number().int(),
  bAffinityChange: z.number().int(),
  aMemory: z.string(),
  bMemory: z.string(),
  gossip: z.string().nullable(),
  importance: z.number().int(),
});
const PlanSchema = z.object({ plan: z.string(), wantsToSee: z.string().nullable() });
const ReflectSchema = z.object({ beliefs: z.array(z.string()) });
const ReactSchema = z.object({ line: z.string(), memory: z.string() });

const TOWN = `Agentville is a small, peaceful simulated town on Linden Street, with homes, the Corner Café, Maple Grocery, the Town Works Office and Linden Park. Its residents are ordinary adults with jobs, habits, moods and relationships. Everything is written in plain, modern English. Content stays family-friendly: no violence, crime, drugs or romance beyond friendship. Never invent events that would change the town (deaths, moving away, new buildings); small personal news is fine.`;

const CONVERSE_SYSTEM = `${TOWN}

You write one conversation between two residents who have just run into each other. Make it feel real:
- Stay true to each person's personality, plan for the day, beliefs, memories and how they feel about each other.
- Not every chat is pleasant or important. People can be warm, awkward, distracted, funny, annoyed or curious.
- They may bring up things they remember, including news they heard about other residents. This is how gossip spreads.
- Each line is one or two short spoken sentences. The conversation has between 4 and ${MAX_CONVERSATION_LINES} lines, then ends naturally. No repeated goodbyes, no loops.
- Avoid the listed recent topics unless something new happened.

Then report what came of it:
- topic: a few words, e.g. "the café's new menu".
- tone: warm, friendly, neutral, tense or heated.
- summary: one sentence for the town news feed, naming both people.
- aAffinityChange and bAffinityChange: how much each person's feeling toward the other changed, from -10 to 10. Most chats move it by 0 to 3.
- aMemory and bMemory: one sentence each that the person will remember.
- gossip: a short piece of news a bystander might repeat, written as a statement, or null if there is none.
- importance: 1 for small talk up to 10 for something life changing.`;

const PLAN_SYSTEM = `${TOWN}

You decide what one resident intends to do today. Base it on their personality, job, beliefs and recent memories. Answer with:
- plan: one sentence in the first person, at most 25 words.
- wantsToSee: the first name of one resident from the list they would like to see today, or null.`;

const REFLECT_SYSTEM = `${TOWN}

At the end of the day, a resident thinks back on recent memories. Write up to 3 lasting beliefs or lessons they take away, in the first person, at most 15 words each. Only include beliefs that the memories support.`;

const REACT_SYSTEM = `${TOWN}

A resident has just noticed something nearby. Write:
- line: what they say out loud, one short sentence (at most 15 words), true to their personality and feelings.
- memory: one sentence they will remember about it.`;

function person(p: PersonBrief, label: string): string {
  return [
    `${label}: ${p.name}, ${p.age}, ${p.occupation}. ${p.bio}`,
    `Personality: ${p.personality}.`,
    p.plan ? `Plan for today: ${p.plan}` : '',
    p.beliefs.length ? `Beliefs: ${p.beliefs.join(' ')}` : '',
    p.memories.length ? `Memories (oldest first):\n${p.memories.map((m) => `- ${m}`).join('\n')}` : 'Memories: none yet.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface MindStatus {
  mind: 'claude' | 'scripted';
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
    const strong = /close friend|dislike/.test(req.aAboutB + req.bAboutA);
    const prompt = [
      `Time: ${req.time}. Place: ${req.place}.`,
      person(req.a, 'Person A'),
      req.aAboutB,
      person(req.b, 'Person B'),
      req.bAboutA,
      req.recentTopics.length ? `Recent topics between them: ${req.recentTopics.join('; ')}.` : '',
      `Write their conversation (speaker "a" is ${req.a.name}, "b" is ${req.b.name}), at most ${req.maxLines} lines.`,
    ]
      .filter(Boolean)
      .join('\n\n');
    return this.run(
      { purpose: 'conversation', model: strong ? this.opts.deepModel : this.opts.routineModel, system: CONVERSE_SYSTEM, prompt, schema: ConversationSchema, maxTokens: 6000 },
      () => this.scripted.converse(req),
    );
  }

  planDay(req: PlanRequest): Promise<PlanResult> {
    const prompt = `Time: ${req.time}.\n\n${person(req.person, 'Resident')}\n\nResidents they know:\n${req.townsfolk.map((t) => `- ${t}`).join('\n')}`;
    return this.run({ purpose: 'plan', model: this.opts.routineModel, system: PLAN_SYSTEM, prompt, schema: PlanSchema, maxTokens: 3000 }, () =>
      this.scripted.planDay(req),
    );
  }

  reflect(req: ReflectRequest): Promise<ReflectResult> {
    return this.run(
      { purpose: 'reflection', model: this.opts.deepModel, system: REFLECT_SYSTEM, prompt: person(req.person, 'Resident'), schema: ReflectSchema, maxTokens: 4000 },
      () => this.scripted.reflect(req),
    );
  }

  react(req: ReactRequest): Promise<ReactResult> {
    const prompt = `Time: ${req.time}. Place: ${req.place}.\n\n${person(req.witness, 'Resident')}\n\n${req.feelings.join('\n')}\n\nThey just noticed: ${req.observed}.`;
    return this.run({ purpose: 'reaction', model: this.opts.routineModel, system: REACT_SYSTEM, prompt, schema: ReactSchema, maxTokens: 2000 }, () =>
      this.scripted.react(req),
    );
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
