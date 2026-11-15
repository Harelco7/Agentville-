/** Messages for the free cloud setup, where a viewer's browser runs the town (see apps/server/src/cloud). */
import type { AgentDetail, TownStatus } from './protocol';
import type { Building, FeedEvent, TickView } from './types';

export interface CloudMindInfo {
  /** A Gemini key is set on the server. */
  enabled: boolean;
  model: string | null;
  usedToday: number;
  dailyLimit: number;
}

export type CloudJoin =
  | { role: 'host'; seed: number; savedAt: number | null; now: number; mind: CloudMindInfo; world: unknown }
  | { role: 'watcher'; mind: CloudMindInfo };

export interface CloudSaveReply {
  /** False when another browser has taken over the town. */
  ok: boolean;
  /** Someone else is watching, so the host should share its view every second. */
  watched: boolean;
}

/** What the host shares with watchers. */
export interface CloudLive {
  at: number;
  buildings: Building[];
  tick: TickView;
  feed: FeedEvent[];
  details: Record<string, AgentDetail>;
  status: TownStatus;
}

export interface CloudWatch {
  /** Nobody is running the town: the watcher should take over. */
  free: boolean;
  live: CloudLive | null;
}

export type CloudMindReply =
  | { ok: true; result: unknown; usedToday: number; dailyLimit: number }
  | { ok: false; reason: 'disabled' | 'not_host' | 'daily_limit' | 'auth' | 'rate_limit' | 'bad_output' | 'blocked' | 'unavailable'; message: string; usedToday: number; dailyLimit: number };
