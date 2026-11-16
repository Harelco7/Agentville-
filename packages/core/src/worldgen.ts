/**
 * Builds a new town from a seed: Linden Street through three neighbourhoods, its buildings and its people.
 * The founding families from the first version of the town always come back with the same names and lives;
 * everyone else is drawn from the seed, so the same seed always gives the same town.
 */
import { BUILD, classOfHome, JOBS, LAND, rankTitle, RENT, STORE_RENT, VALUE } from './catalog';
import { ANCHORS, districtAt, LOT_XS, toWorld, toWorldFacing } from './layout';
import { Rng } from './rng';
import { newBusiness } from './economy';
import type { AgentState, Building, BuildingKind, District, Traits, WorldState } from './types';

const FIRST_NAMES = [
  'Dana', 'Lior', 'Sam', 'Omar', 'Clara', 'Jonah', 'Leah', 'Felix', 'Marco', 'Nina', 'Victor', 'Ada', 'Ben', 'June',
  'Amir', 'Yael', 'Paul', 'Rosa', 'Kofi', 'Mira', 'Tom', 'Sofia', 'Idan', 'Grace', 'Hugo', 'Lena', 'Ari', 'Zoe',
  'Nadia', 'Eitan', 'Priya', 'Max', 'Ella', 'Yosef', 'Inés', 'Kai', 'Dov', 'Lucy', 'Mateo', 'Shira',
];
const SURNAMES = ['Levi', 'Rivera', 'Okafor', 'Park', 'Moreau', 'Duarte', 'Katz', 'Brennan', 'Haddad', 'Silva', 'Weiss', 'Nakamura', 'Fischer', 'Avraham', 'Costa', 'Bauer', 'Ortiz', 'Mendel', 'Quinn', 'Sato'];
const COLORS = ['#c0563b', '#3f6f9c', '#6f8f3c', '#8a5aa8', '#d0903a', '#2f8a83', '#b04a6f', '#556070', '#a8743c', '#4b7bd0', '#7a6a58', '#c46d8e', '#3a8a5a', '#a85a3a', '#5a5aa8', '#8a8a3a'];
const PALETTE: Pick<Building, 'walls' | 'roof' | 'accent'>[] = [
  { walls: 'brick', roof: 'slate', accent: '#8a5a44' },
  { walls: 'plaster', roof: 'red', accent: '#4f6d7a' },
  { walls: 'plasterBlue', roof: 'slate', accent: '#9c6b3f' },
  { walls: 'plaster', roof: 'slate', accent: '#6b7d4f' },
  { walls: 'brick', roof: 'red', accent: '#5a6a8a' },
];

/**
 * What stands on each lot when the town begins, west to east, as [north side, south side].
 * Linden Street is built up; Oak Street and Maple Street are mostly empty lots for the town to grow into.
 */
const LINDEN: [BuildingKind, BuildingKind][] = [
  ['factory', 'lot'],
  ['apartments', 'apartments'],
  ['apartments', 'lot'],
  ['home', 'store'],
  ['club', 'lot'],
  ['pool', 'home'],
  ['home', 'store'],
  ['cafe', 'home'],
  ['shop', 'townhall'],
  ['park', 'bank'],
  ['office', 'clinic'],
  ['home', 'home'],
  ['store', 'home'],
  ['tech', 'home'],
  ['home', 'home'],
  ['villa', 'lot'],
  ['villa', 'villa'],
  ['lot', 'villa'],
  ['villa', 'lot'],
  ['lot', 'lot'],
];
const OAK: [BuildingKind, BuildingKind][] = LOT_XS.map((x) => (x === -167 ? ['lot', 'apartments'] : x === -50 ? ['lot', 'store'] : ['lot', 'lot']));
const MAPLE: [BuildingKind, BuildingKind][] = LOT_XS.map((x) => (x === 33 ? ['store', 'lot'] : x === -133 ? ['home', 'lot'] : ['lot', 'lot']));
const PLAN: { street: string; lots: [BuildingKind, BuildingKind][] }[] = [
  { street: 'linden', lots: LINDEN },
  { street: 'oak', lots: OAK },
  { street: 'maple', lots: MAPLE },
];

const PLACE_NAMES: Partial<Record<BuildingKind, string[]>> = {
  cafe: ['Corner Café'],
  shop: ['Maple Grocery'],
  office: ['Town Works Office'],
  tech: ['Linden Labs'],
  park: ['Linden Park'],
  townhall: ['Town Hall'],
  bank: ['Linden Savings Bank'],
  clinic: ['Linden Clinic'],
  club: ['The Lantern Club'],
  pool: ['Linden Lido'],
  factory: ['Ironbridge Works'],
  apartments: ['Mill Court', 'Canal House', 'Weaver Flats'],
};

