import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { ConverseRequest, PersonBrief } from '@agentville/core';
import { Budget } from '../src/budget';
import { ClaudeMind, type MindStatus } from '../src/claudeMind';
import type { LlmCallRecord, Store } from '../src/store';

const person = (name: string): PersonBrief => ({
  name,
  age: 30,
  occupation: 'barista',
  personality: 'outgoing and kind',
  bio: `${name} is a barista.`,
  plan: '',
  beliefs: [],
  memories: [],
});
const req: ConverseRequest = {
  time: 'Monday 09:00, day 1 of year 1',
  place: 'Corner Café',
  a: person('Maya Cohen'),
  b: person('Dana Levi'),
  aAboutB: 'Maya sees Dana as a friend.',
  bAboutA: 'Dana sees Maya as a friend.',
  recentTopics: [],
  maxLines: 20,
};

class MemoryStore implements Store {
  readonly kind = 'memory';
  calls: LlmCallRecord[] = [];
  async init() {}
  async loadWorld() {
    return null;
  }
  async saveWorld() {}
  async appendEvent() {}
  async logLlmCall(r: LlmCallRecord) {
    this.calls.push(r);
  }
  async spentOn() {
    return 0;
  }
  async close() {}
}

/** A stand-in for the SDK client that returns a fixed parsed reply. */
function fakeClient(reply: object, usage = { input_tokens: 1200, output_tokens: 400 }, seen: object[] = []) {
  return {
    beta: {
      messages: {
        parse: async (params: object) => {
          seen.push(params);
          return { model: (params as { model: string }).model, usage, stop_reason: 'end_turn', parsed_output: reply };
        },
      },
    },
  } as unknown as Anthropic;
}

const conversation = {
  lines: [
    { speaker: 'a', text: 'Morning!' },
    { speaker: 'b', text: 'Morning, Maya.' },
  ],
  topic: 'coffee',
  tone: 'friendly',
  summary: 'Maya and Dana said good morning.',
  aAffinityChange: 1,
  bAffinityChange: 1,
  aMemory: 'Said hi to Dana.',
  bMemory: 'Said hi to Maya.',
  gossip: null,
  importance: 1,
};

describe('ClaudeMind', () => {
  it('returns the parsed conversation and records its cost against the budget', async () => {
    const store = new MemoryStore();
    const budget = new Budget(84);
    const seen: object[] = [];
    const mind = new ClaudeMind({ routineModel: 'claude-haiku-5-5', deepModel: 'claude-sonnet-5-5', maxConcurrent: 2 }, budget, store, () => {}, fakeClient(conversation, undefined, seen));
    const res = await mind.converse(req);
    expect(res.summary).toBe('Maya and Dana said good morning.');
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].model).toBe('claude-haiku-5-5');
    // 1200 input + 400 output tokens on Haiku 5.5: $0.00012 + $0.0002
    expect(budget.spentTodayUsd).toBeCloseTo(0.00032, 6);
    expect((seen[0] as { output_config: { effort: string } }).output_config.effort).toBe('low');
  });

  it('uses the stronger model with a fallback for close friends', async () => {
    const seen: object[] = [];
    const mind = new ClaudeMind({ routineModel: 'claude-haiku-5-5', deepModel: 'claude-sonnet-5-5', maxConcurrent: 2 }, new Budget(84), new MemoryStore(), () => {}, fakeClient(conversation, undefined, seen));
    await mind.converse({ ...req, aAboutB: 'Maya sees Dana as a close friend.' });
    expect(seen[0]).toMatchObject({ model: 'claude-sonnet-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
  });

  it('switches to scripted conversations when the daily cap is reached', async () => {
    const statuses: MindStatus[] = [];
    const budget = new Budget(7); // $1 a day
    budget.record(1);
    const seen: object[] = [];
    const mind = new ClaudeMind({ routineModel: 'claude-haiku-5-5', deepModel: 'claude-sonnet-5-5', maxConcurrent: 2 }, budget, new MemoryStore(), (s) => statuses.push(s), fakeClient(conversation, undefined, seen));
    const res = await mind.converse(req);
    expect(seen).toHaveLength(0);
    expect(res.lines.length).toBeGreaterThan(0);
    expect(statuses.at(-1)?.mind).toBe('scripted');
  });

  it('falls back to the scripted mind when the API call fails', async () => {
    const failing = { beta: { messages: { parse: async () => Promise.reject(new Error('network down')) } } } as unknown as Anthropic;
    const store = new MemoryStore();
    const mind = new ClaudeMind({ routineModel: 'claude-haiku-5-5', deepModel: 'claude-sonnet-5-5', maxConcurrent: 2 }, new Budget(84), store, () => {}, failing);
    const res = await mind.converse(req);
    expect(res.lines.length).toBeGreaterThan(0);
    expect(store.calls[0].ok).toBe(false);
  });
});

describe('Budget', () => {
  it('splits the weekly budget into 7 daily caps', () => {
    expect(new Budget(84).dailyCapUsd).toBe(12);
  });
});
