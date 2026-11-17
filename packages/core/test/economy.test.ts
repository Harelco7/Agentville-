import { describe, expect, it } from 'vitest';
import { BASE_SPEED, CROSS_XS, Engine, generateWorld, newBusiness, route, ANCHORS, ScriptedMind, type FeedEvent, type WorldState } from '../src';

async function run(engine: Engine, simMinutes: number, stepSeconds = 0.25) {
  const end = engine.world.time + simMinutes;
  while (engine.world.time < end) {
    engine.step(stepSeconds);
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('a town of several streets', () => {
  it('routes people between streets by way of a cross street', () => {
    const w = generateWorld(1);
    const from = w.buildings.find((b) => b.street === 'linden' && b.kind === 'cafe')!;
    const to = w.buildings.find((b) => b.street === 'oak' && b.kind === 'lot' && b.x > 40)!;
    const path = route({ pos: { x: from.x, z: -14 }, inside: from, anchor: ANCHORS.cafe.front![0] }, to, ANCHORS.lot.site![0]);
    // Somewhere along the way they walk along a cross street.
    expect(path.some((p) => CROSS_XS.some((x) => Math.abs(Math.abs(p.x - x) - 4.6) < 0.01))).toBe(true);
    const last = path[path.length - 1];
    expect(Math.abs(last.z - (-64 + to.side * 14))).toBeLessThan(6);
  });
});

describe('the economy', () => {
  it('lends money and collects it back every day', async () => {
    const engine = new Engine(generateWorld(4), { mind: new ScriptedMind(), speed: BASE_SPEED * 120 });
    const a = engine.world.agents.find((x) => x.wage > 30)!;
    const before = a.money;
    engine.economy.borrow(a, 2000, 'loan', 'a test');
    expect(a.money).toBeCloseTo(before + 2000, 0);
    const owed = a.debts[0].balance;
    await run(engine, 2 * 1440);
    expect(a.debts[0].balance).toBeLessThan(owed);
  });

  it('makes rival businesses compete on price, and customers go for the better deal', async () => {
    const world: WorldState = generateWorld(8);
    const engine = new Engine(world, { mind: new ScriptedMind(), speed: BASE_SPEED * 120 });
    // A rival café opens in the vacant storefront next door, charging a lot less.
    const corner = world.buildings.find((b) => b.kind === 'cafe')!;
    const store = world.buildings.filter((b) => b.kind === 'store' && !b.business).sort((p, q) => Math.abs(p.x - corner.x) - Math.abs(q.x - corner.x))[0];
    const owner = world.agents.find((a) => a.job === 'bartender')!;
    engine.economy.openBusiness(store, owner, 'cafe', []);
    store.business!.priceFactor = 0.7;
    store.business!.quality = corner.business!.quality;
    let rivalMeals = 0;
    let cornerMeals = 0;
    const seen = new Set<string>();
    const end = world.time + 3 * 1440;
    while (world.time < end) {
      engine.step(0.25);
      await Promise.resolve();
      await Promise.resolve();
      for (const a of world.agents) {
        const act = a.activity;
        if (act?.kind !== 'eat_out' || !act.started) continue;
        const key = `${a.id}${act.until}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (act.buildingId === store.id) rivalMeals++;
        if (act.buildingId === corner.id) cornerMeals++;
      }
    }
    expect(rivalMeals).toBeGreaterThan(cornerMeals);
    // Losing customers, the Corner Café cuts its prices.
    expect(corner.business!.priceFactor).toBeLessThan(1);
  });

  it('grows over ten days: businesses open, buildings go up, people move, newcomers arrive', async () => {
    const feed: FeedEvent[] = [];
    const engine = new Engine(generateWorld(20261115), { mind: new ScriptedMind(), speed: BASE_SPEED * 240, onFeed: (e) => feed.push(e) });
    const start = engine.world.agents.length;
    await run(engine, 10 * 1440);
    const kinds = new Set(feed.map((e) => e.kind));
    for (const k of ['business', 'build', 'newcomer', 'decision', 'money', 'conversation', 'plan']) expect(kinds).toContain(k);
    expect(engine.world.agents.length).toBeGreaterThan(start);
    expect(engine.world.buildings.filter((b) => b.business).length).toBeGreaterThan(2);
    // Every big decision left a reason in the person's memories.
    for (const e of feed.filter((x) => x.kind === 'decision')) {
      const who = engine.agent(e.agents[0])!;
      expect(who.memories.some((m) => m.text.startsWith('Decided to') || m.kind === 'reflection')).toBe(true);
    }
    // The books record where the money went every day.
    const view = engine.view().economy!;
    expect(view.history.length).toBeGreaterThanOrEqual(9);
    const day = view.history[view.history.length - 1].flows;
    for (const k of ['wages', 'sales', 'rent', 'supplies'] as const) expect(day[k] ?? 0).toBeGreaterThan(0);
    const invested = view.history.reduce((s, d) => s + (d.flows.investBusiness ?? 0) + (d.flows.investHomes ?? 0) + (d.flows.investFlats ?? 0), 0);
    expect(invested).toBeGreaterThan(0);
    const books = engine.world.buildings.filter((b) => b.business?.books);
    expect(books.length).toBeGreaterThan(0);
    for (const { business } of books) {
      const k = business!.books!;
      expect(Math.abs(k.profit - (k.revenue - k.supplies - k.wages - k.rent))).toBeLessThanOrEqual(2);
    }
    // Feed events say where they happened, so the camera can fly there.
    expect(feed.filter((e) => e.kind !== 'system').every((e) => !e.agents.length || e.at)).toBe(true);
    // Nobody is anywhere strange.
    for (const a of engine.world.agents) expect(Number.isFinite(a.pos.x) && Math.abs(a.pos.z) < 100).toBe(true);
  });

  it('keeps the books for a new business', () => {
    const w = generateWorld(2);
    const b = newBusiness('bakery', w.agents[0], 1);
    expect(b.priceFactor).toBe(1);
    expect(b.quality).toBeGreaterThan(0.3);
  });
});
