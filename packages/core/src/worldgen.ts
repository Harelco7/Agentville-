/** Builds a new town from a seed. The same seed always gives the same town and the same people. */
import { ANCHORS, LOT_XS, TECH_LOT, toWorld, toWorldFacing } from './layout';
import { Rng } from './rng';
import type { Building, BuildingKind, Traits, WorldState } from './types';

const FIRST_NAMES = [
  'Maya', 'Dana', 'Noa', 'Eli', 'Lior', 'Sam', 'Ruth', 'Omar', 'Clara', 'Jonah', 'Iris', 'Theo', 'Leah', 'Felix',
  'Hana', 'Marco', 'Nina', 'Oscar', 'Talia', 'Victor', 'Ada', 'Ben', 'June', 'Rafael',
];
const SURNAMES = ['Cohen', 'Levi', 'Mizrahi', 'Hart', 'Novak', 'Rivera', 'Okafor', 'Lindqvist', 'Park', 'Moreau', 'Shapiro', 'Duarte'];
const COLORS = ['#c0563b', '#3f6f9c', '#6f8f3c', '#8a5aa8', '#d0903a', '#2f8a83', '#b04a6f', '#556070', '#a8743c', '#4b7bd0', '#7a6a58', '#c46d8e'];
const PALETTE: Pick<Building, 'walls' | 'roof' | 'accent'>[] = [
  { walls: 'brick', roof: 'slate', accent: '#8a5a44' },
  { walls: 'plaster', roof: 'red', accent: '#4f6d7a' },
  { walls: 'plasterBlue', roof: 'slate', accent: '#9c6b3f' },
  { walls: 'plaster', roof: 'slate', accent: '#6b7d4f' },
  { walls: 'brick', roof: 'red', accent: '#5a6a8a' },
];

const VENUE_NAMES: Record<Exclude<BuildingKind, 'home'>, string> = {
  cafe: 'Corner Café',
  shop: 'Maple Grocery',
  office: 'Town Works Office',
  tech: 'Linden Labs',
  park: 'Linden Park',
};

const JOBS: Record<string, { title: string; work: BuildingKind | null }> = {
  barista: { title: 'barista', work: 'cafe' },
  cafeOwner: { title: 'café owner', work: 'cafe' },
  grocer: { title: 'grocer', work: 'shop' },
  clerk: { title: 'town clerk', work: 'office' },
  developer: { title: 'software developer', work: 'tech' },
  designer: { title: 'product designer', work: 'tech' },
  accountant: { title: 'accountant', work: 'office' },
  gardener: { title: 'park gardener', work: 'park' },
  painter: { title: 'painter who works from home', work: null },
  writer: { title: 'novelist who works from home', work: null },
  retired: { title: 'retired teacher', work: null },
};
const JOB_ORDER = ['barista', 'grocer', 'clerk', 'developer', 'gardener', 'cafeOwner', 'accountant', 'designer', 'retired', 'writer'];

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

export function generateWorld(seed: number): WorldState {
  const world: WorldState = {
    version: 1,
    seed,
    time: 6 * 60 + 30,
    rng: seed >>> 0,
    nextId: 1,
    buildings: [],
    agents: [],
    conversations: [],
    feed: [],
  };
  const rng = new Rng(world);

  // Lots: one café, shop, office and park, the rest homes.
  const lots = LOT_XS.flatMap((x) => [-1, 1].map((side) => ({ x, side: side as -1 | 1 })));
  const kinds: BuildingKind[] = ['cafe', 'shop', 'office', 'park', ...Array<BuildingKind>(lots.length - 4).fill('home')];
  rng.shuffle(kinds);
  const surnames = rng.shuffle([...SURNAMES]);
  let homeIndex = 0;
  lots.forEach((lot, i) => {
    const kind = kinds[i];
    const look = rng.pick(PALETTE);
    const surname = kind === 'home' ? surnames[homeIndex++] : '';
    world.buildings.push({
      id: kind === 'home' ? `home-${surname.toLowerCase()}` : kind,
      kind,
      name: kind === 'home' ? `${surname} house` : VENUE_NAMES[kind],
      x: lot.x,
      side: lot.side,
      ...look,
    });
  });
  // Linden Labs, a small hi-tech company, sits on its own lot at the east end with room to hire newcomers.
  world.buildings.push({ id: 'tech', kind: 'tech', name: VENUE_NAMES.tech, x: TECH_LOT.x, side: TECH_LOT.side, walls: 'plaster', roof: 'slate', accent: '#2f6fd0' });

  // Households: 10 people in 6 of the homes, leaving 2 empty for newcomers.
  const homes = world.buildings.filter((b) => b.kind === 'home');
  const sizes = [2, 2, 2, 2, 1, 1];
  const names = rng.shuffle([...FIRST_NAMES]);
  const jobs = [...JOB_ORDER];
  const colors = rng.shuffle([...COLORS]);
  let n = 0;
  sizes.forEach((size, h) => {
    const home = homes[h];
    const surname = home.name.replace(' house', '');
    const coupleAge = rng.int(24, 68);
    for (let k = 0; k < size; k++) {
      const jobKey = jobs[n];
      const job = JOBS[jobKey];
      const age = jobKey === 'retired' ? rng.int(66, 74) : Math.max(21, Math.min(64, coupleAge + rng.int(-4, 4)));
      const traits: Traits = {
        openness: round(rng.range(0.15, 0.9)),
        conscientiousness: round(rng.range(0.15, 0.9)),
        extraversion: round(rng.range(0.15, 0.9)),
        agreeableness: round(rng.range(0.2, 0.9)),
        neuroticism: round(rng.range(0.1, 0.85)),
      };
      const name = names[n];
      const work = job.work ? world.buildings.find((b) => b.kind === job.work)! : null;
      const anchor = ANCHORS.home.sofa![k % 2];
      const pos = toWorld(home, anchor);
      const housemate = size === 2 && k === 1 ? world.agents[world.agents.length - 1] : null;
      const bio =
        `${name} ${surname} is a ${age}-year-old ${job.title}` +
        (housemate ? `, sharing the ${surname} house with ${housemate.name}` : size === 2 ? ` living in the ${surname} house` : ` who lives alone in the ${surname} house`) +
        `. ${capitalise(personalityText(traits))}.`;
      world.agents.push({
        id: `a${n + 1}`,
        name,
        surname,
        age,
        color: colors[n % colors.length],
        traits,
        bio,
        occupation: job.title,
        homeId: home.id,
        workId: work?.id ?? null,
        pos,
        facing: toWorldFacing(home, anchor.facing),
        path: [],
        inside: home.id,
        anchor: k % 2,
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
      });
      n++;
    }
  });

  // Housemates and neighbours start out knowing each other a little.
  for (const a of world.agents) {
    for (const b of world.agents) {
      if (a === b) continue;
      const together = a.homeId === b.homeId;
      const coworkers = a.workId !== null && a.workId === b.workId;
      const base = together ? rng.int(35, 70) : coworkers ? rng.int(5, 30) : rng.int(-10, 20);
      a.relationships[b.id] = { affinity: base, talks: together ? 50 : coworkers ? 10 : rng.int(0, 4), lastTalk: null };
    }
  }

  world.feed.push({ id: 'e0', t: world.time, kind: 'system', text: `Agentville wakes up. ${world.agents.length} people live on Linden Street.`, agents: [] });
  return world;
}

const round = (v: number) => Math.round(v * 100) / 100;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
