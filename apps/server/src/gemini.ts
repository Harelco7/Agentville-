/**
 * Google Gemini as the town's mind. Used for the free setup: Gemini's free tier needs no credit card,
 * and a key made in a Google project without billing can never cost money.
 *
 * Calls the REST API directly (one fetch, no SDK), asks for JSON in the answer's shape,
 * and validates it with zod before the town sees it.
 */
import { z } from 'zod';
import {
  ScriptedMind,
  type ConverseRequest,
  type ConverseResult,
  type Mind,
  type PlanRequest,
  type PlanResult,
  type ReactRequest,
  type ReactResult,
  type ReflectRequest,
  type ReflectResult,
} from '@agentville/core';
import { conversePrompt, planPrompt, reactPrompt, reflectPrompt, type Prompt } from './prompts';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 25_000;

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Only for testing against a stand-in server. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Why a Gemini call failed, in a form the caller can act on. */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate_limit' | 'bad_output' | 'blocked' | 'unavailable',
  ) {
    super(message);
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/** The answer's shape as JSON Schema, in the form Gemini accepts. */
function jsonSchema(schema: z.ZodType): object {
  const s = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/** Ask Gemini one structured question. Throws GeminiError on any failure. */
export async function askGemini<T>(p: Prompt<T>, opts: GeminiOptions): Promise<T> {
  try {
    return await callOnce(p, opts, true);
  } catch (err) {
    // Some models accept fewer schema features. Try once more with the shape written into the prompt instead.
    if (err instanceof GeminiError && err.kind === 'unavailable' && /schema|invalid json payload|invalid argument/i.test(err.message)) {
      return callOnce(p, opts, false);
    }
    throw err;
  }
}

async function callOnce<T>(p: Prompt<T>, opts: GeminiOptions, withSchema: boolean): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  const schema = jsonSchema(p.schema);
  const body = {
    systemInstruction: { parts: [{ text: p.system }] },
    contents: [{ role: 'user', parts: [{ text: withSchema ? p.prompt : `${p.prompt}\n\nAnswer with only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(withSchema ? { responseJsonSchema: schema } : {}),
      maxOutputTokens: p.maxTokens,
      temperature: 1,
    },
  };
  let res: Response;
  try {
    res = await doFetch(`${opts.baseUrl ?? API}/${encodeURIComponent(opts.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new GeminiError(`Gemini could not be reached: ${err instanceof Error ? err.message : err}`, 'unavailable');
  }
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 429) throw new GeminiError(`Gemini's free quota is used up for now: ${msg}`, 'rate_limit');
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(msg))) throw new GeminiError(`The Gemini API key was rejected: ${msg}`, 'auth');
    throw new GeminiError(`Gemini returned an error: ${msg}`, 'unavailable');
  }
  if (data.promptFeedback?.blockReason) throw new GeminiError(`Gemini declined the request (${data.promptFeedback.blockReason})`, 'blocked');
  const cand = data.candidates?.[0];
  if (cand?.finishReason === 'MAX_TOKENS') throw new GeminiError('The reply was cut off', 'bad_output');
  if (cand?.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(cand.finishReason)) {
    throw new GeminiError(`Gemini stopped early (${cand.finishReason})`, 'blocked');
  }
  const text = (cand?.content?.parts ?? [])
    .filter((x) => !x.thought && x.text)
    .map((x) => x.text)
    .join('');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GeminiError('The reply was not valid JSON', 'bad_output');
  }
  const parsed = p.schema.safeParse(json);
  if (!parsed.success) throw new GeminiError(`The reply did not match the expected format: ${parsed.error.message.slice(0, 200)}`, 'bad_output');
  return parsed.data;
}

/**
 * Gemini as a Mind for the always-on server (LLM_PROVIDER=gemini). One call at a time, a few seconds apart,
 * and at most `dailyCalls` a day (UTC), so it stays inside the free tier. Anything else gets the scripted mind.
 */
export class GeminiMind implements Mind {
  private scripted = new ScriptedMind();
  private busy = false;
  private last = 0;
  private day = '';
  private used = 0;
  private pausedUntil = 0;

  constructor(
    private opts: GeminiOptions & { dailyCalls: number; minGapMs?: number },
    private onStatus: (note: string | null) => void = () => {},
  ) {}

  get usedToday() {
    return this.used;
  }

  converse(req: ConverseRequest): Promise<ConverseResult> {
    return this.ask(conversePrompt(req), true, () => this.scripted.converse(req));
  }
  planDay(req: PlanRequest): Promise<PlanResult> {
    return this.ask(planPrompt(req), false, () => this.scripted.planDay(req));
  }
  reflect(req: ReflectRequest): Promise<ReflectResult> {
    return this.ask(reflectPrompt(req), false, () => this.scripted.reflect(req));
  }
  react(req: ReactRequest): Promise<ReactResult> {
    return this.ask(reactPrompt(req), true, () => this.scripted.react(req));
  }

  private async ask<T>(p: Prompt<T>, important: boolean, fallback: () => Promise<T>): Promise<T> {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    const now = Date.now();
    const share = this.used / Math.max(1, this.opts.dailyCalls);
    if (this.busy || now < this.pausedUntil || now - this.last < (this.opts.minGapMs ?? 5000) || share >= 1 || (!important && share > 0.6)) return fallback();
    this.busy = true;
    this.last = now;
    this.used++;
    try {
      const r = await askGemini(p, this.opts);
      this.onStatus(null);
      return r;
    } catch (err) {
      if (err instanceof GeminiError && err.kind === 'rate_limit') {
        this.pausedUntil = Date.now() + 60_000;
        this.onStatus('Gemini asked the town to slow down. Conversations are scripted for a minute.');
      } else if (err instanceof GeminiError && err.kind === 'auth') {
        this.pausedUntil = Infinity;
        this.onStatus('The Gemini API key was rejected. Check GEMINI_API_KEY.');
      }
      console.warn(`[mind] ${p.purpose} failed, using the scripted mind: ${err instanceof Error ? err.message : err}`);
      return fallback();
    } finally {
      this.busy = false;
    }
  }
}