interface Person {
  name: string;
  surname: string;
  age: number;
  job: string;
  level?: number;
  money: number;
  drive: number;
  ambition?: string;
  traits?: Traits;
  color?: string;
}

/** The ten people who lived on Linden Street from the start. They keep their names, jobs and dreams. */
const FOUNDERS: Person[][] = [
  [
    { name: 'Theo', surname: 'Novak', age: 62, job: 'barista', money: 409, drive: 0.86, ambition: 'save enough to open my own bakery on Linden Street', traits: { openness: 0.82, conscientiousness: 0.58, extraversion: 0.75, agreeableness: 0.44, neuroticism: 0.14 }, color: '#a8743c' },
    { name: 'Iris', surname: 'Novak', age: 57, job: 'grocer', money: 616, drive: 0.64, ambition: 'grow Maple Grocery into the supplier for every business in town', traits: { openness: 0.87, conscientiousness: 0.39, extraversion: 0.57, agreeableness: 0.45, neuroticism: 0.63 }, color: '#3f6f9c' },
  ],
  [
    { name: 'Hana', surname: 'Cohen', age: 58, job: 'clerk', money: 315, drive: 0.59, ambition: 'get the town to build a proper square with shops, and run for mayor one day', traits: { openness: 0.4, conscientiousness: 0.22, extraversion: 0.89, agreeableness: 0.39, neuroticism: 0.52 }, color: '#c0563b' },
    { name: 'Ruth', surname: 'Cohen', age: 51, job: 'developer', money: 1030, drive: 0.37, ambition: 'build an app that every business in town uses', traits: { openness: 0.75, conscientiousness: 0.51, extraversion: 0.43, agreeableness: 0.51, neuroticism: 0.74 }, color: '#6f8f3c' },
  ],
  [
    { name: 'Noa', surname: 'Mizrahi', age: 40, job: 'gardener', money: 299, drive: 0.69, ambition: 'make Linden Park the pride of the town and start a landscaping business', traits: { openness: 0.27, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.84, neuroticism: 0.11 }, color: '#2f8a83' },
    { name: 'Maya', surname: 'Mizrahi', age: 43, job: 'cafeOwner', money: 817, drive: 0.82, ambition: 'turn the Corner Café into the heart of town and open a second place, a real restaurant', traits: { openness: 0.83, conscientiousness: 0.29, extraversion: 0.74, agreeableness: 0.81, neuroticism: 0.24 }, color: '#7a6a58' },
  ],
  [
    { name: 'Rafael', surname: 'Lindqvist', age: 33, job: 'accountant', money: 789, drive: 0.36, ambition: "become the town's go-to financial adviser and invest in local businesses", traits: { openness: 0.32, conscientiousness: 0.31, extraversion: 0.88, agreeableness: 0.29, neuroticism: 0.7 }, color: '#8a5aa8' },
    { name: 'Talia', surname: 'Lindqvist', age: 29, job: 'designer', money: 751, drive: 0.85, ambition: 'save enough to build my own house', traits: { openness: 0.29, conscientiousness: 0.23, extraversion: 0.36, agreeableness: 0.71, neuroticism: 0.48 }, color: '#556070' },
  ],
  [{ name: 'Oscar', surname: 'Shapiro', age: 69, job: 'retired', money: 510, drive: 0.87, ambition: "invest my savings in a young person's business", traits: { openness: 0.16, conscientiousness: 0.85, extraversion: 0.36, agreeableness: 0.77, neuroticism: 0.57 }, color: '#c46d8e' }],
  [{ name: 'Eli', surname: 'Hart', age: 35, job: 'writer', money: 356, drive: 0.79, ambition: 'write a bestseller that puts Agentville on the map', traits: { openness: 0.32, conscientiousness: 0.62, extraversion: 0.24, agreeableness: 0.4, neuroticism: 0.56 }, color: '#b04a6f' }],
];

