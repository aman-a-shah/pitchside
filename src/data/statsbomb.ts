/**
 * StatsBomb Open Data access layer.
 *
 * The build-time script (`scripts/fetch-statsbomb.mjs`) bakes a compact index of
 * every available real match into `public/data/index.json`. The heavy per-match
 * payloads — the full event stream (~3–6MB) and lineups — are fetched here, on
 * demand, straight from the public GitHub repo (CORS-enabled), then cached.
 *
 * License: StatsBomb Open Data — free for research / non-commercial use with
 * attribution. https://github.com/statsbomb/open-data
 */

const RAW = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';

// ----------------------------- index types -----------------------------------

/** One row of public/data/index.json (compact keys — it ships to the browser). */
export interface SBIndexMatch {
  id: number;
  /** match date YYYY-MM-DD */
  d: string;
  /** kickoff time HH:MM:SS.mmm (local), if known */
  ko: string | null;
  /** competition name */
  c: string;
  /** competition country/region */
  cc: string;
  /** gender */
  g: 'm' | 'f';
  /** season name */
  s: string;
  /** competition stage, e.g. "Final" */
  st: string | null;
  /** stadium */
  v: string | null;
  h: string;
  a: string;
  hg: number;
  ag: number;
  hm?: string | null;
  am?: string | null;
  w?: number | null;
}

export interface SBIndex {
  generated: string;
  attribution: string;
  count: number;
  matches: SBIndexMatch[];
}

// ----------------------------- event types -----------------------------------
// Minimal typings for the fields the reconstructor actually reads.

export interface SBRef {
  id: number;
  name: string;
}

export interface SBFreezeFrame {
  location: [number, number];
  player: SBRef;
  position: SBRef;
  teammate: boolean;
}

export interface SBEvent {
  id: string;
  index: number;
  period: number;
  /** clock within the period, resets each period: "00:00:00.578" */
  timestamp: string;
  minute: number;
  second: number;
  type: SBRef;
  team: SBRef;
  player?: SBRef;
  position?: SBRef;
  /** [x 0..120, y 0..80] in the acting team's attacking frame */
  location?: [number, number];
  duration?: number;
  pass?: {
    recipient?: SBRef;
    length?: number;
    height?: SBRef;
    end_location: [number, number];
    outcome?: SBRef;
    type?: SBRef;
  };
  carry?: { end_location: [number, number] };
  shot?: {
    statsbomb_xg?: number;
    end_location: [number, number] | [number, number, number];
    outcome: SBRef;
    type?: SBRef;
    freeze_frame?: SBFreezeFrame[];
  };
  goalkeeper?: {
    type: SBRef;
    outcome?: SBRef;
    end_location?: [number, number];
  };
  substitution?: { replacement: SBRef; outcome?: SBRef };
  foul_committed?: { card?: SBRef };
  bad_behaviour?: { card?: SBRef };
  duel?: { type?: SBRef; outcome?: SBRef };
  interception?: { outcome?: SBRef };
  tactics?: {
    formation: number;
    lineup: { player: SBRef; position: SBRef; jersey_number: number }[];
  };
}

export interface SBLineupPlayer {
  player_id: number;
  player_name: string;
  player_nickname: string | null;
  jersey_number: number;
}

export interface SBLineupTeam {
  team_id: number;
  team_name: string;
  lineup: SBLineupPlayer[];
}

// ----------------------------- fetchers --------------------------------------

export type Progress = (loadedBytes: number, totalBytes: number | null, label: string) => void;

async function getJSON<T>(url: string, label: string, onProgress?: Progress): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${label} (${res.status})`);
  if (!res.body || !onProgress) return (await res.json()) as T;

  const total = Number(res.headers.get('content-length')) || null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total, label);
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}

let indexPromise: Promise<SBIndex> | null = null;

/** The full real-match index (memoized; ~1MB, gzip-served by Next). */
export function loadIndex(): Promise<SBIndex> {
  indexPromise ??= getJSON<SBIndex>('/data/index.json', 'match index');
  return indexPromise;
}

const eventsCache = new Map<number, Promise<SBEvent[]>>();
const lineupsCache = new Map<number, Promise<SBLineupTeam[]>>();

/** Full real event stream for one match (heavy — fetched on demand, cached). */
export function loadEvents(matchId: number, onProgress?: Progress): Promise<SBEvent[]> {
  let p = eventsCache.get(matchId);
  if (!p) {
    p = getJSON<SBEvent[]>(`${RAW}/events/${matchId}.json`, 'match events', onProgress);
    p.catch(() => eventsCache.delete(matchId)); // don't cache failures
    eventsCache.set(matchId, p);
  }
  return p;
}

export function loadLineups(matchId: number): Promise<SBLineupTeam[]> {
  let p = lineupsCache.get(matchId);
  if (!p) {
    p = getJSON<SBLineupTeam[]>(`${RAW}/lineups/${matchId}.json`, 'lineups');
    p.catch(() => lineupsCache.delete(matchId));
    lineupsCache.set(matchId, p);
  }
  return p;
}
