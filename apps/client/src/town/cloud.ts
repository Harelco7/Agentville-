/**
 * The free cloud mode (Vercel + Neon + Gemini). There is no always-on server, so:
 * - the first viewer becomes the host: their browser replays the time that passed since the town was last
 *   seen, then runs it live, asks Gemini (through /api/mind) for the big moments, and saves it every few seconds;
 * - anyone else who opens the site at the same time watches the host's town;
 * - when the host leaves, a watcher takes over within half a minute.
 * See apps/server/src/cloud/api.ts for the server side.
 */
import {
  BASE_SPEED,
  Engine,
  generateWorld,
  isCurrentWorld,
  ScriptedMind,
  type AgentDetail,
  type CloudJoin,
  type CloudLive,
  type CloudMindInfo,
  type CloudMindReply,
  type CloudSaveReply,
  type CloudWatch,
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
  type TownStatus,
  type WorldState,
} from '@agentville/core';
import { pushFeed, syncBuildings, useTown } from './store';

const SAVE_EVERY_S = 15;
const PING_EVERY_S = 4;
const STEP_MS = 100;
const WATCH_EVERY_MS = 1000;
/** Never replay more than this much absence; anything longer is skipped over. */
const MAX_CATCHUP_REAL_DAYS = 30;
/** Replay speed: 20x keeps meals, sleep and talk in step while a real day replays in well under a second. */
const CATCHUP_PACE = 20;
/** Gemini's free tier allows about 15 calls a minute: stay well under it. */
const MIN_GAP_MS = 5000;

const viewer = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, '').slice(0, 40);
let session = 0;

async function post<T>(path: string, body: object, timeoutMs = 15000): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ viewer, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Try the cloud endpoints. Resolves false when this site has none (local server or preview). */
export async function tryCloud(): Promise<boolean> {
  let join: CloudJoin;
  try {
    join = await post<CloudJoin>('/api/town', { action: 'join' }, 8000);
    if (join.role !== 'host' && join.role !== 'watcher') return false;
  } catch {
    return false;
  }
  start(join);
  return true;
}

function start(join: CloudJoin) {
  session++;
  if (join.role === 'host') void host(join, session);
  else watch(join.mind, session);
}

async function rejoin() {
  try {
    start(await post<CloudJoin>('/api/town', { action: 'join' }));
  } catch {
    useTown.setState({ status: { ...baseStatus(null), note: 'Lost the connection to the town. Retrying…' } });
    setTimeout(rejoin, 5000);
  }
}

function baseStatus(mind: CloudMindInfo | null, note: string | null = null): TownStatus {
  return {
    mind: mind?.enabled ? 'gemini' : 'scripted',
    note: note ?? (mind && !mind.enabled ? 'No Gemini key is set on the server, so conversations use built-in scripts.' : null),
    budget: null,
    calls: mind?.enabled ? { usedToday: mind.usedToday, dailyLimit: mind.dailyLimit } : null,
    speed: 1,
  };
}

// ---------------------------------------------------------------- host

