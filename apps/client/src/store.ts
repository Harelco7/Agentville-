import { create } from 'zustand';

/** View-only state: the light's hour of day and the building shown in cutaway. */
interface ViewState {
  /** Hour of the day, 0 to 24, following the town clock. */
  hour: number;
  /** The building shown in cutaway, or null. */
  cutaway: string | null;
  setHour: (hour: number) => void;
  toggleCutaway: (id: string) => void;
  clearCutaway: () => void;
}

export const useView = create<ViewState>((set) => ({
  hour: 7,
  cutaway: null,
  setHour: (hour) => set({ hour: ((hour % 24) + 24) % 24 }),
  toggleCutaway: (id) => set((s) => ({ cutaway: s.cutaway === id ? null : id })),
  clearCutaway: () => set({ cutaway: null }),
}));

// Handy for debugging and automated screenshots in development builds.
if (import.meta.env.DEV) (window as unknown as { __view: typeof useView }).__view = useView;
