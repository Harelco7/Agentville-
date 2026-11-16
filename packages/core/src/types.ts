/** Shared data model for the town. Everything here is plain JSON so it can be saved and sent over the wire. */

export interface Vec2 {
  x: number;
  z: number;
}

export type BuildingKind =
  | 'home'
  | 'apartments'
  | 'villa'
  | 'cafe'
  | 'shop'
  | 'office'
  | 'tech'
  | 'park'
  | 'townhall'
  | 'bank'
  | 'clinic'
  | 'club'
  | 'pool'
  | 'factory'
  | 'store'
  | 'lot';

/** The three neighbourhoods along the avenue, from poor to rich. */
export type District = 'mill' | 'centre' | 'hill';
/** Which class a household belongs to follows from where they live. */
export type SocialClass = 'working' | 'middle' | 'upper';

/** Kinds of small business a resident can open in a storefront. */
export type BusinessType = 'cafe' | 'grocery' | 'bakery' | 'restaurant' | 'gallery' | 'bookshop' | 'salon' | 'gym' | 'boutique' | 'workshop' | 'studio';

/** A business with an owner and its own books: the café, the grocery, and every store a resident opens. */
export interface Business {
  type: BusinessType;
  /** The owner's prices as a share of the usual price: below 1 is a discount, above 1 a premium. */
  priceFactor: number;
  /** How good it is, 0 to 1 (from the owner's care and drive). Customers notice. */
  quality: number;
  /** Customers today and yesterday, and what today's sales cost in supplies. */
  sales: number;
  lastSales: number;
  supplies: number;
  /** The price level last announced in the news, so price changes only make the news when they matter. */
  announced: number;
  ownerId: string;
  /** Investors who put money in, and the share of profit each takes. */
  partners: { id: string; share: number; invested: number }[];
  /** Takings since the last daily settlement, wages owed, and the last day's profit. */
  till: number;
  wagesDue: number;
  lastProfit: number;
  /** Days in a row the business lost money. */
  badDays: number;
  openedDay: number;
}

/** A building going up on a lot. */
export interface Construction {
  /** What it becomes. */
  target: 'home' | 'villa' | 'apartments' | 'store';
  /** For a store, which business. */
  business?: BusinessType;
  ownerId: string;
  /** Builder hours done and needed. */
  done: number;
  needed: number;
  startedDay: number;
}

export interface Building {
  id: string;
  kind: BuildingKind;
  name: string;
  /** Centre of the lot along the street. */
  x: number;
  /** The long street it faces (see STREETS). */
  street: string;
  /** -1 for the north side of its street, +1 for the south side. Buildings face the street. */
  side: -1 | 1;
  walls: 'brick' | 'plaster' | 'plasterBlue';
  roof: 'red' | 'slate';
  accent: string;
  district: District;
  /** Who owns it (a resident id), or null when the town does. */
  ownerId: string | null;
  /** What it would sell for, and the daily rent per household for homes. */
  value: number;
  rent: number;
  /** Households a home can hold (1 for a house or villa, several for apartments). */
  units: number;
  business?: Business;
  construction?: Construction;
}

export type NeedKey = 'hunger' | 'energy' | 'social' | 'fun' | 'hygiene';
/** Each need runs from 0 (desperate) to 100 (fully satisfied). */
export type Needs = Record<NeedKey, number>;

/** Personality on a 0 to 1 scale for each trait. */
export interface Traits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export type MemoryKind = 'observation' | 'conversation' | 'gossip' | 'reflection' | 'plan' | 'reaction' | 'life';

export interface Memory {
  /** Sim minute when it happened. */
  t: number;
  kind: MemoryKind;
  text: string;
  /** 1 (trivial) to 10 (life changing). */
  importance: number;
}

export interface Relationship {
  /** -100 (enemy) to 100 (best friend). */
  affinity: number;
  /** How many conversations they have had. */
  talks: number;
  /** Sim minute of their last conversation. */
  lastTalk: number | null;
}

export type ActionKind =
  | 'sleep'
  | 'eat_home'
  | 'eat_leftovers'
  | 'eat_out'
  | 'work'
  | 'build'
  | 'side_project'
  | 'socialize'
  | 'relax'
  | 'wash'
  | 'shop'
  | 'visit'
  | 'swim'
  | 'party'
  | 'doctor'
  | 'bank'
  | 'job_hunt'
  | 'idle';

export interface Activity {
  kind: ActionKind;
  buildingId: string;
  /** Sim minute when the activity ends (after arriving). */
  until: number;
  /** Duration in sim minutes once the agent arrives. */
  duration: number;
  /** Human-readable, e.g. "working at Corner Café". */
  label: string;
  started: boolean;
}

export interface AgentState {
  id: string;
  name: string;
  surname: string;
  age: number;
  color: string;
  traits: Traits;
  bio: string;
  occupation: string;
  homeId: string;
  /** People who live together share a household: they move together and split the rent. */
  household: string;
  workId: string | null;

  pos: Vec2;
  facing: number;
  path: Vec2[];
  /** Building the agent is inside, or null when outdoors. */
  inside: string | null;
  anchor: number;