async function host(join: Extract<CloudJoin, { role: 'host' }>, my: number) {
  // A town saved by an older version can't run on today's rules, so it starts over.
  const saved = isCurrentWorld(join.world) ? (join.world as WorldState) : null;
  const fresh = !saved;
  const world = saved ?? generateWorld(join.seed);
  const scripted = new ScriptedMind();
  let replaying = true;
  const engine = new Engine(world, { mind: scripted, onFeed: (e) => !replaying && pushFeed(e) });
  const mind = new CloudMind(join.mind, (s) => useTown.setState({ status: s }));

  useTown.setState({ mode: 'cloud', buildings: world.buildings, tick: engine.view(), tickAt: performance.now(), feed: world.feed.slice(-60), status: baseStatus(join.mind) });

  // Replay the time that passed while nobody was watching.
  const awaySeconds = !fresh && join.savedAt ? Math.max(0, (join.now - join.savedAt) / 1000) : 0;
  const replaySeconds = Math.min(awaySeconds, MAX_CATCHUP_REAL_DAYS * 86400);
  if (replaySeconds > 2) {
    const target = world.time + replaySeconds * BASE_SPEED;
    const total = target - world.time;
    engine.speed = BASE_SPEED * CATCHUP_PACE;
    let lastShown = 0;
    while (world.time < target) {
      if (my !== session) return;
      const until = performance.now() + 30;
      while (world.time < target && performance.now() < until) {
        engine.step(Math.min(0.5, (target - world.time) / engine.speed));
        // Let scripted replies (promises) land before the next step.
        for (let k = 0; k < 8 && engine.busy; k++) await null;
      }
      if (performance.now() - lastShown > 200) {
        lastShown = performance.now();
        const done = 1 - (target - world.time) / total;
        useTown.setState({ catchUp: { awaySeconds: replaySeconds, done }, tick: engine.view(), tickAt: performance.now() });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  // Anything beyond the replay limit is skipped: people simply pick up where the clock now is.
  if (awaySeconds > replaySeconds) world.time += (awaySeconds - replaySeconds) * BASE_SPEED;
  replaying = false;
  engine.speed = BASE_SPEED;
  engine.setMind(mind);
  useTown.setState({ catchUp: null, tick: engine.view(), tickAt: performance.now(), feed: world.feed.slice(-60) });
  if (replaySeconds > 60) pushFeed({ id: `catchup-${Date.now()}`, t: world.time, kind: 'plan', text: `While nobody was watching, ${describeAway(replaySeconds)} passed in town.`, agents: [] });

  // Run the town live.
  let lastSave = -Infinity;
  let lastPing = -Infinity;
  let watched = false;
  let saving = false;
  let last = performance.now();
  let sinceTick = 0;
  let sinceDetail = 0;
  const serialize = () => JSON.stringify(world);
  const live = (): string =>
    JSON.stringify({
      at: Date.now(),
      buildings: world.buildings,
      tick: engine.view(),
      feed: world.feed.slice(-40),
      details: Object.fromEntries(world.agents.map((a) => [a.id, trim(engine.detail(a.id)!)])),
      status: useTown.getState().status!,
    } satisfies CloudLive);

  const save = async (force = false) => {
    if (saving || my !== session) return;
    const now = performance.now();
    const due = force || now - lastSave >= SAVE_EVERY_S * 1000;
    // Watched: share the view every second. Otherwise a light ping every few seconds keeps the lease
    // and notices new watchers quickly.
    if (!due && !watched && now - lastPing < PING_EVERY_S * 1000) return;
    lastPing = now;
    saving = true;
    try {
      const r = await post<CloudSaveReply>('/api/town', { action: 'save', world: due ? serialize() : undefined, live: watched ? live() : undefined });
      if (due) lastSave = now;
      watched = r.watched;
      if (!r.ok && my === session) {
        // Another browser took over (for example after this tab slept): watch theirs instead.
        stop();
        void rejoin();
      }
    } catch {
      // Try again on the next beat.
    } finally {
      saving = false;
    }
  };

  const loop = setInterval(() => {
    if (my !== session) return clearInterval(loop);
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    engine.step(dt);
    sinceTick += dt;
    sinceDetail += dt;
    if (sinceTick >= 0.2) {
      sinceTick = 0;
      const tick = engine.view();
      syncBuildings(world.buildings, tick.rev);
      useTown.setState({ tick, tickAt: now });
    }
    if (sinceDetail >= 0.5) {
      sinceDetail = 0;
      const { selected } = useTown.getState();
      useTown.setState({ detail: selected ? engine.detail(selected) : null });
    }
  }, STEP_MS);
  const beat = setInterval(() => (my === session ? void save() : clearInterval(beat)), 1000);
  void save(true);

  const unsubscribe = useTown.subscribe((s, prev) => {
    if (s.selected !== prev.selected) useTown.setState({ detail: s.selected ? engine.detail(s.selected) : null });
  });

  // A hidden tab stops running timers properly, so hand the town back and pick it up again on return.
  const onHidden = () => {
    if (document.visibilityState !== 'hidden' || my !== session) return;
    const world = serialize();
    stop();
    void fetch('/api/town', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ viewer, action: 'leave', world }) }).catch(() => {});
    const back = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', back);
      void rejoin();
    };
    document.addEventListener('visibilitychange', back);
  };
  const onLeave = () => navigator.sendBeacon?.('/api/town', new Blob([JSON.stringify({ viewer, action: 'leave' })], { type: 'application/json' }));
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', onLeave);

  function stop() {
    if (my === session) session++;
    clearInterval(loop);
    clearInterval(beat);
    mind.close();
    unsubscribe();
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', onLeave);
  }
}

