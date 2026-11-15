/**
 * The town simulation. It advances the clock, runs each agent's needs and daily routine (utility AI),
 * moves people along the street, and asks the Mind for the big moments: conversations, plans, reflections
 * and reactions. It never waits for the Mind: requests resolve in the background while the town keeps going.
 */
import { BASE_SPEED, clockText, dayOf, hourOf, isWeekend, longTime, minuteOfDay, MINUTES_PER_DAY, partOfDay, weekdayOf } from './clock';
import { ANCHORS, type Anchor, type AnchorGroup, route, toWorld, toWorldFacing } from './layout';
import { MAX_CONVERSATION_LINES, type Mind, type PersonBrief } from './mind';
import { Rng } from './rng';
import type { AgentDetail } from './protocol';
import type { ActionKind, AgentState, AgentView, Building, Conversation, FeedEvent, FeedKind, Memory, MemoryKind, NeedKey, TickView, WorldState } from './types';
import { personalityText } from './worldgen';

const WALK_SPEED = 1.35; // metres per real second at 1x
const LINE_SECONDS = 3.4; // real seconds each spoken line stays up
const AGENT_TALK_COOLDOWN = 45; // sim minutes between conversations for one person
const PAIR_TALK_COOLDOWN = 180; // sim minutes before the same two people talk again
const HEARING_DISTANCE = 9; // metres
const MAX_MEMORIES = 80;
const MAX_FEED = 200;

/** Need change per sim minute: decay while awake, and gains from activities. */
const DECAY: Record<NeedKey, number> = { hunger: -0.1, energy: -0.065, social: -0.05, fun: -0.045, hygiene: -0.04 };
const GAINS: Partial<Record<ActionKind, Partial<Record<NeedKey, number>>>> = {
  sleep: { energy: 0.24, hunger: 0.06 },
  eat_home: { hunger: 2.2 },
  eat_out: { hunger: 2.0, social: 0.25, fun: 0.25 },
  socialize: { social: 0.45, fun: 0.2 },
  relax: { fun: 0.55, energy: 0.03 },
  wash: { hygiene: 3.5 },
  shop: { fun: 0.15 },
  work: { fun: -0.01, social: 0.04 },
};

interface Choice {
  kind: ActionKind;
  building: Building;
  group: AnchorGroup;
  duration: number;
  label: string;
  score: number;
}

export interface EngineEvents {
  /** A new line in the town feed. */
  onFeed?: (e: FeedEvent) => void;
  /** A Mind call failed (network, budget, bad output). The engine carries on without it. */
  onMindError?: (what: string, err: unknown) => void;
}

export interface EngineOptions extends EngineEvents {
  mind: Mind;
  /** Sim minutes per real second. Defaults to 1x. */
  speed?: number;
}

export class Engine {
  readonly world: WorldState;
  speed: number;
  private mind: Mind;
  private rng: Rng;
  private events: EngineEvents;
  private buildings = new Map<string, Building>();
  private agents = new Map<string, AgentState>();
  private wantsToSee = new Map<string, string>();
  private pending = 0;

  constructor(world: WorldState, opts: EngineOptions) {
    this.world = world;
    this.mind = opts.mind;
    this.speed = opts.speed ?? BASE_SPEED;
    this.events = opts;
    this.rng = new Rng(world);
    for (const b of world.buildings) this.buildings.set(b.id, b);
    for (const a of world.agents) this.agents.set(a.id, a);
    // Conversations that were waiting on the Mind when the world was saved can't resume.
    world.conversations = world.conversations.filter((c) => c.status === 'playing');
    for (const a of world.agents) {
      if (a.conversationId && !world.conversations.some((c) => c.id === a.conversationId)) {
        a.conversationId = null;
        a.speaking = null;
      }
    }
  }

  /** Number of Mind requests in flight. */
  get busy(): number {
    return this.pending;
  }

  setMind(mind: Mind): void {
    this.mind = mind;
  }

  /** Advance the town by `realDt` real seconds. */
  step(realDt: number): void {
    const dt = Math.min(realDt, 0.5);
    const simDt = dt * this.speed;
    const pace = this.speed / BASE_SPEED;
    this.world.time += simDt;

    for (const a of this.world.agents) this.updateAgent(a, dt, simDt, pace);
    this.findConversations(simDt);
    // A conversation takes the same sim time at any speed (about half an hour for eight lines).
    this.playConversations(dt * pace);
    this.tickTimers(dt);
  }

