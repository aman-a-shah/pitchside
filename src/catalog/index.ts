/**
 * Match catalog — every entry is a REAL match from StatsBomb Open Data.
 *
 * Two tiers:
 *  - FEATURED: a hand-curated marquee shelf (finals, classics) whose metadata
 *    is inlined so the homepage renders synchronously.
 *  - the full library: ~4,000 real matches from `public/data/index.json`,
 *    loaded on demand via `loadCatalog()`.
 *
 * `buildMatch(id)` fetches the match's real event stream + lineups and
 * reconstructs a full MatchIR. Ids are `sb-<statsbomb match id>`.
 */

import { MatchIR, Mood, Sport } from '@/ir/types';
import { Era, eraOf } from '@/lib/era';
import {
  SBIndexMatch,
  loadEvents,
  loadIndex,
  loadLineups,
  Progress,
} from '@/data/statsbomb';
import { reconstructSoccerMatch } from '@/data/reconstruct';
import { accentFor, teamCode } from '@/data/teamKits';

export interface CatalogTeam {
  name: string;
  short: string;
  color: string;
}

export interface CatalogEntry {
  id: string;
  sbId: number;
  sport: Sport;
  title: string;
  competition: string;
  season: string;
  stage?: string;
  gender: 'm' | 'f';
  venue?: string;
  date?: string;
  mood: Mood;
  era: Era;
  teams: CatalogTeam[];
  /** real final score [home, away] */
  score: [number, number];
  accent: string;
  blurb: string;
  featured?: boolean;
}

// ------------------------------- mapping --------------------------------------

export function moodOf(ko: string | null | undefined, date?: string | null): Mood {
  // pre-VHS matches present in daylight — the era film grade is built for
  // sunlit stock and floodlit night football is an anachronism there
  // (mirrors the same rule in reconstruct.ts)
  const era = eraOf(date);
  if (era === 'archive' || era === 'technicolor') return 'day';
  const hour = ko ? parseInt(ko.slice(0, 2), 10) : 20;
  // evening kickoffs are floodlit affairs — by full time it's dark anyway
  return hour >= 17 || hour < 6 ? 'night' : hour >= 16 ? 'dusk' : 'day';
}

export function entryFromIndex(m: SBIndexMatch, blurb?: string, featured?: boolean): CatalogEntry {
  const stage = m.st && m.st !== 'Regular Season' ? m.st : undefined;
  return {
    id: `sb-${m.id}`,
    sbId: m.id,
    sport: 'soccer',
    title: `${m.h} vs ${m.a}`,
    competition: m.c,
    season: m.s,
    stage,
    gender: m.g,
    venue: m.v ?? undefined,
    date: m.d,
    mood: moodOf(m.ko, m.d),
    era: eraOf(m.d),
    teams: [
      { name: m.h, short: teamCode(m.h), color: accentFor(m.h) },
      { name: m.a, short: teamCode(m.a), color: accentFor(m.a) },
    ],
    score: [m.hg, m.ag],
    accent: accentFor(m.h),
    blurb:
      blurb ??
      `${m.h} ${m.hg}–${m.ag} ${m.a}${stage ? ` · ${stage}` : ''} — every pass, shot and save from the real match, rebuilt in 3D.`,
    featured,
  };
}

// ------------------------------- featured shelf --------------------------------
// Inlined rows from public/data/index.json (static facts about historic matches)
// so the homepage needs no fetch. `node scripts/fetch-statsbomb.mjs` re-verifies.

const F = (m: SBIndexMatch, blurb: string) => entryFromIndex(m, blurb, true);