function trim(d: AgentDetail): AgentDetail {
  return { ...d, memories: d.memories.slice(0, 10) };
}

function describeAway(seconds: number): string {
  const simDays = (seconds * BASE_SPEED) / 1440;
  if (simDays >= 1.5) return `${Math.round(simDays)} days`;
  const hours = (seconds * BASE_SPEED) / 60;
  return hours >= 1.5 ? `${Math.round(hours)} hours` : 'about an hour';
}

// ---------------------------------------------------------------- watcher

function watch(mind: CloudMindInfo, my: number) {
  useTown.setState({ mode: 'watch', status: baseStatus(mind, 'Someone else is running the town right now. You are watching it live.') });
  let busy = false;
  const timer = setInterval(async () => {
    if (my !== session) return clearInterval(timer);
    if (busy) return;
    busy = true;
    try {
      const w = await post<CloudWatch>('/api/town', { action: 'watch' });
      if (my !== session) return;
      if (w.free) {
        clearInterval(timer);
        session++;
        void rejoin();
        return;
      }
      const l = w.live;
      if (!l) return;
      const { selected } = useTown.getState();
      syncBuildings(l.buildings, l.tick.rev);
      useTown.setState({
        tick: l.tick,
        tickAt: performance.now(),
        feed: l.feed,
        detail: selected ? l.details[selected] ?? null : null,
        status: { ...l.status, note: 'Someone else is running the town right now. You are watching it live.' },
      });
    } catch {
      // Keep the last picture and try again.
    } finally {
      busy = false;
    }
  }, WATCH_EVERY_MS);
}

// ---------------------------------------------------------------- the mind

type Kind = 'conversation' | 'plan' | 'reflection' | 'reaction' | 'decision';

/**
 * Sends the big moments to Gemini through /api/mind, one at a time and a few seconds apart, so the town stays
 * inside the free tier. Requests wait in a short queue (conversations and reactions first); anything that waits
 * too long, or can't be sent (limit reached, error), is answered by the scripted mind. The town never waits.
 */
interface Waiting {
  kind: Kind;
  req: object;
  at: number;
  resolve: (v: unknown) => void;
  fallback: () => Promise<unknown>;
}

/** How long a request may wait for its turn, in ms. People stand still while their conversation is pending. */
const MAX_WAIT: Record<Kind, number> = { conversation: 12_000, reaction: 8_000, plan: 90_000, reflection: 90_000, decision: 60_000 };
const QUEUE_LIMIT = 12;

