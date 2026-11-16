import { create } from 'zustand';
import type { AgentDetail, Building, FeedEvent, TickView, TownStatus } from '@agentville/core';

/** live: our own server. cloud: this browser runs the shared town. watch: watching another browser's town. demo: local only. */
export type Mode = 'connecting' | 'live' | 'cloud' | 'watch' | 'demo';

/** The town as the 3D view sees it, fed by the server or by the in-browser demo. */
interface TownState {
  mode: Mode;
  buildings: Building[];
  tick: TickView | null;
  /** Real time (performance.now) when the last tick arrived, for smooth clock interpolation. */
  tickAt: number;
  feed: FeedEvent[];
  status: TownStatus | null;
  selected: string | null;
  detail: AgentDetail | null;
  /** While the town replays the time nobody watched: how long that was, and how far the replay is. */
  catchUp: { awaySeconds: number; done: number } | null;
  /** Speed multiplier the demo runs at (the server's speed is fixed by its settings). */
  demoSpeed: number;
  select: (id: string | null) => void;
  setDemoSpeed: (speed: number) => void;
}

export const useTown = create<TownState>((set) => ({
  mode: 'connecting',
  buildings: [],
  tick: null,
  tickAt: 0,
  feed: [],
  status: null,
  selected: null,
  detail: null,
  catchUp: null,
  demoSpeed: 1,
  select: (id) => set({ selected: id, detail: null }),
  setDemoSpeed: (demoSpeed) => set({ demoSpeed }),
}));

const FEED_LIMIT = 60;

/** Copies the town's buildings into the view when they changed, so new and rebuilt places appear. */
export function syncBuildings(buildings: Building[], rev: number | undefined) {
  if (rev === undefined || rev === lastRev) return;
  lastRev = rev;
  useTown.setState({ buildings: buildings.map((b) => ({ ...b })) });
}
let lastRev: number | undefined;

export function pushFeed(e: FeedEvent) {
  useTown.setState((s) => ({ feed: [...s.feed, e].slice(-FEED_LIMIT) }));
}

if (import.meta.env.DEV || import.meta.env.MODE === 'artifact') (window as unknown as { __town: typeof useTown }).__town = useTown;
