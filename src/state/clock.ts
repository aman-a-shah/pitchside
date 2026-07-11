/**
 * Playback clock — the master timeline the whole runtime is a function of.
 *
 * Design note: the raw playhead time lives in a module-level mutable singleton
 * (`playhead`), NOT in React/zustand state. The 3D scene reads `playhead.t`
 * imperatively inside `useFrame`, so advancing time 60×/second never triggers a
 * React re-render. Zustand holds only *control* state (playing/speed/mode/…) plus
 * a throttled `uiT` used by the timeline scrubber label.
 */

import { create } from 'zustand';

export type CameraMode = 'orbit' | 'fly' | 'broadcast' | 'player' | 'cinematic';

/** Mutable, non-reactive playhead. Scene + driver read/write this directly. */
export const playhead = {
  t: 0,
  /** set by <ClockDriver/> so UI seeks can force a render in demand mode */
  invalidate: null as null | (() => void),
};

interface ClockState {
  playing: boolean;
  speed: number;
  duration: number;
  /** dead stretches the clock jumps over while playing (see MatchIR.deadSpans) */
  deadSpans: [number, number][];
  /** throttled copy of playhead.t for UI display (~15Hz) */
  uiT: number;

  cameraMode: CameraMode;
  followId: string | null;
  selectedId: string | null;
  videoOpen: boolean;
  showTactical: boolean;
  statsOpen: boolean;
  shortcutsOpen: boolean;
  rosterOpen: boolean;

  // actions
  setDuration: (d: number) => void;
  setDeadSpans: (s: [number, number][]) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  nudge: (dt: number) => void;
  setSpeed: (s: number) => void;
  setUiT: (t: number) => void;
  setCameraMode: (m: CameraMode) => void;
  setFollow: (id: string | null) => void;
  select: (id: string | null) => void;
  setVideoOpen: (v: boolean) => void;
  toggleTactical: () => void;
  setStatsOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  setRosterOpen: (v: boolean) => void;
}

export const useClock = create<ClockState>((set, get) => ({
  playing: false,
  speed: 1,
  duration: 0,
  deadSpans: [],
  uiT: 0,

  cameraMode: 'broadcast',
  followId: null,
  selectedId: null,
  videoOpen: false,
  showTactical: true,
  statsOpen: false,
  shortcutsOpen: false,
  rosterOpen: false,

  setDuration: (d) => set({ duration: d }),
  setDeadSpans: (s) => set({ deadSpans: s }),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  toggle: () => set((s) => ({ playing: !s.playing })),
  seek: (t) => {
    const d = get().duration || 0;
    const clamped = Math.max(0, Math.min(d, t));
    playhead.t = clamped;
    playhead.invalidate?.();
    set({ uiT: clamped });
  },
  nudge: (dt) => get().seek(playhead.t + dt),
  setSpeed: (s) => set({ speed: s }),
  setUiT: (t) => set({ uiT: t }),
  setCameraMode: (m) => set({ cameraMode: m }),
  setFollow: (id) =>
    set((s) => ({
      followId: id,
      cameraMode: id ? 'player' : s.cameraMode === 'player' ? 'broadcast' : s.cameraMode,
    })),
  select: (id) => set({ selectedId: id }),
  // The right edge hosts one panel at a time: video ⊕ stats.
  setVideoOpen: (v) => set(v ? { videoOpen: true, statsOpen: false } : { videoOpen: false }),
  toggleTactical: () => set((s) => ({ showTactical: !s.showTactical })),
  setStatsOpen: (v) => set(v ? { statsOpen: true, videoOpen: false } : { statsOpen: false }),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  setRosterOpen: (v) => set({ rosterOpen: v }),
}));

// Debug/automation hook: lets a headless harness drive the clock deterministically.
if (typeof window !== 'undefined') {
  (window as unknown as { __pitchside?: unknown }).__pitchside = { clock: useClock, playhead };
}
