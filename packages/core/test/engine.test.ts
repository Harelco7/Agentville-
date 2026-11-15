import { describe, expect, it } from 'vitest';
import { BASE_SPEED, Engine, generateWorld, MAX_CONVERSATION_LINES, ScriptedMind, type ConverseResult, type FeedEvent } from '../src';

/** Runs the engine for `simMinutes`, letting Mind promises settle between steps. */
async function run(engine: Engine, simMinutes: number, stepSeconds = 0.25) {
  const end = engine.world.time + simMinutes;
  while (engine.world.time < end) {
    engine.step(stepSeconds);
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    expect(JSON.stringify(generateWorld(42))).toBe(JSON.stringify(generateWorld(42)));
    expect(JSON.stringify(generateWorld(42))).not.toBe(JSON.stringify(generateWorld(43)));
  });

  it('builds a café, shop, office, park, homes and ten people', () => {
    const w = generateWorld(7);
    const kinds = w.buildings.map((b) => b.kind).sort();
    expect(kinds.filter((k) => k === 'home')).toHaveLength(8);
    for (const k of ['cafe', 'shop', 'office', 'park']) expect(kinds).toContain(k);
    expect(w.agents).toHaveLength(10);
    for (const a of w.agents) expect(w.buildings.some((b) => b.id === a.homeId)).toBe(true);
  });
});

describe('engine', () => {
  it('runs two days: people move, eat, sleep, plan and talk', async () => {
    const feed: FeedEvent[] = [];
    const engine = new Engine(generateWorld(1), { mind: new ScriptedMind(), speed: BASE_SPEED * 120, onFeed: (e) => feed.push(e) });
    await run(engine, 2 * 1440);
    const kinds = new Set(feed.map((e) => e.kind));
    expect(kinds.has('conversation')).toBe(true);
    expect(kinds.has('plan')).toBe(true);
    for (const a of engine.world.agents) {
      expect(Number.isFinite(a.pos.x) && Number.isFinite(a.pos.z)).toBe(true);
      for (const v of Object.values(a.needs)) expect(v).toBeGreaterThanOrEqual(0);
      expect(a.memories.length).toBeGreaterThan(0);
    }
    // Nobody starves: the routine keeps hunger and energy in a sane range for most people.
    const hungry = engine.world.agents.filter((a) => a.needs.hunger < 5).length;
    expect(hungry).toBeLessThanOrEqual(2);
  });

  it('cuts conversations at 20 lines', async () => {
    class Chatty extends ScriptedMind {
      async converse(): Promise<ConverseResult> {
        return {
          lines: Array.from({ length: 50 }, (_, i) => ({ speaker: i % 2 ? 'b' : 'a', text: `Line ${i}` })),
          topic: 'everything',
          tone: 'friendly',
          summary: 'A long chat.',
          aAffinityChange: 1,
          bAffinityChange: 1,
          aMemory: 'Talked a lot.',
          bMemory: 'Talked a lot.',
          gossip: null,
          importance: 2,
        };
      }
    }
    const engine = new Engine(generateWorld(3), { mind: new Chatty(), speed: BASE_SPEED * 120 });
    let longest = 0;
    const end = engine.world.time + 1440;
    while (engine.world.time < end) {
      engine.step(0.25);
      await Promise.resolve();
      for (const c of engine.world.conversations) longest = Math.max(longest, c.lines.length);
    }
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(MAX_CONVERSATION_LINES);
  });

  it('keeps running when the mind fails', async () => {
    const errors: string[] = [];
    const broken = new ScriptedMind();
    broken.converse = () => Promise.reject(new Error('offline'));
    const engine = new Engine(generateWorld(5), { mind: broken, speed: BASE_SPEED * 120, onMindError: (w) => errors.push(w) });
    await run(engine, 1440);
    expect(errors).toContain('conversation');
    expect(engine.world.agents.every((a) => a.conversationId === null || engine.world.conversations.some((c) => c.id === a.conversationId))).toBe(true);
  });

  it('survives a save and load', async () => {
    const engine = new Engine(generateWorld(9), { mind: new ScriptedMind(), speed: BASE_SPEED * 120 });
    await run(engine, 600);
    const saved = JSON.parse(JSON.stringify(engine.world));
    const restored = new Engine(saved, { mind: new ScriptedMind(), speed: BASE_SPEED * 120 });
    await run(restored, 600);
    expect(restored.world.time).toBeGreaterThan(engine.world.time);
  });
});