  // ---------------------------------------------------------------- agents

  private updateAgent(a: AgentState, dt: number, simDt: number, pace: number): void {
    const act = a.activity;
    const sleeping = act?.kind === 'sleep' && act.started;
    for (const key of Object.keys(a.needs) as NeedKey[]) {
      let d = sleeping && key === 'energy' ? 0 : DECAY[key];
      if (sleeping && key !== 'energy') d *= 0.4;
      if (act?.started) d += GAINS[act.kind]?.[key] ?? 0;
      a.needs[key] = clamp(a.needs[key] + d * simDt, 0, 100);
    }

    // Mornings: make a plan for the day.
    const today = dayOf(this.world.time);
    if (a.lastPlanDay < today && hourOf(this.world.time) >= 6 && !sleeping) {
      a.lastPlanDay = today;
      this.requestPlan(a);
    }

    if (a.conversationId) return; // standing and talking

    if (a.path.length) {
      this.walk(a, dt * WALK_SPEED * pace);
      if (!a.path.length && act && !act.started) {
        act.started = true;
        act.until = this.world.time + act.duration;
        if (act.kind === 'sleep') this.maybeReflect(a);
      }
      return;
    }

    if (!act || (act.started && this.world.time >= act.until)) {
      a.activity = null;
      this.choose(a);
    }
  }

