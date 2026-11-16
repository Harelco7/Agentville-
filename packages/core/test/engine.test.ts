import { describe, expect, it } from 'vitest';
import { BASE_SPEED, Engine, generateWorld, isCurrentWorld, MAX_CONVERSATION_LINES, ScriptedMind, type ConverseResult, type FeedEvent } from '../src';

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

  it('builds three neighbourhoods, every kind of place, and about thirty people', () => {
    const w = generateWorld(7);
    const kinds = new Set(w.buildings.map((b) => b.kind));
    for (const k of ['cafe', 'shop', 'office', 'tech', 'park', 'townhall', 'bank', 'clinic', 'club', 'pool', 'factory', 'apartments', 'home', 'villa', 'store', 'lot']) expect(kinds).toContain(k);
    expect(new Set(w.buildings.map((b) => b.district))).toEqual(new Set(['mill', 'centre', 'hill']));
    expect(w.agents.length).toBeGreaterThanOrEqual(28);
    for (const a of w.agents) expect(w.buildings.some((b) => b.id === a.homeId)).toBe(true);
    // The founding families are still here.
    const theo = w.agents.find((a) => a.name === 'Theo' && a.surname === 'Novak')!;
    expect(theo.occupation).toBe('barista');
    expect(theo.ambition).toMatch(/bakery/);
    // Each household fits in its home.
    for (const b of w.buildings) expect(new Set(w.agents.filter((a) => a.homeId === b.id).map((a) => a.household)).size).toBeLessThanOrEqual(Math.max(b.units, 0));
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
          affinityChanges: [1, 1, 1, 1],
          memories: ['Talked a lot.', 'Talked a lot.', 'Talked a lot.', 'Talked a lot.'],
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

describe('money: nothing is free', () => {
  it('pays wages for work, charges rent every day, and keeps the broke out of the café', async () => {
    const world = generateWorld(11);
    const engine = new Engine(world, { mind: new ScriptedMind() });
    engine.speed = BASE_SPEED * 20;
    const dev = world.agents.find((a) => a.occupation === 'software developer')!;
    const broke = world.agents.find((a) => a !== dev && a.wage > 0)!;
    broke.money = -50;
    broke.pantry = 0;
    const start = dev.money;
    let cafeVisits = 0;
    const end = world.time + 3 * 1440;
    while (world.time < end) {
      engine.step(0.5);
      if (broke.activity?.kind === 'eat_out' || (broke.activity?.kind === 'socialize' && broke.activity.buildingId === 'cafe')) {
        if (broke.money < 0) cafeVisits++;
      }
      await Promise.resolve();
      await Promise.resolve();
    }
    // Three days of developer wages beat three days of rent and food.
    expect(dev.money).toBeGreaterThan(start + 100);
    expect(cafeVisits).toBe(0);
    // The broke person worked their way back up.
    expect(broke.money).toBeGreaterThan(-50);
    for (const a of world.agents) {
      expect(a.ambition.length).toBeGreaterThan(10);
      expect(engine.brief(a).money).toMatch(/\$/);
    }
  });

  it('recognises saves from before the town grew', () => {
    expect(isCurrentWorld(generateWorld(3))).toBe(true);
    expect(isCurrentWorld({ ...generateWorld(3), version: 1 })).toBe(false);
    expect(isCurrentWorld(null)).toBe(false);
  });
});
