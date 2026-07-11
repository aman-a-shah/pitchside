/**
 * Match catalog — the curated set of games shown in the gallery.
 *
 * Each entry carries lightweight display metadata (for the card) plus a lazy
 * `build()` that synthesizes the full MatchIR on demand (and memoizes it). Real
 * datasets would slot in here behind the same `build()` contract.
 */

import { MatchIR, Sport, KitSpec, VideoRef } from '@/ir/types';
import { synthesizeSoccerMatch } from '@/synth/soccer';
import { synthesizeBasketballMatch } from '@/synth/basketball';
import { synthesizeTennisMatch } from '@/synth/tennis';

export interface CatalogTeam {
  name: string;
  short: string;
  color: string;
}

export interface CatalogEntry {
  id: string;
  sport: Sport;
  title: string;
  competition: string;
  venue?: string;
  date?: string;
  mood: 'night' | 'day' | 'dusk' | 'indoor';
  teams: CatalogTeam[];
  accent: string;
  blurb: string;
  build: () => MatchIR;
}

// ------------------------------- kits ----------------------------------------

const kit = (
  primary: string,
  secondary: string,
  shorts: string,
  socks: string,
  numberColor: string,
  skin = '#d8a373'
): KitSpec => ({ primary, secondary, shorts, socks, numberColor, skin });

const ARG = kit('#75AADB', '#FFFFFF', '#1B1B2F', '#FFFFFF', '#0B2A4A');
const FRA = kit('#1B2A6B', '#FFFFFF', '#FFFFFF', '#C1121F', '#FFFFFF');
const BRA = kit('#FFD400', '#009C3B', '#0033A0', '#FFFFFF', '#0033A0');
const GER = kit('#F4F4F4', '#111111', '#111111', '#F4F4F4', '#111111');
const ENG = kit('#FFFFFF', '#0A1E5A', '#0A1E5A', '#FFFFFF', '#0A1E5A');
const ESP = kit('#C60B1E', '#FFC400', '#0A1E5A', '#111111', '#FFC400');

// ------------------------------- video anchors -------------------------------

// Approximate YouTube sync anchors (matchClockSeconds, videoSeconds).
// The video id is a placeholder for the official highlight reel; anchors map our
// synthesized clock onto the reel. Swap the id for any full-match upload.
const wcVideo: VideoRef = {
  provider: 'youtube',
  id: 'kU_zSaU5V8I',
  label: 'Final highlights',
  clockAnchors: [
    [0, 8],
    [150, 70],
    [300, 150],
  ],
};

// ------------------------------- soccer entries ------------------------------

const soccerEntries: CatalogEntry[] = [
  {
    id: 'wc-final-arg-fra',
    sport: 'soccer',
    title: 'Argentina vs France',
    competition: 'World Cup Final',
    venue: 'Lusail Stadium',
    date: '2022-12-18',
    mood: 'night',
    teams: [
      { name: 'Argentina', short: 'ARG', color: '#75AADB' },
      { name: 'France', short: 'FRA', color: '#1B2A6B' },
    ],
    accent: '#75AADB',
    blurb: 'The greatest final of all time, reconstructed under the Lusail lights.',
    build: () =>
      synthesizeSoccerMatch({
        id: 'wc-final-arg-fra',
        seed: 'lusail-2022',
        duration: 300,
        title: 'Argentina vs France — World Cup Final',
        competition: 'World Cup Final 2022',
        venue: 'Lusail Stadium',
        mood: 'night',
        starName: 'Messi',
        home: { name: 'Argentina', short: 'ARG', kit: ARG, formation: '4-3-3' },
        away: { name: 'France', short: 'FRA', kit: FRA, formation: '4-4-2' },
        videos: [wcVideo],
      }),
  },
  {
    id: 'classic-bra-ger',
    sport: 'soccer',
    title: 'Brazil vs Germany',
    competition: 'World Cup Semi-Final',
    venue: 'Mineirão',
    date: '2014-07-08',
    mood: 'dusk',
    teams: [
      { name: 'Brazil', short: 'BRA', color: '#FFD400' },
      { name: 'Germany', short: 'GER', color: '#F4F4F4' },
    ],
    accent: '#FFD400',
    blurb: 'A semi-final that stunned a nation. Relive it from the pitch.',
    build: () =>
      synthesizeSoccerMatch({
        id: 'classic-bra-ger',
        seed: 'mineirao-2014',
        duration: 300,
        title: 'Brazil vs Germany — Semi-Final',
        competition: 'World Cup Semi-Final 2014',
        venue: 'Mineirão',
        mood: 'dusk',
        home: { name: 'Brazil', short: 'BRA', kit: BRA, formation: '4-3-3' },
        away: { name: 'Germany', short: 'GER', kit: GER, formation: '4-3-3' },
      }),
  },
  {
    id: 'euro-final-eng-esp',
    sport: 'soccer',
    title: 'England vs Spain',
    competition: 'European Final',
    venue: 'Olympiastadion',
    date: '2024-07-14',
    mood: 'day',
    teams: [
      { name: 'England', short: 'ENG', color: '#FFFFFF' },
      { name: 'Spain', short: 'ESP', color: '#C60B1E' },
    ],
    accent: '#C60B1E',
    blurb: 'A continental final in the Berlin afternoon sun.',
    build: () =>
      synthesizeSoccerMatch({
        id: 'euro-final-eng-esp',
        seed: 'berlin-2024',
        duration: 300,
        title: 'England vs Spain — European Final',
        competition: 'European Final 2024',
        venue: 'Olympiastadion',
        mood: 'day',
        home: { name: 'England', short: 'ENG', kit: ENG, formation: '4-3-3' },
        away: { name: 'Spain', short: 'ESP', kit: ESP, formation: '4-3-3' },
      }),
  },
];

