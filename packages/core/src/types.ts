/** Shared data model for the town. Everything here is plain JSON so it can be saved and sent over the wire. */

export interface Vec2 {
  x: number;
  z: number;
}

export type BuildingKind = 'home' | 'cafe' | 'shop' | 'office' | 'park';

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

export type MemoryKind = 'observation' | 'conversation' | 'gossip' | 'reflection' | 'plan' | 'reaction';

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

export type ActionKind = 'sleep' | 'eat_home' | 'eat_out' | 'work' | 'socialize' | 'relax' | 'wash' | 'shop' | 'idle';

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
}

export interface TickView {
  time: number;
  agents: AgentView[];
}
