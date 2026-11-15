import { create } from 'zustand';
import type { AgentDetail, Building, FeedEvent, TickView, TownStatus } from '@agentville/core';

export type Mode = 'connecting' | 'live' | 'demo';

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
  demoSpeed: 1,
  select: (id) => set({ selected: id, detail: null }),
  setDemoSpeed: (demoSpeed) => set({ demoSpeed }),
}));

const FEED_LIMIT = 60;

export function pushFeed(e: FeedEvent) {
  useTown.setState((s) => ({ feed: [...s.feed, e].slice(-FEED_LIMIT) }));
}

if (import.meta.env.DEV) (window as unknown as { __town: typeof useTown }).__town = useTown;
