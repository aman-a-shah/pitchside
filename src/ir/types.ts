/**
 * Match IR — the universal intermediate representation.
 *
 * Every sport, whether reconstructed from real tracking data or synthesized from
 * events, is normalized into this single schema. The runtime is a pure function
 * of `MatchIR × clock` and knows nothing about the sport beyond `sport` + `fieldSpec`.
 *
 * Coordinate convention (matches three.js so the renderer needs no axis swaps):
 *   x — along the field length (goal-to-goal / baseline-to-baseline), meters, origin at center
 *   y — height above the ground (up), meters
 *   z — along the field width (touchline-to-touchline / sideline), meters, origin at center
 */

export type Sport = 'soccer' | 'basketball' | 'tennis';

export type Fidelity = 'tracking' | 'synth';

export type Mood = 'night' | 'day' | 'dusk' | 'indoor';

export interface FieldSpec {
  type: Sport;
  /** full length along x, meters */
  length: number;
  /** full width along z, meters */
  width: number;
  /** goal / hoop / net half-width along z, meters (sport-dependent meaning) */
  goalWidth?: number;
  /** goal height, meters */
  goalHeight?: number;
  /** tennis surface (drives court color) */
  surface?: 'clay' | 'grass' | 'hard';
}

export interface KitSpec {
  primary: string;
  secondary: string;
  shorts: string;
  socks: string;
  numberColor: string;
  skin: string;
}

export interface TeamInfo {
  id: string;
  name: string;
  short: string;
  formation?: string;
  kit: KitSpec;
  /** which end this team attacks: +1 attacks +x, -1 attacks -x */
  attackDir: 1 | -1;
}

export type EntityRole = 'player' | 'ball' | 'referee';
export type FieldPosition = 'GK' | 'DEF' | 'MID' | 'FWD' | 'G' | 'F' | 'C' | 'P';

export interface Entity {
  id: string;
  role: EntityRole;
  team?: string;
  name?: string;
  number?: number;
  position?: FieldPosition;
}

/**
 * A track is a set of parallel typed arrays sampled on a shared time grid.
 * Stored densely on a uniform grid (`hz`) so sampling is O(1) index math, but
 * the sampler still lerps between samples for smooth sub-frame playback.
 */
export interface Track {
  /** sample rate in Hz; sample i is at time t0 + i/hz */
  hz: number;
  /** time of first sample, seconds */
  t0: number;
  /** number of samples */
  count: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  /** ground speed (m/s) at each sample */
  speed: Float32Array;
  /** heading yaw (radians) at each sample; facing direction on the xz plane */
  heading: Float32Array;
  /** coarse locomotion/pose id per sample (see Action enum) */
  action: Uint8Array;
}

/** Coarse per-frame locomotion pose, derived from speed during synthesis. */
export enum Action {
  Idle = 0,
  Walk = 1,
  Jog = 2,
  Run = 3,
  Sprint = 4,
}

export type EventType =
  | 'kickoff'
  | 'pass'
  | 'carry'
  | 'shot'
  | 'goal'
  | 'save'
  | 'tackle'
  | 'turnover'
  | 'out'
  | 'restart'
  | 'foul'
  | 'card'
  | 'sub'
  | 'celebration'
  // basketball
  | 'made_shot'
  | 'missed_shot'
  | 'dunk'
  | 'rebound'
  | 'assist'
  // tennis
  | 'serve'
  | 'winner'
  | 'point';

/** An animation intent maps an event to a one-shot pose the actor should play. */
export type AnimIntent =
  | 'pass'
  | 'shot_finish'
  | 'tackle'
  | 'header'
  | 'save'
  | 'celebration'
  | 'jumpshot'
  | 'dunk'
  | 'serve'
  | 'forehand'
  | 'backhand'
  | 'none';

export interface MatchEvent {
  /** match-clock time, seconds */
  t: number;
  type: EventType;
  actor?: string;
  team?: string;
  /** field location [x, z] on the ground plane */
  location?: [number, number];
  target?: [number, number];
  animIntent?: AnimIntent;
  /** 0..1 dramatic importance — drives camera director & timeline markers */
  importance?: number;
  text?: string;
}

export interface VideoRef {
  provider: 'youtube';
  id: string;
  /** hand-authored (matchClockSeconds, videoSeconds) anchors for approximate sync */
  clockAnchors: [number, number][];
  label?: string;
}

export interface MatchMeta {
  title: string;
  competition?: string;
  date?: string;
  venue?: string;
  teams: TeamInfo[];
  score: Record<string, number>;
  attribution: string;
  videos?: VideoRef[];
  /** mood/time-of-day for art direction */
  mood?: Mood;
  /** film-stock era derived from the match date (see lib/era.ts) */
  era?: 'archive' | 'technicolor' | 'vhs' | 'modern';
}

/** A time-stamped scoreboard snapshot; the HUD shows the latest one at or before t. */
export interface ScoreSnapshot {
  t: number;
  home: number;
  away: number;
  /** sport-specific extra line, e.g. tennis game/set state */
  detail?: string;
}

/** One playing period, for mapping the continuous clock to broadcast minutes. */
export interface PeriodSpec {
  /** world-clock time this period starts at, seconds */
  t0: number;
  /** broadcast minute the period starts from (2nd half = 45 regardless of stoppage) */
  startMinute: number;
  label: string;
}

export interface MatchIR {
  id: string;
  sport: Sport;
  fidelity: Fidelity;
  meta: MatchMeta;
  fieldSpec: FieldSpec;
  /** total match-clock duration, seconds */
  duration: number;
  /**
   * Stretches where nothing happens on the pitch (free-kick setups, VAR,
   * injuries). The playback clock jumps over these while playing; the
   * timeline still shows real time so minutes stay broadcast-accurate.
   */
  deadSpans?: [number, number][];
  /** real-data matches: period boundaries for broadcast-minute display */
  periods?: PeriodSpec[];
  entities: Entity[];
  /** entity id -> track */
  tracks: Record<string, Track>;
  events: MatchEvent[];
  /** time-ordered scoreboard snapshots (home = teams[0], away = teams[1]) */
  scoreboard: ScoreSnapshot[];
}

/** Result of sampling a track at a given clock time. */
export interface Sample {
  x: number;
  y: number;
  z: number;
  speed: number;
  heading: number;
  action: Action;
}
