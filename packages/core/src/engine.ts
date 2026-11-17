/**
 * The town simulation. It advances the clock, runs each agent's needs and daily routine (utility AI),
 * moves people along the street, and asks the Mind for the big moments: conversations, plans, reflections
 * and reactions. It never waits for the Mind: requests resolve in the background while the town keeps going.
 */
import { BASE_SPEED, clockText, dayOf, hourOf, isWeekend, longTime, minuteOfDay, MINUTES_PER_DAY, partOfDay, weekdayOf } from './clock';
import { ANCHORS, type Anchor, type AnchorGroup, isOutdoor, route, sidewalkPoint, streetZ, toWorld, toWorldFacing } from './layout';
import { LETTERS, MAX_CONVERSATION_LINES, type ConverseResult, type Mind, type PersonBrief } from './mind';
import { Rng } from './rng';
import type { AgentDetail } from './protocol';
import type { ActionKind, AgentState, AgentView, Building, EconomyView, Conversation, FeedEvent, FeedKind, Memory, MemoryKind, NeedKey, TickView, Vec2, WorldState } from './types';
import { personalityText } from './worldgen';
import { looksOf } from './looks';
import { BUSINESSES, CLASS_WORD, classOfHome, PRICES } from './catalog';
import { Economy, place } from './economy';

const WALK_SPEED = 1.35; // metres per real second at 1x
/** Longer trips along the avenue are made by scooter or car. */
const RIDE_SPEED = 7;
const RIDE_MIN = 24; // metres: a stretch longer than this is ridden
const LINE_SECONDS = 3.4; // real seconds each spoken line stays up
const AGENT_TALK_COOLDOWN = 45; // sim minutes between conversations for one person
const PAIR_TALK_COOLDOWN = 180; // sim minutes before the same two people talk again
const HEARING_DISTANCE = 9; // metres
const MAX_MEMORIES = 80;

/** Savings milestones that make the town news. */
const MILESTONES = [1000, 2500, 5000, 10000, 25000, 50000, 100000];
const MAX_FEED = 200;