/** Everyone else, by neighbourhood. Names, looks and personalities come from the seed. */
const NEWER: { district: District; tenure: AgentState['tenure']; people: Omit<Person, 'name' | 'surname' | 'age'>[] }[] = [
  { district: 'hill', tenure: 'own', people: [{ job: 'founder', money: 140000, drive: 0.9 }, { job: 'architect', money: 36000, drive: 0.7 }] },
  { district: 'hill', tenure: 'mortgage', people: [{ job: 'banker', money: 52000, drive: 0.8 }] },
  { district: 'hill', tenure: 'mortgage', people: [{ job: 'doctor', money: 41000, drive: 0.6 }, { job: 'mayor', money: 18000, drive: 0.75 }] },
  { district: 'hill', tenure: 'own', people: [{ job: 'investor', money: 230000, drive: 0.55 }] },
  { district: 'centre', tenure: 'mortgage', people: [{ job: 'developer', level: 1, money: 7400, drive: 0.7 }, { job: 'nurse', money: 2600, drive: 0.5 }] },
  { district: 'centre', tenure: 'rent', people: [{ job: 'builder', level: 1, money: 3100, drive: 0.65 }, { job: 'shopAssistant', money: 900, drive: 0.55 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'factoryWorker', level: 2, money: 2400, drive: 0.6 }, { job: 'gardener', money: 600, drive: 0.4 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'factoryWorker', money: 340, drive: 0.5 }, { job: 'builder', money: 520, drive: 0.75 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'factoryWorker', money: 180, drive: 0.45 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'bartender', money: 260, drive: 0.8 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'lifeguard', money: 410, drive: 0.7 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'teller', money: 880, drive: 0.85 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'nurse', money: 720, drive: 0.6 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'unemployed', money: -140, drive: 0.6 }] },
  { district: 'mill', tenure: 'rent', people: [{ job: 'painter', money: 230, drive: 0.7 }] },
];

function describe(t: Traits): string[] {
  const words: string[] = [];
  words.push(t.extraversion > 0.6 ? 'outgoing' : t.extraversion < 0.35 ? 'reserved' : 'easygoing');
  words.push(t.agreeableness > 0.6 ? 'kind' : t.agreeableness < 0.35 ? 'blunt' : 'fair-minded');
  if (t.conscientiousness > 0.65) words.push('organised');
  else if (t.conscientiousness < 0.3) words.push('a bit scattered');
  if (t.openness > 0.65) words.push('curious');
  if (t.neuroticism > 0.65) words.push('quick to worry');
  else if (t.neuroticism < 0.25) words.push('calm under pressure');
  return words;
}

/** A short personality description from the trait scores, e.g. "outgoing, kind and curious". */
export function personalityText(t: Traits): string {
  const w = describe(t);
  return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : w[0];
}

/** Saves from before the town grew (version 1) can't be carried over; the server and browser start a new town. */
export function isCurrentWorld(w: unknown): w is WorldState {
  return !!w && typeof w === 'object' && (w as WorldState).version === 2 && Array.isArray((w as WorldState).agents);
}

/** Daily rent for one household in a home, by kind and neighbourhood. */
export function rentFor(kind: BuildingKind, district: District): number {
  const base = kind === 'villa' ? RENT.villa : kind === 'apartments' ? RENT.apartments : RENT.home;
  return Math.round(base * (district === 'mill' ? 0.8 : district === 'hill' ? 1.25 : 1));
}

/** Fills in a new building's ownership, value, rent and size. */
export function makeBuilding(id: string, kind: BuildingKind, name: string, street: string, x: number, side: -1 | 1, look: Pick<Building, 'walls' | 'roof' | 'accent'>): Building {
  const district = districtAt(x);
  const isHome = kind === 'home' || kind === 'villa' || kind === 'apartments';
  return {
    id,
    kind,
    name,
    street,
    x,
    side,
    ...look,
    district,
    ownerId: null,
    value: kind === 'lot' ? LAND[district] : kind === 'home' || kind === 'villa' || kind === 'apartments' || kind === 'store' ? VALUE[kind] : 0,
    rent: isHome ? rentFor(kind, district) : kind === 'store' ? STORE_RENT : 0,
    units: kind === 'apartments' ? BUILD.apartments.units : isHome ? 1 : 0,
  };
}

