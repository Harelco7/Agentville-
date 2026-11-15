import { create } from 'zustand';

/** Client-only view state for the look test. The real world clock moves to the server in Phase 1. */
interface ViewState {
  /** Hour of the day, 0 to 24. */
  hour: number;
  /** When true, time advances on its own. */
  playing: boolean;
  /** The house shown in cutaway, or null. */
  cutaway: string | null;
  setHour: (hour: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleCutaway: (id: string) => void;
  clearCutaway: () => void;
}

export const useView = create<ViewState>((set) => ({
  hour: 16.5,
  playing: false,
  cutaway: null,
  setHour: (hour) => set({ hour: ((hour % 24) + 24) % 24 }),
  setPlaying: (playing) => set({ playing }),
  toggleCutaway: (id) => set((s) => ({ cutaway: s.cutaway === id ? null : id })),
  clearCutaway: () => set({ cutaway: null }),
}));

// Handy for debugging and automated screenshots in development builds.
if (import.meta.env.DEV) (window as unknown as { __view: typeof useView }).__view = useView;