/** Need change per sim minute: decay while awake, and gains from activities. */
const DECAY: Record<NeedKey, number> = { hunger: -0.1, energy: -0.065, social: -0.05, fun: -0.045, hygiene: -0.04 };
const GAINS: Partial<Record<ActionKind, Partial<Record<NeedKey, number>>>> = {
  sleep: { energy: 0.24, hunger: 0.06 },
  eat_home: { hunger: 2.2 },
  eat_leftovers: { hunger: 1.1, fun: -0.1 },
  eat_out: { hunger: 2.0, social: 0.25, fun: 0.25 },
  socialize: { social: 0.45, fun: 0.2 },
  relax: { fun: 0.55, energy: 0.03 },
  wash: { hygiene: 3.5 },
  shop: { fun: 0.15 },
  work: { fun: -0.01, social: 0.04 },
  build: { fun: -0.02, hygiene: -0.03, social: 0.03 },
  side_project: { fun: 0.1 },
  swim: { fun: 0.6, hygiene: 0.8, energy: -0.02 },
  party: { social: 0.6, fun: 0.7, energy: -0.03 },
  doctor: {},
  bank: {},
  job_hunt: { fun: -0.05 },
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
  private events: EngineEvents;
  private buildings = new Map<string, Building>();
  private agents = new Map<string, AgentState>();
  private wantsToSee = new Map<string, string>();
  private pending = 0;
  readonly rng: Rng;
  readonly economy: Economy;
  /** Who is riding rather than walking right now (not saved). */
  private riding = new Set<string>();
  /** Nights the club has already made the news for a party. */
  private partyNight = 0;

  constructor(world: WorldState, opts: EngineOptions) {
    this.world = world;
    this.mind = opts.mind;
    this.speed = opts.speed ?? BASE_SPEED;
    this.events = opts;
    this.rng = new Rng(world);
    for (const b of world.buildings) this.buildings.set(b.id, b);
    for (const a of world.agents) this.agents.set(a.id, a);
    this.economy = new Economy(this);
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
    const hourBefore = Math.floor(this.world.time / 60);
    this.world.time += simDt;
    // Building sites rise and shops change their prices through the day; once an hour, views catch up.
    if (Math.floor(this.world.time / 60) !== hourBefore) this.world.buildingsRev++;

    this.economy.townDay();
    for (const a of this.world.agents) this.updateAgent(a, dt, simDt, pace);
    this.findConversations(simDt);
    this.parties();
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

    // Work pays by the hour; side projects pay half; builders put up buildings.
    if (act?.started) {
      const place = this.buildings.get(act.buildingId);
      if (act.kind === 'work' && place) this.economy.payWork(a, place, simDt / 60);
      else if (act.kind === 'build' && place) {
        this.economy.payWork(a, this.firstOf('factory') ?? place, simDt / 60);
        this.economy.build(a, place, simDt / 60);
      } else if (act.kind === 'side_project' && !a.conversationId) this.earn(a, ((Math.max(a.wage, 12) * simDt) / 60) * 0.5);
    }

    // Each new day: rent, loans, pensions, how work went, health.
    const today = dayOf(this.world.time);
    if (a.lastRentDay < today) {
      a.lastRentDay = today;
      a.earnedToday = 0;
      this.economy.newDay(a, today);
    }

    // Mornings: make a plan for the day, and maybe take a big step.
    if (a.lastPlanDay < today && hourOf(this.world.time) >= 6 && !sleeping) {
      a.lastPlanDay = today;
      this.requestPlan(a);
      this.economy.consider(a);
    }

    if (a.conversationId) return; // standing and talking

    if (a.path.length) {
      this.walk(a, dt * WALK_SPEED * pace);
      if (!a.path.length && act && !act.started) {
        act.started = true;
        act.until = this.world.time + act.duration;
        this.begin(a);
        if (act.kind === 'sleep') this.maybeReflect(a);
      }
      return;
    }

    if (!act || (act.started && this.world.time >= act.until)) {
      a.activity = null;
      this.choose(a);
    }
  }

  /** Moves along the path. `distance` is how far they would walk; long straight stretches of avenue are ridden, much faster. */
  private walk(a: AgentState, distance: number): void {
    let left = distance;
    this.riding.delete(a.id);
    while (left > 0 && a.path.length) {
      const target = a.path[0];
      const dx = target.x - a.pos.x;
      const dz = target.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) a.facing = Math.atan2(dx, dz);
      const ride = d > RIDE_MIN && !a.inside;
      const factor = ride ? RIDE_SPEED / WALK_SPEED : 1;
      if (ride) this.riding.add(a.id);
      if (d <= left * factor) {
        a.pos = { x: target.x, z: target.z };
        a.path.shift();
        left -= d / factor;
      } else {
        a.pos = { x: a.pos.x + (dx / d) * left * factor, z: a.pos.z + (dz / d) * left * factor };
        left = 0;
      }
      // Leaving or entering a building as the agent passes its front door.
      if (a.inside) {
        const b = this.buildings.get(a.inside);
        if (!b || Math.abs(a.pos.z - streetZ(b)) < 9.4) a.inside = null;
      }
    }
    if (!a.path.length && a.activity) {
      const kind = this.buildings.get(a.activity.buildingId)?.kind;
      a.inside = !kind || isOutdoor(kind) ? null : a.activity.buildingId;
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

  /** Utility AI: score every sensible activity from needs, time of day, money and personality, then pick the best. */
  private choose(a: AgentState): void {
    const t = this.world.time;
    const h = hourOf(t);
    const day = (dayOf(t) - 1) % 7; // 0 = Monday
    const weekend = isWeekend(t);
    const home = this.buildings.get(a.homeId)!;
    const near = (kind: Building['kind']) => this.nearest(a, kind);
    // Every café and grocery in town competes for custom: price, quality and distance all count.
    const cafes = this.economy.rivalsOf('cafe');
    const groceries = this.economy.rivalsOf('grocery');
    const park = near('park');
    const work = a.workId ? this.buildings.get(a.workId) ?? null : null;
    const n = a.needs;
    const tr = a.traits;
    const deficit = (k: NeedKey) => (100 - n[k]) / 100;
    const night = h >= 22 || h < 6;
    const meal = (h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 18 && h < 20.5);
    const daytime = h >= 8 && h < 21;
    const choices: Choice[] = [];
    const add = (c: Omit<Choice, 'score'>, score: number) => choices.push({ ...c, score: score + this.rng.range(-0.06, 0.06) });
    const cls = classOfHome(home.kind);
    // Distance matters: a long trip has to be worth it.
    const far = (b: Building) => Math.min(0.3, (Math.abs(b.x - a.pos.x) + Math.abs(lotZ(b) - a.pos.z)) / 800);

    const wake = 6.5 + tr.conscientiousness * -0.6 + this.rng.range(0, 1);
    const minutesToWake = ((wake * 60 - minuteOfDay(t) + MINUTES_PER_DAY) % MINUTES_PER_DAY) || 60;
    const nightShift = work?.kind === 'club';
    // Friday and Saturday nights the young and outgoing stay out late.
    const partyNight = (day === 4 || day === 5) && a.age < 60 && tr.extraversion > 0.45;
    add(
      { kind: 'sleep', building: home, group: 'bed', duration: night || h >= 21 ? minutesToWake : 90, label: a.sick ? 'in bed, ill' : 'sleeping at home' },
      (night && !(nightShift && h >= 22) && !(partyNight && h < 23.5)) || (nightShift && h >= 1.5 && h < 9) ? 1.2 + deficit('energy') : h >= 21 ? (partyNight && h < 23.5 ? 0.3 - tr.extraversion * 0.2 : 0.5) + deficit('energy') : deficit('energy') > 0.8 || a.sick ? 0.9 : 0,
    );

    // Money worries push people to work; ambition pushes them to work more.
    const broke = a.money < 0 ? 0.7 : a.money < 150 ? 0.45 : a.money < 400 ? 0.2 : 0;
    const push = broke + a.drive * 0.3;
    if (work && !a.sick) {
      const shift = shiftOf(work, day, h);
      const group = workGroup(work);
      const sites = a.job === 'builder' ? this.economy.activeSites() : [];
      if (shift) {
        // Each builder sticks to one site rather than switching between them.
        const site = sites.length ? sites[hashId(a.id) % sites.length] : null;
        if (site) add({ kind: 'build', building: site, group: 'site', duration: Math.max(30, (shift.end - h) * 60), label: `building ${site.name.replace(' (being built)', '')}` }, 1.05 + 0.4 * tr.conscientiousness + push);
        else add({ kind: 'work', building: work, group, duration: Math.max(30, (shift.end - h) * 60), label: `working at ${work.name}` }, 1.0 + 0.4 * tr.conscientiousness + push + (this.economy.isOwner(a) ? 0.3 : 0));
      } else if (!weekend && h >= 17 && h < 19.5 && (a.drive > 0.6 || broke > 0) && work.kind !== 'club' && work.kind !== 'pool') {
        // Overtime: the ambitious and the broke stay late. Owners keep their shop going.
        add({ kind: 'work', building: work, group, duration: 75, label: `putting in extra hours at ${work.name}` }, 0.2 + push * 0.9 - deficit('energy') * 0.6);
      }
    } else if (!work && a.wage > 0 && !weekend && h >= 9 && h < 16 && !a.sick) {
      add({ kind: 'work', building: home, group: 'dining', duration: 120, label: 'working from home' }, 0.75 + 0.4 * tr.conscientiousness + push);
    }
    // Out of work: look for a job at Town Hall.
    const hall = near('townhall');
    if (hall && this.economy.isUnemployed(a) && !weekend && h >= 9 && h < 16 && !a.sick) {
      add({ kind: 'job_hunt', building: hall, group: 'front', duration: 40, label: `looking for work at ${hall.name}` }, 1.1 + broke);
    }
    // Weekends and evenings: chip away at their life goal on the side.
    if (!a.sick && ((weekend && h >= 10 && h < 18) || (!weekend && h >= 19 && h < 21.5))) {
      add({ kind: 'side_project', building: home, group: 'dining', duration: 90, label: `working toward a goal: ${a.ambition}` }, 0.1 + a.drive * 0.55 + broke * 0.3 - deficit('energy') * 0.4 - deficit('fun') * 0.3);
    }
    // Ill: see the doctor.
    const clinic = near('clinic');
    if (a.sick && clinic && h >= 8 && h < 17 && a.money > -2000) add({ kind: 'doctor', building: clinic, group: 'front', duration: 45, label: `seeing the doctor at ${clinic.name}` }, 1.4);

    const hunger = Math.pow(deficit('hunger'), 1.4) * 1.5 + (meal ? 0.3 : 0);
    if (a.pantry > 0) add({ kind: 'eat_home', building: home, group: 'dining', duration: 35, label: 'having a meal at home' }, hunger * (1.1 - tr.extraversion * 0.4));
    else add({ kind: 'eat_leftovers', building: home, group: 'dining', duration: 20, label: 'scraping together leftovers at home' }, hunger * 0.7);
    // Eating out costs money: people who are short on it think twice. The well-off eat out more.
    const thrift = a.money < 100 ? 0.3 : a.money < 400 ? 0.7 : cls === 'upper' ? 1.25 : 1;
    // How much a person cares about price: a lot when money is tight, hardly at all when rich.
    const sensitivity = a.money < 300 ? 1.1 : cls === 'upper' ? 0.2 : a.money < 2000 ? 0.7 : 0.45;
    const deal = (b: Building) => {
      const biz = b.business;
      if (!biz) return 0;
      const loyal = Math.max(0, (a.relationships[biz.ownerId]?.affinity ?? 0) / 300);
      return -(biz.priceFactor - 1) * sensitivity + (biz.quality - 0.6) * 0.25 + loyal;
    };
    for (const cafe of cafes) {
      const mealPrice = this.economy.priceAt(cafe, PRICES.cafeMeal);
      if (daytime && a.money >= mealPrice) add({ kind: 'eat_out', building: cafe, group: 'front', duration: 50, label: `eating at ${cafe.name}` }, (hunger * (0.6 + tr.extraversion * 0.6) + deficit('social') * 0.25) * thrift - far(cafe) + deal(cafe));
    }

    const wanted = this.wantsToSee.get(a.id);
    const socialPull = deficit('social') * (0.5 + 0.9 * tr.extraversion) + (wanted ? 0.15 : 0);
    for (const cafe of cafes) {
      if (daytime && a.money >= PRICES.coffee * 2) add({ kind: 'socialize', building: cafe, group: 'front', duration: 60, label: `meeting people at ${cafe.name}` }, socialPull * (0.6 + 0.4 * thrift) + a.drive * 0.08 - far(cafe) + deal(cafe) * 0.6);
    }
    if (park && h >= 7 && h < 20) add({ kind: 'socialize', building: park, group: 'bench', duration: 50, label: `hanging out in ${park.name}` }, socialPull * 0.9 - far(park));

    // The businesses people have opened: bakeries, restaurants, galleries...
    for (const { b, type } of this.economy.openPlaces(h)) {
      const k = BUSINESSES[type];
      if (a.money < k.price * (cls === 'upper' ? 1 : 3) || b.business?.ownerId === a.id) continue;
      let want = 0;
      for (const [need, gain] of Object.entries(k.gives) as [NeedKey, number][]) if (gain > 0) want += deficit(need) * gain * (need === 'hunger' ? 0.9 : 1.1);
      const novelty = dayOf(t) - b.business!.openedDay < 7 ? 0.12 : 0;
      const pricey = (k.price / (60 + Math.max(0, a.money) / 8)) * 0.4 - deal(b);
      add({ kind: 'visit', building: b, group: 'front', duration: k.minutes, label: `${k.verb} ${b.name}` }, (want + (k.meal && meal ? 0.3 : 0) + novelty + tr.openness * 0.1) * thrift - pricey - far(b));
    }

    // The pool by day, the club by night.
    const pool = near('pool');
    if (pool && h >= 10 && h < 19 && a.money >= PRICES.swim && !a.sick) {
      add({ kind: 'swim', building: pool, group: 'pool', duration: 60, label: `swimming at ${pool.name}` }, (deficit('fun') * 0.7 + deficit('hygiene') * 0.3) * (0.5 + tr.openness * 0.5) * thrift + (weekend ? 0.15 : 0) - far(pool));
    }
    const villa = home.kind === 'villa' ? home : null;
    if (villa && h >= 9 && h < 20 && !a.sick) add({ kind: 'swim', building: villa, group: 'pool', duration: 50, label: 'by the pool at home' }, deficit('fun') * 0.8 + 0.05);
    const club = near('club');
    const clubNight = club && (day === 4 || day === 5 ? h >= 20 || h < 1.5 : h >= 19 && h < 23.5);
    if (club && clubNight && a.money >= PRICES.party && !a.sick && a.age < 66) {
      add({ kind: 'party', building: club, group: 'front', duration: 100, label: `out at ${club.name}` }, (deficit('social') * 0.6 + deficit('fun') * 0.5) * (0.4 + tr.extraversion) * thrift + (day === 4 || day === 5 ? 0.45 + tr.extraversion * 0.3 : 0.1) - deficit('energy') * 0.4 - far(club) - (a.age > 50 ? 0.2 : 0));
    }

    add({ kind: 'relax', building: home, group: 'sofa', duration: 60, label: 'relaxing at home' }, deficit('fun') * 0.8 + (h >= 19 ? 0.15 : 0) + (a.sick ? 0.4 : 0));
    if (park && h >= 7 && h < 20) add({ kind: 'relax', building: park, group: 'bench', duration: 45, label: `taking a walk in ${park.name}` }, deficit('fun') * (0.55 + tr.openness * 0.5) - far(park));
    add({ kind: 'wash', building: home, group: 'bed', duration: 20, label: 'freshening up at home' }, deficit('hygiene') * 1.1 + (h >= 6.5 && h < 8.5 ? 0.25 : 0));
    for (const shop of groceries) {
      if (h >= 9 && h < 19 && a.money >= this.economy.priceAt(shop, PRICES.groceries) && a.pantry < 4) {
        add({ kind: 'shop', building: shop, group: 'front', duration: 25, label: `buying groceries at ${shop.name}` }, 0.15 + (a.pantry === 0 ? 0.75 : a.pantry < 2 ? 0.4 : 0.05) + deficit('hunger') * 0.25 - far(shop) + deal(shop));
      }
    }
    add({ kind: 'idle', building: home, group: 'sofa', duration: 30, label: 'pottering about at home' }, 0.12);

    choices.sort((x, y) => y.score - x.score);
    this.start(a, choices[0]);
  }

  /** The closest building of a kind to where someone is. */
  private nearest(a: AgentState, kind: Building['kind']): Building | undefined {
    let best: Building | undefined;
    let d = Infinity;
    for (const b of this.world.buildings) {
      if (b.kind !== kind || b.construction) continue;
      const dd = Math.abs(b.x - a.pos.x) + Math.abs(lotZ(b) - a.pos.z);
      if (dd < d) {
        d = dd;
        best = b;
      }
    }
    return best;
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
      this.begin(a);
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

  /** An activity has started where it happens: pay for it, or use up what it uses. */
  private begin(a: AgentState): void {
    const act = a.activity;
    if (!act) return;
    const place = this.buildings.get(act.buildingId);
    if (!place) return;
    const e = this.economy;
    if (act.kind === 'eat_out') e.spend(a, place, PRICES.cafeMeal);
    else if (act.kind === 'socialize' && place.business?.type === 'cafe') e.spend(a, place, PRICES.coffee);
    else if (act.kind === 'shop') {
      e.spend(a, place, PRICES.groceries);
      a.pantry += PRICES.groceryMeals;
    } else if (act.kind === 'eat_home') a.pantry = Math.max(0, a.pantry - 1);
    else if (act.kind === 'visit' && place.business) {
      const k = BUSINESSES[place.business.type];
      if (k) {
        e.spend(a, place, k.price);
        // A visit does what it promises at once (a bakery feeds you, a salon freshens you up).
        for (const [need, gain] of Object.entries(k.gives) as [NeedKey, number][]) a.needs[need] = clamp(a.needs[need] + gain * k.minutes * 0.5, 0, 100);
      }
    } else if (act.kind === 'swim' && place.kind === 'pool') e.spend(a, place, PRICES.swim);
    else if (act.kind === 'party') e.spend(a, place, PRICES.party);
    else if (act.kind === 'doctor') {
      e.spend(a, place, PRICES.doctor);
      a.sick = false;
      a.health = Math.max(a.health, 80);
      this.remember(a, 'life', `Saw the doctor at ${place.name}. Should be fine in a day.`, 4);
    } else if (act.kind === 'job_hunt') e.jobHunt(a);
  }

  /** Money in. `quiet` skips the savings milestones (for loans, which aren't savings). */
  earn(a: AgentState, amount: number, quiet = false): void {
    const before = a.money;
    a.money = round2(a.money + amount);
    if (!quiet) a.earnedToday = round2(a.earnedToday + amount);
    const hit = quiet ? undefined : MILESTONES.filter((m) => before < m && a.money >= m && m > (a.topMilestone ?? 0)).pop();
    if (hit) {
      a.topMilestone = hit;
      this.remember(a, 'life', `Reached $${hit.toLocaleString('en-US')} in savings.`, 5);
      this.feed('money', `${a.name} ${a.surname} has saved $${hit.toLocaleString('en-US')}.`, [a.id], a.pos);
    }
    if (a.broke && a.money >= 100 && !quiet) {
      a.broke = false;
      this.feed('money', `${a.name} ${a.surname} is out of debt.`, [a.id], a.pos);
    }
  }

  pay(a: AgentState, amount: number): void {
    if (amount <= 0) return;
    const before = a.money;
    a.money = round2(a.money - amount);
    if (before >= 0 && a.money < 0 && !a.broke) {
      a.broke = true;
      this.remember(a, 'life', 'Ran out of money and went into debt.', 6);
      this.feed('money', `${a.name} ${a.surname} has run out of money and is in debt.`, [a.id], a.pos);
    }
  }

  /** Money flows for the dashboard. Cheap: a few sums over the residents. */
  economyView(): EconomyView {
    const l = this.economy.ledger();
    const byMoney = [...this.world.agents].sort((p, q) => q.money - p.money);
    const who = (a: AgentState) => ({ id: a.id, name: `${a.name} ${a.surname}`, money: Math.round(a.money) });
    return {
      today: l.today,
      history: l.history,
      householdMoney: Math.round(this.world.agents.reduce((s, a) => s + a.money, 0)),
      debt: Math.round(this.world.agents.reduce((s, a) => s + a.debts.reduce((t, d) => t + d.balance, 0), 0)),
      treasury: Math.round(this.world.treasury),
      richest: byMoney.slice(0, 5).map(who),
      poorest: byMoney.slice(-5).reverse().map(who),
    };
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

  firstOf(kind: Building['kind']): Building | undefined {
    return this.world.buildings.find((b) => b.kind === kind);
  }

  building(id: string): Building | undefined {
    return this.buildings.get(id);
  }

  agent(id: string): AgentState | undefined {
    return this.agents.get(id);
  }

  addAgent(a: AgentState): void {
    this.world.agents.push(a);
    this.agents.set(a.id, a);
  }

  /** A building was built, opened, sold or renamed: views need to redraw it. */
  buildingsChanged(): void {
    this.world.buildingsRev++;
    this.buildings.clear();
    for (const b of this.world.buildings) this.buildings.set(b.id, b);
  }

  /** A big choice goes to the person's mind; `done` gets the chosen option and their reason. */
  decide(a: AgentState, situation: string, options: string[], done: (choice: number, reason: string) => void): void {
    this.ask(
      'decision',
      () => this.mind.decide({ time: longTime(this.world.time), person: this.brief(a), situation, options }),
      (res) => done(clamp(Math.round(res.choice), 0, options.length - 1), (res.reason || '').trim() || 'It felt like the right call.'),
    );
  }

  /** Friday and Saturday nights: a crowd at the club is a party, and that's news. */
  private parties(): void {
    const day = dayOf(this.world.time);
    if (this.partyNight === day) return;
    for (const club of this.world.buildings.filter((b) => b.kind === 'club')) {
      const crowd = this.world.agents.filter((a) => a.activity?.kind === 'party' && a.activity.started && a.activity.buildingId === club.id);
      if (crowd.length >= 4) {
        this.partyNight = day;
        this.feed('party', `There's a party at ${club.name}: ${crowd.slice(0, 5).map((a) => a.name).join(', ')}${crowd.length > 5 ? ' and more' : ''} are out tonight.`, crowd.map((a) => a.id), sidewalkPoint(club));
      }
    }
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
        const working = isWorkKind(a.activity!.kind) || isWorkKind(b.activity!.kind);
        const want = this.wantsToSee.get(a.id) === b.id || this.wantsToSee.get(b.id) === a.id;
        const drive = ((100 - a.needs.social) + (100 - b.needs.social)) / 200;
        const outgoing = (a.traits.extraversion + b.traits.extraversion) / 2;
        const sameHome = a.household === b.household;
        const party = a.activity!.kind === 'party' ? 2 : 1;
        let p = (0.02 + drive * 0.08) * (0.6 + outgoing) * (working ? 0.35 : 1) * (want ? 3 : 1) * (sameHome ? 0.3 : 1) * party;
        if ((rel?.affinity ?? 0) < -30) p *= 0.4;
        if (this.rng.next() < 1 - Math.pow(1 - p, simDt)) {
          // Others close by at a café table, the club or the park can join in: up to four people.
          const group = [a, b];
          if (!working) {
            for (const c of people) {
              if (group.length >= 4 || group.includes(c) || c.conversationId) continue;
              if (c.activity!.buildingId !== a.activity!.buildingId || isWorkKind(c.activity!.kind)) continue;
              if (Math.min(dist(c, a), dist(c, b)) > 6.5) continue;
              const fond = ((c.relationships[a.id]?.affinity ?? 0) + (c.relationships[b.id]?.affinity ?? 0)) / 2;
              if (this.rng.chance(0.35 + c.traits.extraversion * 0.3 + fond / 200)) group.push(c);
            }
          }
          this.startConversation(group);
        }
      }
    }
  }

  private startConversation(group: AgentState[]): void {
    const id = `c${this.world.nextId++}`;
    const [a] = group;
    const place = this.buildings.get(a.activity!.buildingId)!;
    const convo: Conversation = {
      id,
      participants: group.map((p) => p.id),
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
    // Everyone turns toward the middle of the group.
    const cx = group.reduce((s, p) => s + p.pos.x, 0) / group.length;
    const cz = group.reduce((s, p) => s + p.pos.z, 0) / group.length;
    for (const p of group) {
      p.conversationId = id;
      p.lastConversation = this.world.time;
      const other = group.length === 2 ? group.find((q) => q !== p)!.pos : { x: cx, z: cz };
      if (Math.hypot(other.x - p.pos.x, other.z - p.pos.z) > 0.05) p.facing = Math.atan2(other.x - p.pos.x, other.z - p.pos.z);
      const w = this.wantsToSee.get(p.id);
      if (w && group.some((q) => q.id === w)) this.wantsToSee.delete(p.id);
    }

    const ids = group.map((p) => p.id);
    const recentTopics = this.world.feed
      .filter((e) => (e.kind === 'conversation' || e.kind === 'group') && ids.filter((x) => e.agents.includes(x)).length >= 2)
      .slice(-4)
      .map((e) => e.text.match(/about (.+?)[.(]/)?.[1] ?? '')
      .filter(Boolean);
    const feelings: string[] = [];
    for (const p of group) for (const q of group) if (p !== q) feelings.push(this.feeling(p, q));

    this.ask(
      'conversation',
      () =>
        this.mind.converse({
          time: longTime(this.world.time),
          place: place.name,
          people: group.map((p) => this.brief(p, group.length > 2 ? 8 : 14)),
          feelings,
          recentTopics,
          maxLines: MAX_CONVERSATION_LINES,
        }),
      (res) => {
        if (convo.status !== 'pending') return;
        const lines = (res.lines ?? [])
          .filter((l) => l.text?.trim())
          .slice(0, MAX_CONVERSATION_LINES)
          .map((l) => ({ speaker: group[Math.max(0, LETTERS.indexOf(l.speaker))]?.id ?? a.id, text: l.text.trim() }));
        if (!lines.length) return this.endConversation(convo, null);
        Object.assign(convo, { status: 'playing', lines, topic: res.topic, tone: res.tone, summary: res.summary });
        convo.lineTimer = 0;
        this.outcomes.set(convo.id, res);
      },
      () => this.endConversation(convo, null),
    );
  }

  private outcomes = new Map<string, ConverseResult>();

  private playConversations(dt: number): void {
    for (const c of this.world.conversations) {
      if (c.status !== 'playing') continue;
      c.lineTimer -= dt;
      if (c.lineTimer > 0) continue;
      const people = c.participants.map((id) => this.agents.get(id)).filter((p): p is AgentState => !!p);
      if (c.lineIndex < c.lines.length) {
        const line = c.lines[c.lineIndex++];
        for (const p of people) p.speaking = line.speaker === p.id ? line.text : null;
        c.lineTimer = LINE_SECONDS + Math.min(line.text.length / 40, 2);
      } else {
        this.endConversation(c, this.outcomes.get(c.id) ?? null);
      }
    }
    this.world.conversations = this.world.conversations.filter((c) => c.status !== 'done');
  }

  private endConversation(c: Conversation, res: ConverseResult | null): void {
    c.status = 'done';
    this.outcomes.delete(c.id);
    const people = c.participants.map((id) => this.agents.get(id)).filter((p): p is AgentState => !!p);
    for (const p of people) {
      p.conversationId = null;
      p.speaking = null;
      // Talking takes time: make sure the activity doesn't end before they've had a moment.
      if (p.activity?.started) p.activity.until = Math.max(p.activity.until, this.world.time + 10);
    }
    if (!res) return;
    const t = this.world.time;
    const bump = (from: AgentState, to: AgentState, delta: number) => {
      const rel = (from.relationships[to.id] ??= { affinity: 0, talks: 0, lastTalk: null });
      const before = rel.affinity;
      rel.affinity = clamp(rel.affinity + clamp(delta, -10, 10), -100, 100);
      rel.talks += 1;
      rel.lastTalk = t;
      return before;
    };
    people.forEach((p, i) => {
      for (const q of people) {
        if (q === p) continue;
        const before = bump(p, q, Number(res.affinityChanges?.[i] ?? 0) || 0);
        const now = p.relationships[q.id].affinity;
        const back = q.relationships[p.id]?.affinity ?? 0;
        // Friendships and fallings-out make the news (once per pair, from the first person's side).
        if (p.id < q.id && before < 30 && now >= 30 && back >= 25) {
          this.remember(p, 'life', `${q.name} and I have become friends.`, 6);
          this.remember(q, 'life', `${p.name} and I have become friends.`, 6);
          this.feed('friendship', `${p.name} ${p.surname} and ${q.name} ${q.surname} have become friends.`, [p.id, q.id], p.pos);
        } else if (p.id < q.id && before > -30 && now <= -30) {
          this.feed('fight', `${p.name} and ${q.name} have fallen out.`, [p.id, q.id], p.pos);
        }
      }
      p.needs.social = clamp(p.needs.social + 18, 0, 100);
      const memory = res.memories?.[i];
      if (memory) this.remember(p, 'conversation', memory, clamp(Math.round(res.importance), 1, 10));
    });
    const ids = people.map((p) => p.id);
    const kind: FeedKind = res.tone === 'heated' || res.tone === 'tense' ? 'fight' : people.length > 2 ? 'group' : 'conversation';
    this.feed(kind, `${res.summary} (${res.tone})`, ids, people[0].pos);
    this.witnesses(c, people, res);
  }

  /** People nearby notice the conversation; some of them react out loud, which starts a reaction chain. */
  private witnesses(c: Conversation, people: AgentState[], res: ConverseResult): void {
    const place = c.buildingId ? this.buildings.get(c.buildingId)! : null;
    const notable = res.tone === 'tense' || res.tone === 'heated' || res.gossip !== null || res.importance >= 6;
    const names = people.length > 2 ? `${people.slice(0, -1).map((p) => p.name).join(', ')} and ${people[people.length - 1].name}` : `${people[0].name} and ${people[1].name}`;
    for (const w of this.world.agents) {
      if (people.includes(w) || w.conversationId) continue;
      if (w.activity?.kind === 'sleep' && w.activity.started) continue;
      const near = Math.min(...people.map((p) => dist(w, p))) < HEARING_DISTANCE;
      if (!near) continue;
      const what = res.gossip ? `${names} talking: ${res.gossip}` : `${names} ${res.tone === 'tense' || res.tone === 'heated' ? 'arguing' : 'chatting'} about ${res.topic}`;
      this.remember(w, notable ? 'gossip' : 'observation', `Overheard ${what}`, notable ? 4 : 1);
      if (!notable) continue;
      const fondness = Math.max(...people.map((p) => w.relationships[p.id]?.affinity ?? 0));
      if (fondness < 25 && w.traits.extraversion < 0.6) continue;
      this.ask(
        'reaction',
        () =>
          this.mind.react({
            time: longTime(this.world.time),
            place: place?.name ?? 'Linden Street',
            witness: this.brief(w),
            observed: what,
            feelings: people.map((p) => this.feeling(w, p)),
          }),
        (r) => {
          if (w.conversationId) return;
          w.speaking = r.line;
          const clear = () => {
            if (w.speaking === r.line) w.speaking = null;
          };
          this.later(5, clear);
          this.remember(w, 'reaction', r.memory, 3);
          for (const p of people) this.remember(p, 'observation', `${w.name} reacted: "${r.line}"`, 3);
          this.feed('reaction', `${w.name} reacted to ${names}: "${r.line}"`, [w.id, ...people.map((p) => p.id)], w.pos);
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

  feed(kind: FeedKind, text: string, agents: string[], at?: Vec2): void {
    const where = at ?? (agents[0] ? this.agents.get(agents[0])?.pos : undefined);
    const e: FeedEvent = { id: `e${this.world.nextId++}`, t: this.world.time, kind, text, agents, ...(where ? { at: { x: round2(where.x), z: round2(where.z) } } : {}) };
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
      ambition: a.ambition,
      money: moneyText(a, this.economy.dailyCosts(a)),
      home: this.homeText(a),
    };
  }

  /** "rents a flat in Mill Court, Mill End (working class)" */
  homeText(a: AgentState): string {
    const home = this.buildings.get(a.homeId);
    if (!home) return '';
    const what = home.kind === 'apartments' ? `a flat in ${home.name}` : `the ${home.name}`;
    const how = a.tenure === 'rent' ? 'rents' : a.tenure === 'mortgage' ? 'is paying off a mortgage on' : 'owns';
    return `${how} ${what}, ${place(home)} (${CLASS_WORD[classOfHome(home.kind)]})`;
  }

  /** How `a` feels about `b`, as a sentence for the Mind. */
  feeling(a: AgentState, b: AgentState): string {
    const rel = a.relationships[b.id];
    const affinity = rel?.affinity ?? 0;
    const housemate = a.household === b.household ? `, lives with ${b.name}` : '';
    const coworker = a.workId && a.workId === b.workId ? `, works with ${b.name}` : '';
    return `${a.name} sees ${b.name} ${b.surname} (${b.occupation}) as ${relationWord(affinity)}${housemate}${coworker}; they have talked ${rel?.talks ?? 0} times.`;
  }

  // ---------------------------------------------------------------- views

  view(): TickView {
    return {
      time: this.world.time,
      economy: this.economyView(),
      agents: this.world.agents.map((a): AgentView => ({
        id: a.id,
        name: a.name,
        color: a.color,
        x: round2(a.pos.x),
        z: round2(a.pos.z),
        facing: round2(a.facing),
        moving: a.path.length > 0 && !a.conversationId,
        riding: this.riding.has(a.id) && a.path.length > 0,
        inside: a.inside,
        activity: this.activityText(a),
        speaking: a.speaking,
        needs: a.needs,
        looks: looksOf(a),
      })),
      rev: this.world.buildingsRev,
    };
  }

  /** Everything the agent panel shows about one person. */
  detail(id: string): AgentDetail | null {
    const a = this.agents.get(id);
    if (!a) return null;
    const convo = a.conversationId ? this.world.conversations.find((c) => c.id === a.conversationId) : undefined;
    const others = (convo?.participants ?? []).filter((p) => p !== a.id).map((p) => this.agents.get(p)).filter((p): p is AgentState => !!p);
    const home = this.buildings.get(a.homeId);
    const work = a.workId ? this.buildings.get(a.workId) : undefined;
    const biz = work?.business && work.business.ownerId === a.id ? work.business : null;
    const rels = Object.entries(a.relationships)
      .map(([oid, r]) => ({ id: oid, name: this.agents.get(oid)?.name ?? oid, affinity: Math.round(r.affinity), label: relationWord(r.affinity), talks: r.talks }))
      .sort((x, y) => y.affinity - x.affinity);
    const project = a.project?.buildingId ? this.buildings.get(a.project.buildingId) : undefined;
    return {
      id: a.id,
      name: a.name,
      surname: a.surname,
      age: a.age,
      occupation: a.occupation,
      bio: a.bio,
      personality: personalityText(a.traits),
      home: home?.name ?? '',
      homeText: this.homeText(a),
      socialClass: home ? classOfHome(home.kind) : 'middle',
      work: work?.name ?? null,
      activity: this.activityText(a),
      needs: { ...a.needs },
      plan: a.plan,
      beliefs: [...a.beliefs],
      ambition: a.ambition,
      money: Math.round(a.money),
      earnedToday: Math.round(a.earnedToday),
      wage: a.wage,
      pension: a.pension,
      pantry: a.pantry,
      costsPerDay: Math.round(this.economy.dailyCosts(a)),
      debts: a.debts.map((d) => ({ kind: d.kind, balance: d.balance, perDay: d.perDay, purpose: d.purpose })),
      business: biz && work ? { name: work.name, lastProfit: biz.lastProfit, partners: biz.partners.map((p) => `${this.agents.get(p.id)?.name ?? '?'} (${Math.round(p.share * 100)}%)`) } : null,
      project: project?.construction ? { what: project.name, progress: Math.min(1, project.construction.done / project.construction.needed) } : null,
      sick: a.sick,
      level: a.level,
      memories: a.memories.slice(-25).reverse().map((m) => ({ t: m.t, kind: m.kind, text: m.text })),
      relationships: rels.length > 11 ? [...rels.slice(0, 8), ...rels.slice(-3)] : rels,
      conversation:
        convo && others.length
          ? {
              with: others.length > 1 ? `${others.slice(0, -1).map((o) => o.name).join(', ')} and ${others[others.length - 1].name}` : others[0].name,
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
      const others = (c?.participants ?? []).filter((p) => p !== a.id).map((p) => this.agents.get(p)?.name).filter(Boolean);
      return others.length ? `talking with ${others.join(' and ')}` : 'talking';
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
  if (b.kind === 'lot') return 'site';
  if (kind === 'swim') return 'pool';
  if (b.kind === 'home' || b.kind === 'villa' || b.kind === 'apartments') {
    if (kind === 'sleep' || kind === 'wash') return 'bed';
    if (kind === 'eat_home' || kind === 'eat_leftovers' || kind === 'work' || kind === 'side_project') return 'dining';
    return 'sofa';
  }
  if (kind === 'work') return workGroup(b);
  if (b.kind === 'pool') return 'bench';
  return 'front';
}

/** Where staff stand at each kind of workplace. */
function workGroup(b: Building): AnchorGroup {
  if (b.kind === 'park') return 'bench';
  if (b.kind === 'pool') return 'counter';
  if (b.kind === 'lot') return 'site';
  if (b.kind === 'office' || b.kind === 'tech' || b.kind === 'townhall' || b.kind === 'bank' || b.kind === 'clinic' || b.kind === 'factory') return 'back';
  return 'counter';
}

const hashId = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const lotZ = (b: Building) => streetZ(b) + b.side * 14;

const isWorkKind = (k: ActionKind) => k === 'work' || k === 'build';

/** Working hours for a workplace on a weekday (0 = Monday), or null when it's closed now. */
function shiftOf(b: Building, day: number, h: number): { end: number } | null {
  if (b.kind === 'club') return day >= 1 && day <= 5 && (h >= 18 || h < 1) ? { end: h >= 18 ? 24.9 : 1 } : null;
  if (b.kind === 'pool') return day !== 0 && h >= 10 && h < 18 ? { end: 18 } : null;
  const saturday = b.kind === 'cafe' || b.kind === 'shop' || b.kind === 'store';
  if (day === 6 || (day === 5 && !saturday)) return null;
  if (b.kind === 'store' && b.business) {
    const k = BUSINESSES[b.business.type as keyof typeof BUSINESSES];
    if (k) return h >= Math.max(7, k.open[0] - 0.5) && h < Math.min(k.open[1] - 0.5, 19) ? { end: Math.min(k.open[1] - 0.5, 19) } : null;
  }
  if (h < 8.5 || h >= 16.5) return null;
  return { end: h < 12.5 ? 12.5 : 17 };
}

/** A person's money situation in a sentence, for the mind and the panel. */
export function moneyText(a: AgentState, costs?: number): string {
  const cash = a.money < 0 ? `$${Math.round(-a.money).toLocaleString('en-US')} in debt` : `$${Math.round(a.money).toLocaleString('en-US')} in savings`;
  const income = a.pension ? `a pension of $${a.pension} a day` : a.wage ? `earns $${a.wage} an hour working` : a.job === 'owner' ? 'lives off the profit of their business' : 'has no income';
  const owed = a.debts.length ? `, owes the bank $${Math.round(a.debts.reduce((s, d) => s + d.balance, 0)).toLocaleString('en-US')}` : '';
  const food = a.pantry ? `groceries for ${a.pantry} meal${a.pantry === 1 ? '' : 's'}` : 'no food at home';
  return `${cash}, ${income}${owed}, pays about $${Math.round(costs ?? 0)} a day for home and loans, ${food}`;
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