/** A new person, with everything the simulation tracks about them. */
export function makePerson(
  rng: Rng,
  w: WorldState,
  p: Person,
  home: Building,
  work: Building | null,
  household: string,
  tenure: AgentState['tenure'],
  slot: number,
): AgentState {
  const job = JOBS[p.job];
  const traits: Traits = p.traits ?? {
    openness: round(rng.range(0.15, 0.9)),
    conscientiousness: round(rng.range(0.15, 0.9)),
    extraversion: round(rng.range(0.15, 0.9)),
    agreeableness: round(rng.range(0.2, 0.9)),
    neuroticism: round(rng.range(0.1, 0.85)),
  };
  const level = p.level ?? 0;
  const list = ANCHORS[home.kind].sofa ?? ANCHORS.home.sofa!;
  const anchor = list[slot % list.length];
  const wage = Math.round(job.wage * Math.pow(1.18, level));
  const occupation = level ? rankTitle(p.job, level) : job.title;
  return {
    id: `a${w.nextId++}`,
    name: p.name,
    surname: p.surname,
    age: p.age,
    color: p.color ?? rng.pick(COLORS),
    traits,
    bio: '',
    occupation,
    homeId: home.id,
    workId: work?.id ?? null,
    pos: toWorld(home, anchor),
    facing: toWorldFacing(home, anchor.facing),
    path: [],
    inside: home.id,
    anchor: slot,
    needs: {
      hunger: round(rng.range(45, 75)),
      energy: round(rng.range(70, 95)),
      social: round(rng.range(40, 80)),
      fun: round(rng.range(45, 85)),
      hygiene: round(rng.range(40, 70)),
    },
    activity: null,
    plan: '',
    beliefs: [],
    memories: [],
    relationships: {},
    conversationId: null,
    speaking: null,
    lastConversation: -1e9,
    lastPlanDay: 0,
    lastReflection: 0,
    money: p.money,
    wage,
    pension: job.pension ?? 0,
    pantry: rng.int(2, 6),
    ambition: p.ambition ?? rng.pick(job.ambitions),
    drive: p.drive,
    lastRentDay: 1,
    earnedToday: 0,
    performance: rng.int(0, 4),
    level,
    job: p.job === 'unemployed' ? '' : p.job,
    workedToday: 0,
    health: round(rng.range(70, 100)),
    sick: false,
    tenure,
    debts: [],
    project: null,
    lastDecisionDay: 0,
    household,
  };
}

/** The bio line, written from where someone lives and works. */
export function bioOf(a: AgentState, w: WorldState): string {
  const home = w.buildings.find((b) => b.id === a.homeId);
  const mates = w.agents.filter((o) => o !== a && o.household === a.household);
  const where = home ? (home.kind === 'apartments' ? `a flat in ${home.name}` : `the ${home.name}`) : 'town';
  const district = home ? { mill: 'Mill End', centre: 'Downtown', hill: 'Hillcrest' }[home.district] : '';
  const cls = home ? classOfHome(home.kind) : 'middle';
  const withWho = mates.length ? `, sharing ${where} with ${mates.map((m) => m.name).join(' and ')}` : ` who lives alone in ${where}`;
  return `${a.name} ${a.surname} is a ${a.age}-year-old ${a.occupation}${withWho} in ${district} (${cls === 'upper' ? 'well-off' : cls === 'working' ? 'working class' : 'middle class'}). ${capitalise(personalityText(a.traits))}.`;
}