  private walk(a: AgentState, distance: number): void {
    let left = distance;
    while (left > 0 && a.path.length) {
      const target = a.path[0];
      const dx = target.x - a.pos.x;
      const dz = target.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) a.facing = Math.atan2(dx, dz);
      if (d <= left) {
        a.pos = { x: target.x, z: target.z };
        a.path.shift();
        left -= d;
      } else {
        a.pos = { x: a.pos.x + (dx / d) * left, z: a.pos.z + (dz / d) * left };
        left = 0;
      }
      // Leaving or entering a building as the agent passes its front door.
      if (a.inside && Math.abs(a.pos.z) < 9.4) a.inside = null;
    }
    if (!a.path.length && a.activity) {
      a.inside = this.buildings.get(a.activity.buildingId)?.kind === 'park' ? null : a.activity.buildingId;
      const b = this.buildings.get(a.activity.buildingId);
      const anchor = b && this.anchorOf(b, a);
      if (b && anchor) a.facing = toWorldFacing(b, anchor.facing);
    }
  }

  private anchorOf(b: Building, a: AgentState): Anchor | null {
    const group = groupOf(a.activity?.kind ?? 'idle', b);
    const list = ANCHORS[b.kind][group];
    return list ? list[a.anchor % list.length] : null;
  }

  /** Utility AI: score every sensible activity from needs, time of day and personality, then pick the best. */
  private choose(a: AgentState): void {
    const t = this.world.time;
    const h = hourOf(t);
    const weekend = isWeekend(t);
    const home = this.buildings.get(a.homeId)!;
    const cafe = this.firstOf('cafe');
    const park = this.firstOf('park');
    const shop = this.firstOf('shop');
    const work = a.workId ? this.buildings.get(a.workId)! : null;
    const n = a.needs;
    const tr = a.traits;
    const deficit = (k: NeedKey) => (100 - n[k]) / 100;
    const night = h >= 22 || h < 6;
    const meal = (h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 18 && h < 20.5);
    const daytime = h >= 8 && h < 21;
    const choices: Choice[] = [];
    const add = (c: Omit<Choice, 'score'>, score: number) => choices.push({ ...c, score: score + this.rng.range(-0.06, 0.06) });

    const wake = 6.5 + tr.conscientiousness * -0.6 + this.rng.range(0, 1);
    const minutesToWake = ((wake * 60 - minuteOfDay(t) + MINUTES_PER_DAY) % MINUTES_PER_DAY) || 60;
    add(
      { kind: 'sleep', building: home, group: 'bed', duration: night || h >= 21 ? minutesToWake : 90, label: `sleeping at home` },
      night ? 1.2 + deficit('energy') : h >= 21 ? 0.5 + deficit('energy') : deficit('energy') > 0.8 ? 0.9 : 0,
    );

    if (work && !weekend && h >= 8.5 && h < 16.5) {
      const end = h < 12.5 ? 12.5 : 17;
      const group: AnchorGroup = work.kind === 'park' ? 'bench' : work.kind === 'office' ? 'back' : 'counter';
      add({ kind: 'work', building: work, group, duration: (end - h) * 60, label: `working at ${work.name}` }, 1.0 + 0.4 * tr.conscientiousness);
    } else if (!work && a.occupation.includes('from home') && !weekend && h >= 9 && h < 16) {
      add({ kind: 'work', building: home, group: 'dining', duration: 120, label: 'working from home' }, 0.75 + 0.4 * tr.conscientiousness);
    }

    const hunger = Math.pow(deficit('hunger'), 1.4) * 1.5 + (meal ? 0.3 : 0);
    add({ kind: 'eat_home', building: home, group: 'dining', duration: 35, label: 'having a meal at home' }, hunger * (1.1 - tr.extraversion * 0.4));
    if (cafe && daytime) add({ kind: 'eat_out', building: cafe, group: 'front', duration: 50, label: `eating at ${cafe.name}` }, hunger * (0.6 + tr.extraversion * 0.6) + deficit('social') * 0.25);

    const wanted = this.wantsToSee.get(a.id);
    const socialPull = deficit('social') * (0.5 + 0.9 * tr.extraversion) + (wanted ? 0.15 : 0);
    if (cafe && daytime) add({ kind: 'socialize', building: cafe, group: 'front', duration: 60, label: `meeting people at ${cafe.name}` }, socialPull);
    if (park && h >= 7 && h < 20) add({ kind: 'socialize', building: park, group: 'bench', duration: 50, label: `hanging out in ${park.name}` }, socialPull * 0.9);

    add({ kind: 'relax', building: home, group: 'sofa', duration: 60, label: 'relaxing at home' }, deficit('fun') * 0.8 + (h >= 19 ? 0.15 : 0));
    if (park && h >= 7 && h < 20) add({ kind: 'relax', building: park, group: 'bench', duration: 45, label: `taking a walk in ${park.name}` }, deficit('fun') * (0.55 + tr.openness * 0.5));
    add({ kind: 'wash', building: home, group: 'bed', duration: 20, label: 'freshening up at home' }, deficit('hygiene') * 1.1 + (h >= 6.5 && h < 8.5 ? 0.25 : 0));
    if (shop && h >= 9 && h < 19) add({ kind: 'shop', building: shop, group: 'front', duration: 25, label: `buying groceries at ${shop.name}` }, 0.18 + deficit('hunger') * 0.25);
    add({ kind: 'idle', building: home, group: 'sofa', duration: 30, label: 'pottering about at home' }, 0.12);

    choices.sort((x, y) => y.score - x.score);
    this.start(a, choices[0]);
  }

  private start(a: AgentState, c: Choice): void {
    const fromBuilding = a.inside ? this.buildings.get(a.inside) ?? null : null;
    const fromAnchor = fromBuilding ? this.currentAnchor(a, fromBuilding) : null;
    const list = ANCHORS[c.building.kind][c.group] ?? [];
    a.anchor = this.pickAnchor(c.building, c.group, a);
    const anchor = list[a.anchor % list.length];
    a.activity = { kind: c.kind, buildingId: c.building.id, until: 0, duration: c.duration, label: c.label, started: false };
    a.path = anchor ? route({ pos: a.pos, inside: fromBuilding, anchor: fromAnchor }, c.building, anchor) : [];
    if (!a.path.length) {
      a.activity.started = true;
      a.activity.until = this.world.time + c.duration;
    }
  }

  /** The spot the agent is standing on: the closest anchor in the building. */
  private currentAnchor(a: AgentState, b: Building): Anchor | null {
    let best: Anchor | null = null;
    let bestD = Infinity;
    for (const list of Object.values(ANCHORS[b.kind])) {
      for (const an of list ?? []) {
        const p = toWorld(b, an);
        const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
        if (d < bestD) {
          bestD = d;
          best = an;
        }
      }
    }
    return best;
  }

  /** Pick a free spot in the group, so two people don't stand on the same chair. */
  private pickAnchor(b: Building, group: AnchorGroup, a: AgentState): number {
    const list = ANCHORS[b.kind][group] ?? [];
    const taken = new Set(
      this.world.agents.filter((o) => o !== a && o.activity?.buildingId === b.id && groupOf(o.activity.kind, b) === group).map((o) => o.anchor % Math.max(list.length, 1)),
    );
    const free = list.map((_, i) => i).filter((i) => !taken.has(i));
    return free.length ? this.rng.pick(free) : this.rng.int(0, Math.max(list.length - 1, 0));
  }

  private firstOf(kind: Building['kind']): Building | undefined {
    return this.world.buildings.find((b) => b.kind === kind);
  }

  // ---------------------------------------------------------------- conversations

  private available(a: AgentState): boolean {
    const act = a.activity;
    return !a.conversationId && !a.path.length && !!act?.started && act.kind !== 'sleep' && act.kind !== 'wash' && this.world.time - a.lastConversation > AGENT_TALK_COOLDOWN;
  }

  private findConversations(simDt: number): void {
    const people = this.world.agents.filter((a) => this.available(a));
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i];
        const b = people[j];
        if (a.conversationId || b.conversationId) continue;
        if (a.activity!.buildingId !== b.activity!.buildingId) continue;
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 8) continue;
        const rel = a.relationships[b.id];
        if (rel?.lastTalk != null && this.world.time - rel.lastTalk < PAIR_TALK_COOLDOWN) continue;
        // Chance per sim minute: driven by how lonely and outgoing they are, and whether they wanted to meet.
        const working = a.activity!.kind === 'work' || b.activity!.kind === 'work';
        const want = this.wantsToSee.get(a.id) === b.id || this.wantsToSee.get(b.id) === a.id;
        const drive = ((100 - a.needs.social) + (100 - b.needs.social)) / 200;
        const outgoing = (a.traits.extraversion + b.traits.extraversion) / 2;
        const sameHome = a.homeId === b.homeId;
        let p = (0.02 + drive * 0.08) * (0.6 + outgoing) * (working ? 0.35 : 1) * (want ? 3 : 1) * (sameHome ? 0.3 : 1);
        if ((rel?.affinity ?? 0) < -30) p *= 0.4;
        if (this.rng.next() < 1 - Math.pow(1 - p, simDt)) this.startConversation(a, b);
      }
    }
  }

  private startConversation(a: AgentState, b: AgentState): void {
    const id = `c${this.world.nextId++}`;
    const place = this.buildings.get(a.activity!.buildingId)!;
    const convo: Conversation = {
      id,
      participants: [a.id, b.id],
      buildingId: place.id,
      startedAt: this.world.time,
      status: 'pending',
      lines: [],
      lineIndex: 0,
      lineTimer: 0,
      topic: '',
      tone: 'neutral',
      summary: '',
    };
    this.world.conversations.push(convo);
    for (const p of [a, b]) {
      p.conversationId = id;
      p.lastConversation = this.world.time;
    }
    a.facing = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    b.facing = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    if (this.wantsToSee.get(a.id) === b.id) this.wantsToSee.delete(a.id);
    if (this.wantsToSee.get(b.id) === a.id) this.wantsToSee.delete(b.id);

    const recentTopics = this.world.feed
      .filter((e) => e.kind === 'conversation' && e.agents.includes(a.id) && e.agents.includes(b.id))
      .slice(-4)
      .map((e) => e.text.match(/about (.+?)[.(]/)?.[1] ?? '')
      .filter(Boolean);

    this.ask(
      'conversation',
      () =>
        this.mind.converse({
          time: longTime(this.world.time),
          place: place.name,
          a: this.brief(a),
          b: this.brief(b),
          aAboutB: this.feeling(a, b),
          bAboutA: this.feeling(b, a),
          recentTopics,
          maxLines: MAX_CONVERSATION_LINES,
        }),
      (res) => {
        if (convo.status !== 'pending') return;
        const lines = res.lines
          .filter((l) => l.text.trim())
          .slice(0, MAX_CONVERSATION_LINES)
          .map((l) => ({ speaker: l.speaker === 'a' ? a.id : b.id, text: l.text.trim() }));
        if (!lines.length) return this.endConversation(convo, null);
        Object.assign(convo, { status: 'playing', lines, topic: res.topic, tone: res.tone, summary: res.summary });
        convo.lineTimer = 0;
        this.outcomes.set(convo.id, res);
      },
      () => this.endConversation(convo, null),
    );
  }

  private outcomes = new Map<string, Awaited<ReturnType<Mind['converse']>>>();

  private playConversations(dt: number): void {
    for (const c of this.world.conversations) {
      if (c.status !== 'playing') continue;
      c.lineTimer -= dt;
      if (c.lineTimer > 0) continue;
      const [a, b] = c.participants.map((id) => this.agents.get(id)!);
      if (c.lineIndex < c.lines.length) {
        const line = c.lines[c.lineIndex++];
        a.speaking = line.speaker === a.id ? line.text : null;
        b.speaking = line.speaker === b.id ? line.text : null;
        c.lineTimer = LINE_SECONDS + Math.min(line.text.length / 40, 2);
      } else {
        this.endConversation(c, this.outcomes.get(c.id) ?? null);
      }
    }
    this.world.conversations = this.world.conversations.filter((c) => c.status !== 'done');
  }

  private endConversation(c: Conversation, res: Awaited<ReturnType<Mind['converse']>> | null): void {
    c.status = 'done';
    this.outcomes.delete(c.id);
    const [a, b] = c.participants.map((id) => this.agents.get(id)!);
    for (const p of [a, b]) {
      p.conversationId = null;
      p.speaking = null;
      // Talking takes time: make sure the activity doesn't end before they've had a moment.
      if (p.activity?.started) p.activity.until = Math.max(p.activity.until, this.world.time + 10);
    }
    if (!res) return;
    const t = this.world.time;
    const bump = (from: AgentState, to: AgentState, delta: number) => {
      const rel = (from.relationships[to.id] ??= { affinity: 0, talks: 0, lastTalk: null });
      rel.affinity = clamp(rel.affinity + clamp(delta, -10, 10), -100, 100);
      rel.talks += 1;
      rel.lastTalk = t;
    };
    bump(a, b, res.aAffinityChange);
    bump(b, a, res.bAffinityChange);
    a.needs.social = clamp(a.needs.social + 18, 0, 100);
    b.needs.social = clamp(b.needs.social + 18, 0, 100);
    const imp = clamp(Math.round(res.importance), 1, 10);
    this.remember(a, 'conversation', res.aMemory, imp);
    this.remember(b, 'conversation', res.bMemory, imp);
    this.feed('conversation', `${res.summary} (${res.tone})`, [a.id, b.id]);
    this.witnesses(c, a, b, res);
  }

  /** People nearby notice the conversation; some of them react out loud, which starts a reaction chain. */
  private witnesses(c: Conversation, a: AgentState, b: AgentState, res: NonNullable<Awaited<ReturnType<Mind['converse']>>>): void {
    const place = c.buildingId ? this.buildings.get(c.buildingId)! : null;
    const notable = res.tone === 'tense' || res.tone === 'heated' || res.gossip !== null || res.importance >= 6;
    for (const w of this.world.agents) {
      if (w === a || w === b || w.conversationId) continue;
      if (w.activity?.kind === 'sleep' && w.activity.started) continue;
      const near = Math.min(dist(w, a), dist(w, b)) < HEARING_DISTANCE;
      if (!near) continue;
      const what = res.gossip ? `${a.name} and ${b.name} talking: ${res.gossip}` : `${a.name} and ${b.name} ${res.tone === 'tense' || res.tone === 'heated' ? 'arguing' : 'chatting'} about ${res.topic}`;
      this.remember(w, notable ? 'gossip' : 'observation', `Overheard ${what}`, notable ? 4 : 1);
      if (!notable) continue;
      const fondness = Math.max(w.relationships[a.id]?.affinity ?? 0, w.relationships[b.id]?.affinity ?? 0);
      if (fondness < 25 && w.traits.extraversion < 0.6) continue;
      this.ask(
        'reaction',
        () =>
          this.mind.react({
            time: longTime(this.world.time),
            place: place?.name ?? 'Linden Street',
            witness: this.brief(w),
            observed: what,
            feelings: [this.feeling(w, a), this.feeling(w, b)],
          }),
        (r) => {
          if (w.conversationId) return;
          w.speaking = r.line;
          const clear = () => {
            if (w.speaking === r.line) w.speaking = null;
          };
          this.later(5, clear);
          this.remember(w, 'reaction', r.memory, 3);
          for (const p of [a, b]) this.remember(p, 'observation', `${w.name} reacted: "${r.line}"`, 3);
          this.feed('reaction', `${w.name} reacted to ${a.name} and ${b.name}: "${r.line}"`, [w.id, a.id, b.id]);
        },
      );
    }
  }

  // ---------------------------------------------------------------- plans and reflection

  private requestPlan(a: AgentState): void {
    const others = this.world.agents
      .filter((o) => o !== a)
      .sort((x, y) => (a.relationships[y.id]?.affinity ?? 0) - (a.relationships[x.id]?.affinity ?? 0))
      .slice(0, 6)
      .map((o) => `${o.name} ${o.surname} (${o.occupation}; ${relationWord(a.relationships[o.id]?.affinity ?? 0)})`);
    this.ask(
      'plan',
      () => this.mind.planDay({ time: longTime(this.world.time), person: this.brief(a), townsfolk: others }),
      (res) => {
        a.plan = res.plan;
        this.remember(a, 'plan', `Plan for ${weekdayOf(this.world.time)}: ${res.plan}`, 3);
        const who = res.wantsToSee ? this.world.agents.find((o) => o !== a && o.name.toLowerCase() === res.wantsToSee!.split(' ')[0].toLowerCase()) : null;
        if (who) this.wantsToSee.set(a.id, who.id);
        else this.wantsToSee.delete(a.id);
        this.feed('plan', `${a.name}'s plan: ${res.plan}`, who ? [a.id, who.id] : [a.id]);
      },
    );
  }

  private maybeReflect(a: AgentState): void {
    const since = a.memories.filter((m) => m.t > a.lastReflection && m.kind !== 'plan');
    if (since.length < 4) return;
    a.lastReflection = this.world.time;
    this.ask(
      'reflection',
      () => this.mind.reflect({ person: this.brief(a, 24) }),
      (res) => {
        const fresh = res.beliefs.map((s) => s.trim()).filter(Boolean).slice(0, 3);
        if (!fresh.length) return;
        a.beliefs = [...a.beliefs.filter((x) => !fresh.includes(x)), ...fresh].slice(-6);
        this.remember(a, 'reflection', `Reflected: ${fresh.join(' ')}`, 6);
        this.feed('reflection', `${a.name} thought about the day: "${fresh[0]}"`, [a.id]);
      },
    );
  }

  // ---------------------------------------------------------------- helpers

  private timers: { at: number; fn: () => void }[] = [];
  private realClock = 0;

  /** Run `fn` after `seconds` real seconds of simulation. Used for short speech bubbles. */
  private later(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.realClock + seconds, fn });
  }

  /** Called by step; separated for clarity. */
  tickTimers(realDt: number): void {
    this.realClock += realDt;
    const due = this.timers.filter((t) => t.at <= this.realClock);
    this.timers = this.timers.filter((t) => t.at > this.realClock);
    for (const t of due) t.fn();
  }

  private ask<T>(what: string, call: () => Promise<T>, done: (r: T) => void, failed?: () => void): void {
    this.pending++;
    let promise: Promise<T>;
    try {
      promise = call();
    } catch (err) {
      promise = Promise.reject(err);
    }
    promise
      .then(done)
      .catch((err) => {
        this.events.onMindError?.(what, err);
        failed?.();
      })
      .finally(() => {
        this.pending--;
      });
  }

  remember(a: AgentState, kind: MemoryKind, text: string, importance: number): void {
    a.memories.push({ t: this.world.time, kind, text, importance });
    if (a.memories.length > MAX_MEMORIES) {
      const drop = a.memories.findIndex((m) => m.importance <= 3);
      a.memories.splice(drop >= 0 ? drop : 0, 1);
    }
  }

  private feed(kind: FeedKind, text: string, agents: string[]): void {
    const e: FeedEvent = { id: `e${this.world.nextId++}`, t: this.world.time, kind, text, agents };
    this.world.feed.push(e);
    if (this.world.feed.length > MAX_FEED) this.world.feed.splice(0, this.world.feed.length - MAX_FEED);
    this.events.onFeed?.(e);
  }

  /** A person written out for the Mind: who they are, what they want today, and what they remember. */
  brief(a: AgentState, memoryCount = 14): PersonBrief {
    const recent = a.memories.slice(-memoryCount);
    const important = a.memories.filter((m) => m.importance >= 6 && !recent.includes(m)).slice(-4);
    return {
      name: `${a.name} ${a.surname}`,
      age: a.age,
      occupation: a.occupation,
      personality: personalityText(a.traits),
      bio: a.bio,
      plan: a.plan,
      beliefs: a.beliefs,
      memories: [...important, ...recent].map((m: Memory) => `${weekdayOf(m.t)} ${clockText(m.t)}: ${m.text}`),
    };
  }

  /** How `a` feels about `b`, as a sentence for the Mind. */
  feeling(a: AgentState, b: AgentState): string {
    const rel = a.relationships[b.id];
    const affinity = rel?.affinity ?? 0;
    const housemate = a.homeId === b.homeId ? `, lives with ${b.name}` : '';
    const coworker = a.workId && a.workId === b.workId ? `, works with ${b.name}` : '';
    return `${a.name} sees ${b.name} ${b.surname} (${b.occupation}) as ${relationWord(affinity)}${housemate}${coworker}; they have talked ${rel?.talks ?? 0} times.`;
  }

  // ---------------------------------------------------------------- views

  view(): TickView {
    return {
      time: this.world.time,
      agents: this.world.agents.map((a): AgentView => ({
        id: a.id,
        name: a.name,
        color: a.color,
        x: round2(a.pos.x),
        z: round2(a.pos.z),
        facing: round2(a.facing),
        moving: a.path.length > 0 && !a.conversationId,
        inside: a.inside,
        activity: this.activityText(a),
        speaking: a.speaking,
        needs: a.needs,
      })),
    };
  }

  /** Everything the agent panel shows about one person. */
  detail(id: string): AgentDetail | null {
    const a = this.agents.get(id);
    if (!a) return null;
    const convo = a.conversationId ? this.world.conversations.find((c) => c.id === a.conversationId) : undefined;
    const otherId = convo?.participants.find((p) => p !== a.id);
    const other = otherId ? this.agents.get(otherId) : undefined;
    return {
      id: a.id,
      name: a.name,
      surname: a.surname,
      age: a.age,
      occupation: a.occupation,
      bio: a.bio,
      personality: personalityText(a.traits),
      home: this.buildings.get(a.homeId)?.name ?? '',
      work: a.workId ? this.buildings.get(a.workId)?.name ?? null : null,
      activity: this.activityText(a),
      needs: { ...a.needs },
      plan: a.plan,
      beliefs: [...a.beliefs],
      memories: a.memories.slice(-25).reverse().map((m) => ({ t: m.t, kind: m.kind, text: m.text })),
      relationships: Object.entries(a.relationships)
        .map(([oid, r]) => ({ id: oid, name: this.agents.get(oid)?.name ?? oid, affinity: Math.round(r.affinity), label: relationWord(r.affinity), talks: r.talks }))
        .sort((x, y) => y.affinity - x.affinity),
      conversation:
        convo && other
          ? {
              with: other.name,
              topic: convo.topic,
              tone: convo.status === 'playing' ? convo.tone : null,
              lines: convo.lines.slice(0, convo.lineIndex).map((l) => ({ speaker: this.agents.get(l.speaker)?.name ?? l.speaker, text: l.text })),
            }
          : null,
    };
  }

  private activityText(a: AgentState): string {
    if (a.conversationId) {
      const c = this.world.conversations.find((x) => x.id === a.conversationId);
      const other = c && this.agents.get(c.participants.find((p) => p !== a.id)!);
      return other ? `talking with ${other.name}` : 'talking';
    }
    const act = a.activity;
    if (!act) return 'deciding what to do';
    if (!act.started) return `on the way: ${act.label}`;
    return act.label;
  }

  describeTime(): string {
    return `${longTime(this.world.time)} (${partOfDay(this.world.time)})`;
  }
}

function groupOf(kind: ActionKind, b: Building): AnchorGroup {
  if (b.kind === 'park') return 'bench';
  if (b.kind === 'home') {
    if (kind === 'sleep' || kind === 'wash') return 'bed';
    if (kind === 'eat_home' || kind === 'work') return 'dining';
    return 'sofa';
  }
  if (kind === 'work') return b.kind === 'office' ? 'back' : 'counter';
  return 'front';
}

export function relationWord(affinity: number): string {
  if (affinity >= 60) return 'a close friend';
  if (affinity >= 30) return 'a friend';
  if (affinity >= 10) return 'a friendly acquaintance';
  if (affinity > -10) return 'an acquaintance';
  if (affinity > -30) return 'someone they find a bit annoying';
  return 'someone they dislike';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const dist = (p: AgentState, q: AgentState) => Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z);