export const FEATURED: CatalogEntry[] = [
  F(
    { id: 3869685, d: '2022-12-18', ko: '18:00:00.000', c: 'FIFA World Cup', cc: 'International', g: 'm', s: '2022', st: 'Final', v: 'Lusail Stadium', h: 'Argentina', a: 'France', hg: 3, ag: 3 },
    'The greatest final ever played — Messi twice, Mbappé’s hat-trick, penalties. Every one of its 4,400 real events, rebuilt under the Lusail lights.'
  ),
  F(
    { id: 3750191, d: '1986-06-22', ko: '12:00:00.000', c: 'FIFA World Cup', cc: 'International', g: 'm', s: '1986', st: 'Quarter-finals', v: 'Estadio Azteca', h: 'Argentina', a: 'England', hg: 2, ag: 1 },
    'The Hand of God and the Goal of the Century — four minutes apart. Stand on the Azteca pitch and watch both from anywhere you like.'
  ),
  F(
    { id: 3888705, d: '1958-06-29', ko: '15:00:00.000', c: 'FIFA World Cup', cc: 'International', g: 'm', s: '1958', st: 'Final', v: 'Råsunda, Stockholm', h: 'Brazil', a: 'Sweden', hg: 5, ag: 2 },
    'No complete film of this match survives. A 17-year-old Pelé scores twice in a World Cup final — reconstructed from the historical record, watchable nowhere else.'
  ),
  F(
    { id: 2302764, d: '2005-05-25', ko: '21:45:00.000', c: 'Champions League', cc: 'Europe', g: 'm', s: '2004/2005', st: 'Final', v: 'Atatürk Olimpiyat Stadı', h: 'AC Milan', a: 'Liverpool', hg: 3, ag: 3 },
    'Istanbul, 2005. Three down at half-time, level by the hour — the miracle, point by real point.'
  ),
  F(
    { id: 3943043, d: '2024-07-14', ko: '21:00:00.000', c: 'UEFA Euro', cc: 'Europe', g: 'm', s: '2024', st: 'Final', v: 'Olympiastadion Berlin', h: 'Spain', a: 'England', hg: 2, ag: 1 },
    'Berlin, 2024. Oyarzabal’s late winner settles a continental final — reconstructed from the real event feed.'
  ),
  F(
    { id: 69299, d: '2010-11-29', ko: '21:00:00.000', c: 'La Liga', cc: 'Spain', g: 'm', s: '2010/2011', st: 'Regular Season', v: 'Camp Nou', h: 'Barcelona', a: 'Real Madrid', hg: 5, ag: 0 },
    'La Manita. Pep’s Barcelona dismantle Mourinho’s Madrid 5–0 — the Clásico that defined an era.'
  ),
  F(
    { id: 8658, d: '2018-07-15', ko: '18:00:00.000', c: 'FIFA World Cup', cc: 'International', g: 'm', s: '2018', st: 'Final', v: 'Stadion Luzhniki', h: 'France', a: 'Croatia', hg: 4, ag: 2 },
    'Moscow, 2018. Six goals, an own goal, a pitch invasion and a teenager scoring in a World Cup final.'
  ),
  F(
    { id: 3888702, d: '1970-06-21', ko: '12:00:00.000', c: 'FIFA World Cup', cc: 'International', g: 'm', s: '1970', st: 'Final', v: 'Estadio Azteca', h: 'Brazil', a: 'Italy', hg: 4, ag: 1 },
    'The Azteca, 1970. Pelé opens it, Carlos Alberto ends it with the greatest team goal ever scored.'
  ),
  F(
    { id: 3888720, d: '1974-07-07', ko: '16:00:00.000', c: 'FIFA World Cup', cc: 'International', g: 'm', s: '1974', st: 'Final', v: 'Olympiastadion München', h: 'Netherlands', a: 'Germany', hg: 1, ag: 2 },
    'Munich, 1974. Cruyff wins a penalty before Germany touch the ball; total football meets its match.'
  ),
  F(
    { id: 3906390, d: '2023-08-20', ko: '20:00:00.000', c: "Women's World Cup", cc: 'International', g: 'f', s: '2023', st: 'Final', v: 'Accor Stadium', h: "Spain Women's", a: "England Women's", hg: 1, ag: 0 },
    'Sydney, 2023. Carmona’s strike wins Spain their first World Cup — rebuilt from the real final.'
  ),
  F(
    { id: 18236, d: '2011-05-28', ko: '19:45:00.000', c: 'Champions League', cc: 'Europe', g: 'm', s: '2010/2011', st: 'Final', v: 'Wembley Stadium', h: 'Barcelona', a: 'Manchester United', hg: 3, ag: 1 },
    'Wembley, 2011. Possibly the finest club performance of the modern age — Pedro, Messi, Villa.'
  ),
];

// ------------------------------- lookups ---------------------------------------

export function getFeatured(id: string): CatalogEntry | undefined {
  return FEATURED.find((e) => e.id === id);
}

let fullCatalog: Promise<CatalogEntry[]> | null = null;

/** The complete real-match library (memoized fetch of the baked index). */
export function loadCatalog(): Promise<CatalogEntry[]> {
  fullCatalog ??= loadIndex().then((idx) => idx.matches.map((m) => entryFromIndex(m)));
  return fullCatalog;
}

/** Resolve any entry — featured synchronously if possible, else via the index. */
export async function resolveEntry(id: string): Promise<CatalogEntry | undefined> {
  const f = getFeatured(id);
  if (f) return f;
  const all = await loadCatalog();
  return all.find((e) => e.id === id);
}

// ------------------------------- match building --------------------------------

const buildCache = new Map<string, Promise<MatchIR>>();

/**
 * Fetch the real event stream + lineups for a match and reconstruct its IR.
 * Progress reports the (heavy) events download so the loader can show it.
 */
export function buildMatch(id: string, onProgress?: Progress): Promise<MatchIR> {
  const cached = buildCache.get(id);
  if (cached) return cached;

  const p = (async () => {
    const entry = await resolveEntry(id);
    if (!entry) throw new Error(`Unknown match: ${id}`);
    const idx = await loadIndex();
    const meta = idx.matches.find((m) => m.id === entry.sbId);
    if (!meta) throw new Error(`Match ${id} missing from index`);
    const [events, lineups] = await Promise.all([
      loadEvents(entry.sbId, onProgress),
      loadLineups(entry.sbId),
    ]);
    return reconstructSoccerMatch(meta, events, lineups);
  })();

  p.catch(() => buildCache.delete(id)); // don't cache failures
  buildCache.set(id, p);
  return p;
}