// ------------------------------- basketball ----------------------------------

const basketballEntries: CatalogEntry[] = [
  {
    id: 'nba-finals-g7',
    sport: 'basketball',
    title: 'Bay City vs Cleveland Shore',
    competition: 'Finals — Game 7',
    venue: 'Oracle Arena',
    date: '2016-06-19',
    mood: 'indoor',
    teams: [
      { name: 'Bay City', short: 'BAY', color: '#FDB927' },
      { name: 'Cleveland Shore', short: 'CLE', color: '#860038' },
    ],
    accent: '#FDB927',
    blurb: 'Game 7. Season on the line. Every possession under the lights.',
    build: () =>
      synthesizeBasketballMatch({
        id: 'nba-finals-g7',
        seed: 'oracle-g7',
        duration: 240,
        title: 'Bay City vs Cleveland Shore — Game 7',
        competition: 'Finals — Game 7',
        venue: 'Oracle Arena',
        home: {
          name: 'Bay City',
          short: 'BAY',
          kit: kit('#1D428A', '#FDB927', '#1D428A', '#FFFFFF', '#FDB927'),
        },
        away: {
          name: 'Cleveland Shore',
          short: 'CLE',
          kit: kit('#860038', '#FDBB30', '#860038', '#111111', '#FDBB30'),
        },
      }),
  },
  {
    id: 'nba-rivalry',
    sport: 'basketball',
    title: 'Metro Kings vs Lakeside',
    competition: 'Conference Final',
    venue: 'Union Center',
    date: '2023-05-28',
    mood: 'indoor',
    teams: [
      { name: 'Metro Kings', short: 'MET', color: '#5B2B82' },
      { name: 'Lakeside', short: 'LKS', color: '#00838A' },
    ],
    accent: '#5B2B82',
    blurb: 'Two heavyweights trade blows with a place in the finals at stake.',
    build: () =>
      synthesizeBasketballMatch({
        id: 'nba-rivalry',
        seed: 'union-center',
        duration: 240,
        title: 'Metro Kings vs Lakeside — Conference Final',
        competition: 'Conference Final',
        venue: 'Union Center',
        home: {
          name: 'Metro Kings',
          short: 'MET',
          kit: kit('#5B2B82', '#F0C043', '#5B2B82', '#FFFFFF', '#F0C043'),
        },
        away: {
          name: 'Lakeside',
          short: 'LKS',
          kit: kit('#00838A', '#EDEDED', '#00838A', '#111111', '#EDEDED'),
        },
      }),
  },
];

// ------------------------------- tennis --------------------------------------

const tennisEntries: CatalogEntry[] = [
  {
    id: 'slam-final-clay',
    sport: 'tennis',
    title: 'Nadal vs Djokovic',
    competition: 'Roland-Garros Final',
    venue: 'Court Philippe-Chatrier',
    date: '2020-10-11',
    mood: 'day',
    teams: [
      { name: 'Del Sol', short: 'DEL', color: '#0A6E4F' },
      { name: 'Marek', short: 'MAR', color: '#1B4F9C' },
    ],
    accent: '#C8622A',
    blurb: 'A clay-court classic — every rally reconstructed point by point.',
    build: () =>
      synthesizeTennisMatch({
        id: 'slam-final-clay',
        seed: 'chatrier-clay',
        duration: 200,
        title: 'Del Sol vs Marek — Roland-Garros Final',
        competition: 'Grand Slam Final',
        venue: 'Court Philippe-Chatrier',
        surface: 'clay',
        home: { name: 'Del Sol', short: 'DEL', color: '#0A6E4F' },
        away: { name: 'Marek', short: 'MAR', color: '#1B4F9C' },
      }),
  },
  {
    id: 'slam-grass',
    sport: 'tennis',
    title: 'Whitmore vs Bergström',
    competition: 'Championships Final',
    venue: 'Centre Court',
    date: '2021-07-11',
    mood: 'day',
    teams: [
      { name: 'Whitmore', short: 'WHI', color: '#123E7C' },
      { name: 'Bergström', short: 'BRG', color: '#8A1C2B' },
    ],
    accent: '#2f7d3a',
    blurb: 'Serve-and-volley on the lawns of Centre Court.',
    build: () =>
      synthesizeTennisMatch({
        id: 'slam-grass',
        seed: 'centre-court',
        duration: 200,
        title: 'Whitmore vs Bergström — Championships Final',
        competition: 'Championships Final',
        venue: 'Centre Court',
        surface: 'grass',
        home: { name: 'Whitmore', short: 'WHI', color: '#123E7C' },
        away: { name: 'Bergström', short: 'BRG', color: '#8A1C2B' },
      }),
  },
];

// ------------------------------- registry ------------------------------------

export const CATALOG: CatalogEntry[] = [
  ...soccerEntries,
  ...basketballEntries,
  ...tennisEntries,
];

const buildCache = new Map<string, MatchIR>();

export function getEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id);
}

export function buildMatch(id: string): MatchIR | undefined {
  if (buildCache.has(id)) return buildCache.get(id);
  const entry = getEntry(id);
  if (!entry) return undefined;
  const ir = entry.build();
  buildCache.set(id, ir);
  return ir;
}