class CloudMind implements Mind {
  private scripted = new ScriptedMind();
  private inFlight = false;
  private lastStart = -Infinity;
  private pausedUntil = 0;
  private off: string | null = null;
  private queue: Waiting[] = [];
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private info: CloudMindInfo,
    private onStatus: (s: TownStatus) => void,
  ) {
    if (!info.enabled) this.off = 'disabled';
    this.timer = setInterval(() => this.pump(), 250);
  }

  /** Stop sending; anything still waiting gets a scripted answer. */
  close() {
    clearInterval(this.timer);
    for (const w of this.queue.splice(0)) w.fallback().then(w.resolve);
  }

  converse(req: ConverseRequest): Promise<ConverseResult> {
    return this.ask('conversation', req, () => this.scripted.converse(req));
  }
  planDay(req: PlanRequest): Promise<PlanResult> {
    return this.ask('plan', req, () => this.scripted.planDay(req));
  }
  reflect(req: ReflectRequest): Promise<ReflectResult> {
    return this.ask('reflection', req, () => this.scripted.reflect(req));
  }
  react(req: ReactRequest): Promise<ReactResult> {
    return this.ask('reaction', req, () => this.scripted.react(req));
  }
  /** Big life decisions (open a business, buy a home) are rare and worth a real answer. */
  decide(req: DecideRequest): Promise<DecideResult> {
    return this.ask('decision', req, () => this.scripted.decide(req));
  }

  private usable(kind: Kind): boolean {
    const used = this.info.usedToday / Math.max(1, this.info.dailyLimit);
    // Conversations and reactions are what people see, so plans and reflections only use the first 60% of the day's calls.
    const important = kind === 'conversation' || kind === 'reaction' || kind === 'decision';
    return !this.off && used < 1 && (important || used <= 0.6);
  }

  private ask<T>(kind: Kind, req: object, fallback: () => Promise<T>): Promise<T> {
    if (!this.usable(kind) || this.queue.length >= QUEUE_LIMIT) return fallback();
    return new Promise<T>((resolve) => {
      this.queue.push({ kind, req, at: performance.now(), resolve: resolve as (v: unknown) => void, fallback });
      this.pump();
    });
  }

  private pump() {
    const now = performance.now();
    // Requests that waited too long, or can no longer be sent, get their scripted answer now.
    this.queue = this.queue.filter((w) => {
      if (now - w.at <= MAX_WAIT[w.kind] && this.usable(w.kind)) return true;
      w.fallback().then(w.resolve);
      return false;
    });
    if (this.inFlight || now < this.pausedUntil || now - this.lastStart < MIN_GAP_MS || !this.queue.length) return;
    const rank = (w: Waiting) => (w.kind === 'conversation' ? 0 : w.kind === 'reaction' ? 1 : 2);
    this.queue.sort((a, b) => rank(a) - rank(b) || a.at - b.at);
    const w = this.queue.shift()!;
    this.inFlight = true;
    this.lastStart = now;
    void this.send(w).finally(() => {
      this.inFlight = false;
    });
  }

  private async send(w: Waiting) {
    try {
      const r = await post<CloudMindReply>('/api/mind', { kind: w.kind, req: w.req }, 30000);
      this.info = { ...this.info, usedToday: r.usedToday || this.info.usedToday };
      if (r.ok) {
        this.status(null);
        return w.resolve(r.result);
      }
      if (r.reason === 'disabled' || r.reason === 'auth') {
        this.off = r.reason;
        this.status(r.reason === 'auth' ? 'The Gemini key was rejected. Check GEMINI_API_KEY in Vercel. Conversations are scripted for now.' : null, 'scripted');
      } else if (r.reason === 'daily_limit') {
        this.info = { ...this.info, usedToday: this.info.dailyLimit };
        this.status(r.message, 'scripted');
      } else if (r.reason === 'rate_limit') {
        this.pausedUntil = performance.now() + 60_000;
        this.status('Gemini asked the town to slow down. Conversations are scripted for a minute.');
      }
    } catch {
      // Network trouble: fall through to the script.
    }
    w.resolve(await w.fallback());
  }

  private status(note: string | null, mind: 'gemini' | 'scripted' = 'gemini') {
    this.onStatus({ ...baseStatus(this.info, note), mind: this.off ? 'scripted' : mind });
  }
}
