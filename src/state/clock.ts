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
/** player cam view: through the player's eyes, or the follow cam behind them */
export type PovView = 'first' | 'third';

/** Mutable, non-reactive playhead. Scene + driver read/write this directly. */
export const playhead = {
  t: 0,
  /** set by <ClockDriver/> so UI seeks can force a render in demand mode */
  invalidate: null as null | (() => void),
};

/**
 * Whose eyes the POV camera is looking through right now. Written by the
 * camera rig each frame (the target can change as possession moves), read by
 * each athlete inside useFrame to hide its own body — same imperative channel
 * pattern as `playhead`, so a possession change never re-renders React.
 */
export const povTarget = { id: null as string | null };

interface ClockState {
  playing: boolean;
  speed: number;
  duration: number;
  /** throttled copy of playhead.t for UI display (~15Hz) */
  uiT: number;

  cameraMode: CameraMode;
  /** player cam: first person (their eyes) or third person (behind them) */
  povView: PovView;
  /** player cam target; null = auto (whoever is nearest the ball) */
  followId: string | null;
  selectedId: string | null;
  /** director mode is re-running a goal in slow motion (drives the REPLAY badge) */
  replayActive: boolean;
  videoOpen: boolean;
  showTactical: boolean;
  statsOpen: boolean;
  shortcutsOpen: boolean;
  rosterOpen: boolean;
  /** ⌘K "Ask the match" command bar */
  askOpen: boolean;
  /** master audio switch — crowd, whistles and commentary */
  soundOn: boolean;

  // actions
  setDuration: (d: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  nudge: (dt: number) => void;
  setSpeed: (s: number) => void;
  setUiT: (t: number) => void;
  setCameraMode: (m: CameraMode) => void;
  setPovView: (v: PovView) => void;
  setFollow: (id: string | null) => void;
  setReplayActive: (v: boolean) => void;
  select: (id: string | null) => void;
  setVideoOpen: (v: boolean) => void;
  toggleTactical: () => void;
  setStatsOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  setRosterOpen: (v: boolean) => void;
  setAskOpen: (v: boolean) => void;
  toggleSound: () => void;
}

export const useClock = create<ClockState>((set, get) => ({
  playing: false,
  speed: 1,
  duration: 0,
  uiT: 0,

  cameraMode: 'broadcast',
  povView: 'third',
  followId: null,
  selectedId: null,
  replayActive: false,
  videoOpen: false,
  showTactical: true,
  statsOpen: false,
  shortcutsOpen: false,
  rosterOpen: false,
  askOpen: false,
  soundOn: true,

  setDuration: (d) => set({ duration: d }),
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
  setPovView: (v) => set({ povView: v }),
  // picking a target means "watch this player" — enter the player cam if we
  // aren't in it; clearing the target (auto) keeps the cam on possession
  setFollow: (id) =>
    set((s) => ({
      followId: id,
      cameraMode: id ? 'player' : s.cameraMode,
    })),
  select: (id) => set({ selectedId: id }),
  setReplayActive: (v) => set({ replayActive: v }),
  // The right edge hosts one panel at a time: video ⊕ stats.
  setVideoOpen: (v) => set(v ? { videoOpen: true, statsOpen: false } : { videoOpen: false }),
  toggleTactical: () => set((s) => ({ showTactical: !s.showTactical })),
  setStatsOpen: (v) => set(v ? { statsOpen: true, videoOpen: false } : { statsOpen: false }),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  setRosterOpen: (v) => set({ rosterOpen: v }),
  setAskOpen: (v) => set({ askOpen: v }),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
}));

// Debug/automation hook: lets a headless harness drive the clock deterministically.
if (typeof window !== 'undefined') {
  (window as unknown as { __pitchside?: unknown }).__pitchside = { clock: useClock, playhead };
}
