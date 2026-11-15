/** Shared data model for the town. Everything here is plain JSON so it can be saved and sent over the wire. */

export interface Vec2 {
  x: number;
  z: number;
}

export type BuildingKind = 'home' | 'cafe' | 'shop' | 'office' | 'tech' | 'park';

export interface Building {
  id: string;
  kind: BuildingKind;
  name: string;
  /** Centre of the lot along the street. */
  x: number;
  /** -1 for the north side of the street (z < 0), +1 for the south side. Buildings face the street. */
  side: -1 | 1;
  walls: 'brick' | 'plaster' | 'plasterBlue';
  roof: 'red' | 'slate';
  accent: string;
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

export type ActionKind = 'sleep' | 'eat_home' | 'eat_leftovers' | 'eat_out' | 'work' | 'side_project' | 'socialize' | 'relax' | 'wash' | 'shop' | 'idle';

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
}

export type Tone = 'warm' | 'friendly' | 'neutral' | 'tense' | 'heated';

export interface ConversationLine {
  speaker: string;
  text: string;
}

export interface Conversation {
  id: string;
  participants: [string, string];
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

export type FeedKind = 'conversation' | 'reaction' | 'plan' | 'reflection' | 'life' | 'system';

export interface FeedEvent {
  id: string;
  /** Sim minute. */
  t: number;
  kind: FeedKind;
  text: string;
  agents: string[];
}

export interface WorldState {
  version: 1;
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
}
