/** Messages between the server and the 3D client over the WebSocket. */
import type { Building, FeedEvent, Needs, TickView, Tone } from './types';

export interface AgentDetail {
  id: string;
  name: string;
  surname: string;
  age: number;
  occupation: string;
  bio: string;
  personality: string;
  home: string;
  work: string | null;
  activity: string;
  needs: Needs;
  plan: string;
  beliefs: string[];
  /** What they're working toward in life. */
  ambition: string;
  money: number;
  earnedToday: number;
  /** Pay per hour of work, or 0 for the retired. */
  wage: number;
  pension: number;
  pantry: number;
  /** Newest first. */
  memories: { t: number; kind: string; text: string }[];
  relationships: { id: string; name: string; affinity: number; label: string; talks: number }[];
  conversation: { with: string; topic: string; tone: Tone | null; lines: { speaker: string; text: string }[] } | null;
}

export interface TownStatus {
  /** Who writes the conversations: Claude, Gemini, or the built-in scripts. */
  mind: 'claude' | 'gemini' | 'scripted';
  /** Why the scripted mind is in use, if it is. */
  note: string | null;
  budget: { weeklyUsd: number; dailyCapUsd: number; spentTodayUsd: number } | null;
  /** Free setups count calls instead of dollars. */
  calls?: { usedToday: number; dailyLimit: number } | null;
  /** Speed multiplier relative to 1x. */
  speed: number;
}

export type ServerMessage =
  | { type: 'hello'; seed: number; buildings: Building[]; tick: TickView; feed: FeedEvent[]; status: TownStatus }
  | { type: 'tick'; tick: TickView }
  | { type: 'feed'; event: FeedEvent }
  | { type: 'agent'; detail: AgentDetail | null }
  | { type: 'status'; status: TownStatus };

export type ClientMessage = { type: 'inspect'; id: string | null };
