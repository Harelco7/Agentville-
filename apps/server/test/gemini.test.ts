import { describe, expect, it } from 'vitest';
import type { ConverseRequest, PersonBrief } from '@agentville/core';
import { askGemini, GeminiError } from '../src/gemini';
import { conversePrompt, planPrompt } from '../src/prompts';

const person = (name: string): PersonBrief => ({ name, age: 30, occupation: 'barista', personality: 'kind', bio: `${name} is a barista.`, plan: '', beliefs: [], memories: [], ambition: 'open a bakery', money: '$500 in savings' });
const req: ConverseRequest = {
  time: 'Monday 09:00',
  place: 'Corner Café',
  people: [person('Maya Cohen'), person('Dana Levi')],
  feelings: ['Maya sees Dana as a friend.', 'Dana sees Maya as a friend.'],
  recentTopics: [],
  maxLines: 20,
};
const reply = {
  lines: [
    { speaker: 'a', text: 'Morning!' },
    { speaker: 'b', text: 'Hi Maya.' },
  ],
  topic: 'the weather',
  tone: 'warm',
  summary: 'Maya and Dana said hello.',
  affinityChanges: [1, 1],
  memories: ['Said hi to Dana.', 'Said hi to Maya.'],
  gossip: null,
  importance: 1,
};

function fakeFetch(handler: (url: string, body: any) => { status: number; json: object }) {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    const r = handler(url, body);
    return new Response(JSON.stringify(r.json), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const ok = (obj: object) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] } });

describe('Gemini mind', () => {
  it('sends the prompt with a JSON schema and returns the validated answer', async () => {
    const { f, calls } = fakeFetch(() => ok(reply));
    const res = await askGemini(conversePrompt(req), { apiKey: 'k', model: 'gemini-test', fetch: f });
    expect(res.lines).toHaveLength(2);
    expect(calls[0].url).toContain('/models/gemini-test:generateContent');
    expect(calls[0].headers['x-goog-api-key']).toBe('k');
    expect(calls[0].body.generationConfig.responseMimeType).toBe('application/json');
    expect(calls[0].body.generationConfig.responseJsonSchema.properties.tone.enum).toContain('heated');
    expect(calls[0].body.systemInstruction.parts[0].text).toMatch(/Agentville/);
  });

  it('rejects answers in the wrong shape', async () => {
    const { f } = fakeFetch(() => ok({ plan: 42 }));
    await expect(askGemini(planPrompt({ time: 'x', person: person('Maya'), townsfolk: [] }), { apiKey: 'k', model: 'm', fetch: f })).rejects.toMatchObject({ kind: 'bad_output' });
  });

  it('reports quota and key problems', async () => {
    const quota = fakeFetch(() => ({ status: 429, json: { error: { message: 'Resource exhausted' } } }));
    await expect(askGemini(conversePrompt(req), { apiKey: 'k', model: 'm', fetch: quota.f })).rejects.toMatchObject({ kind: 'rate_limit' });
    const key = fakeFetch(() => ({ status: 400, json: { error: { message: 'API key not valid' } } }));
    await expect(askGemini(conversePrompt(req), { apiKey: 'k', model: 'm', fetch: key.f })).rejects.toBeInstanceOf(GeminiError);
  });

  it('retries without the schema when the model rejects it', async () => {
    const { f, calls } = fakeFetch((_u, body) =>
      body.generationConfig.responseJsonSchema ? { status: 400, json: { error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"' } } } : ok(reply),
    );
    const res = await askGemini(conversePrompt(req), { apiKey: 'k', model: 'm', fetch: f });
    expect(res.topic).toBe('the weather');
    expect(calls).toHaveLength(2);
    expect(calls[1].body.contents[0].parts[0].text).toMatch(/JSON Schema/);
  });
});
