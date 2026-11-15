/**
 * Google Gemini as the town's mind. Used for the free setup: Gemini's free tier needs no credit card,
 * and a key made in a Google project without billing can never cost money.
 *
 * Calls the REST API directly (one fetch, no SDK), asks for JSON in the answer's shape,
 * and validates it with zod before the town sees it.
 */
import { z } from 'zod';
import type { Prompt } from './prompts';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 25_000;

export interface GeminiOptions {
  apiKey: string;
  model: string;
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
    res = await doFetch(`${API}/${encodeURIComponent(opts.model)}:generateContent`, {
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