export function generateWorld(seed: number): WorldState {
  const world: WorldState = {
    version: 2,
    seed,
    time: 6 * 60 + 30,
    rng: seed >>> 0,
    nextId: 1,
    buildings: [],
    agents: [],
    conversations: [],
    feed: [],
    buildingsRev: 1,
    treasury: 50000,
  };
  const rng = new Rng(world);
  const names = rng.shuffle([...FIRST_NAMES]);
  const surnames = rng.shuffle([...SURNAMES]);
  const used = { names: 0, surnames: 0, place: {} as Record<string, number> };

  // Buildings, street by street, west to east.
  for (const { street, lots } of PLAN) lots.forEach((kinds, li) => {
    const x = LOT_XS[li];
    kinds.forEach((kind, i) => {
      const side = (i === 0 ? -1 : 1) as -1 | 1;
      const look = rng.pick(PALETTE);
      const n = (used.place[kind] = (used.place[kind] ?? 0) + 1);
      const fixed = PLACE_NAMES[kind]?.[n - 1];
      const unique = fixed && kind !== 'apartments';
      const id = unique ? kind : `${street}-${x < 0 ? 'w' : 'e'}${Math.abs(x)}${side < 0 ? 'n' : 's'}`;
      const name = fixed ?? (kind === 'lot' ? 'Empty lot' : kind === 'store' ? 'Vacant storefront' : kind === 'villa' ? 'Villa' : 'House');
      const b = makeBuilding(id, kind, name, street, x, side, look);
      if (kind === 'tech') Object.assign(b, { walls: 'plaster', roof: 'slate', accent: '#2f6fd0' });
      if (kind === 'villa') Object.assign(b, { walls: 'plaster', accent: rng.pick(['#3f6f9c', '#2f8a83', '#8a5a44']) });
      world.buildings.push(b);
    });
  });
  const byKind = (k: BuildingKind) => world.buildings.filter((b) => b.kind === k);
  const workplace = (job: string) => {
    const kind = JOBS[job]?.work;
    return kind ? world.buildings.find((b) => b.kind === kind) ?? null : null;
  };

  // The founding families live in the Downtown houses closest to the café.
  const houses = byKind('home').filter((b) => b.district === 'centre' && b.street === 'linden').sort((p, q) => Math.abs(p.x + 40) - Math.abs(q.x + 40));
  const slotIn: Record<string, number> = {};
  const settle = (people: Person[], home: Building, tenure: AgentState['tenure']) => {
    const household = `h${world.nextId}`;
    if (home.kind !== 'apartments') home.name = `${people[0].surname} ${home.kind === 'villa' ? 'villa' : 'house'}`;
    for (const p of people) {
      const slot = (slotIn[home.id] = (slotIn[home.id] ?? -1) + 1);
      world.agents.push(makePerson(rng, world, p, home, workplace(p.job), household, tenure, slot));
    }
    if (tenure !== 'rent' && home.kind !== 'apartments') home.ownerId = world.agents[world.agents.length - people.length].id;
  };
  FOUNDERS.forEach((family, i) => settle(family, houses[i], 'rent'));

  // Everyone else, drawn from the seed.
  const free = (d: District, kind: BuildingKind) =>
    world.buildings.find((b) => b.kind === kind && b.district === d && world.agents.filter((a) => a.homeId === b.id).length === 0) ?? null;
  const flats = byKind('apartments');
  for (const h of NEWER) {
    const surname = surnames[used.surnames++ % surnames.length];
    const people: Person[] = h.people.map((p, k) => ({
      ...p,
      name: names[used.names++ % names.length],
      surname,
      age: p.job === 'investor' ? rng.int(64, 76) : h.people.length === 2 ? rng.int(28, 56) + k : rng.int(22, 48),
    }));
    let home: Building | null;
    if (h.district === 'hill') home = free('hill', 'villa');
    else if (h.district === 'centre') home = free('centre', 'home');
    else if (h.people.length === 2 && h.people[0].level) home = free('mill', 'home');
    else {
      // Fill the flats block by block.
      home = flats.find((b) => new Set(world.agents.filter((a) => a.homeId === b.id).map((a) => a.household)).size < b.units) ?? null;
    }
    if (!home) continue;
    settle(people, home, h.tenure);
  }

  // The investor owns Canal House and lives off its rent.
  const investor = world.agents.find((a) => a.job === 'investor');
  const canal = world.buildings.find((b) => b.name === 'Canal House');
  if (investor && canal) canal.ownerId = investor.id;

  // Mortgages on the homes bought with a loan.
  for (const a of world.agents) {
    if (a.tenure !== 'mortgage') continue;
    const home = world.buildings.find((b) => b.id === a.homeId)!;
    if (home.ownerId !== a.id) continue;
    const balance = Math.round(home.value * 0.55);
    a.debts.push({ kind: 'mortgage', balance, perDay: Math.round((balance * 1.18) / 200), purpose: `the mortgage on the ${home.name}` });
  }

  // The café and the grocery are businesses with their own books.
  for (const [kind, type] of [['cafe', 'cafe'], ['shop', 'grocery']] as const) {
    const b = byKind(kind)[0];
    const owner = world.agents.find((a) => a.workId === b.id && a.wage === 0);
    if (b && owner) {
      b.ownerId = owner.id;
      b.business = { ...newBusiness(type, owner, 1), lastProfit: 120 };
    }
  }

  for (const a of world.agents) a.bio = bioOf(a, world);

  // Households, coworkers and neighbours start out knowing each other.
  for (const a of world.agents) {
    for (const b of world.agents) {
      if (a === b) continue;
      const together = a.household === b.household;
      const coworkers = a.workId !== null && a.workId === b.workId;
      const ha = world.buildings.find((x) => x.id === a.homeId)!;
      const hb = world.buildings.find((x) => x.id === b.homeId)!;
      const neighbours = ha.district === hb.district;
      const base = together ? rng.int(40, 75) : coworkers ? rng.int(5, 30) : neighbours ? rng.int(-5, 22) : rng.int(-15, 12);
      a.relationships[b.id] = { affinity: base, talks: together ? 50 : coworkers ? 10 : neighbours ? rng.int(0, 5) : rng.int(0, 2), lastTalk: null };
    }
  }

  const vacant = world.buildings.filter((b) => b.kind === 'lot').length;
  world.feed.push({
    id: `e${world.nextId++}`,
    t: world.time,
    kind: 'system',
    text: `Agentville wakes up. ${world.agents.length} people live on Linden Street, from the flats of Mill End to the villas of Hillcrest. Oak Street and Maple Street are still mostly empty: ${vacant} lots are for sale.`,
    agents: [],
  });
  return world;
}

const round = (v: number) => Math.round(v * 100) / 100;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