  needs: Needs;
  activity: Activity | null;
  /** Today's intention, written by the agent's mind each morning. */
  plan: string;
  /** Lasting beliefs from nightly reflection. */
  beliefs: string[];
  memories: Memory[];
  relationships: Record<string, Relationship>;

  conversationId: string | null;
  /** The line the agent is saying right now, if any. */
  speaking: string | null;
  /** Sim minute of the agent's last conversation. */
  lastConversation: number;
  /** Sim minute of the last plan and reflection. */
  lastPlanDay: number;
  lastReflection: number;

  /** Money in dollars. Can go below zero (debt). Nothing is free: meals, groceries and rent all cost money. */
  money: number;
  /** Pay per hour of work (a pension per day for the retired is paid as `pension`). */
  wage: number;
  pension: number;
  /** Meals' worth of groceries at home. Without groceries, eating at home means scraping by on leftovers. */
  pantry: number;
  /** What this person is working toward in life, in their own words. */
  ambition: string;
  /** How hard they push for it, 0 to 1. */
  drive: number;
  /** Day of the last rent payment, and money earned today (for the panel and the mind). */
  lastRentDay: number;
  earnedToday: number;
  /** The highest savings milestone they have reached (each one makes the news once). */
  topMilestone?: number;
  /** In debt and the town knows it (so the news isn't repeated every time they cross zero). */
  broke?: boolean;

  /** Job record: reliability at work (shifts done minus shifts missed), level (promotions), and days unemployed. */
  performance: number;
  level: number;
  /** Their base job, for titles and promotions (e.g. "barista"). Empty for the unemployed. */
  job: string;
  /** Hours worked today, to spot missed shifts. */
  workedToday: number;
  /** Health from 0 to 100; when it drops, they see a doctor and stay home. */
  health: number;
  sick: boolean;
  /** Owning their home outright, paying a mortgage, or renting. */
  tenure: 'rent' | 'mortgage' | 'own';
  /** Bank loans and mortgages: what is owed and the daily repayment. */
  debts: { kind: 'loan' | 'mortgage'; balance: number; perDay: number; purpose: string }[];
  /** A big step they have decided on and are working toward, e.g. opening a bakery. */
  project: Project | null;
  /** Sim day of their last big decision, so they don't decide something new every hour. */
  lastDecisionDay: number;
}

/** A big step a resident is working toward. */
export interface Project {
  kind: 'open_business' | 'build_home' | 'build_apartments' | 'move_up';
  business?: BusinessType;
  /** Where it will happen, once chosen. */
  buildingId?: string;
  partnerId?: string;
}

export type Tone = 'warm' | 'friendly' | 'neutral' | 'tense' | 'heated';

export interface ConversationLine {
  speaker: string;
  text: string;
}

export interface Conversation {
  id: string;
  /** Two to four people. */
  participants: string[];
  buildingId: string | null;
  startedAt: number;
  status: 'pending' | 'playing' | 'done';
  lines: ConversationLine[];
  lineIndex: number;
  /** Real seconds until the next line is spoken. */
  lineTimer: number;
  topic: string;
  tone: Tone;
  summary: string;
}

export type FeedKind =
  | 'conversation'
  | 'group'
  | 'friendship'
  | 'fight'
  | 'reaction'
  | 'plan'
  | 'reflection'
  | 'life'
  | 'money'
  | 'job'
  | 'business'
  | 'build'
  | 'move'
  | 'newcomer'
  | 'party'
  | 'decision'
  | 'system';

export interface FeedEvent {
  id: string;
  /** Sim minute. */
  t: number;
  kind: FeedKind;
  text: string;
  agents: string[];
  /** Where it happened, so the camera can fly there. */
  at?: Vec2;
}

export interface WorldState {
  version: 2;
  seed: number;
  /** Sim minutes since day 1, 00:00. */
  time: number;
  /** State of the seeded random generator, so a saved world continues deterministically. */
  rng: number;
  nextId: number;
  buildings: Building[];
  agents: AgentState[];
  conversations: Conversation[];
  feed: FeedEvent[];
  /** Bumped whenever a building changes (built, opened, sold), so views know to redraw. */
  buildingsRev: number;
  /** Money the town has collected and spent: taxes and public wages. */
  treasury: number;
}

/** What the 3D view needs for one agent every tick. */
export interface AgentView {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  facing: number;
  moving: boolean;
  /** Riding a scooter or driving along the avenue on longer trips. */
  riding: boolean;
  inside: string | null;
  activity: string;
  speaking: string | null;
  needs: Needs;
  /** Skin, hair and clothes. */
  looks: Looks;
}

/** How a person looks. Derived from who they are, so it never changes between saves. */
export interface Looks {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'crop' | 'long' | 'bun' | 'curly' | 'bald';
  top: string;
  sleeves: 'short' | 'long';
  bottom: string;
  legs: 'trousers' | 'shorts' | 'skirt';
  shoes: string;
}

export interface TickView {
  time: number;
  agents: AgentView[];
  /** World.buildingsRev: when it changes, the buildings need to be fetched again. */
  rev: number;
}
