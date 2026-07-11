/**
 * Build the real-match index from StatsBomb Open Data.
 *
 * Downloads competitions.json plus every matches/<comp>/<season>.json and emits
 * a compact `public/data/index.json` — one row per real match. Event/lineup
 * files (the heavy per-match payloads) are NOT downloaded here; the client
 * fetches them on demand when a match is opened.
 *
 * Usage: node scripts/fetch-statsbomb.mjs
 * Data license: StatsBomb Open Data — free for research / non-commercial use
 * with attribution (https://github.com/statsbomb/open-data).
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data');
const CONCURRENCY = 12;

async function getJSON(url, attempt = 1) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null; // some listed seasons have no matches file
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return getJSON(url, attempt + 1);
    }
    throw new Error(`${res.status} for ${url}`);
  }
  return res.json();
}

function pool(items, worker, size) {
  let i = 0;
  const results = new Array(items.length);
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  return Promise.all(lanes).then(() => results);
}

const comps = await getJSON(`${BASE}/competitions.json`);
// one row per competition+season
const seasons = comps.map((c) => ({
  competitionId: c.competition_id,
  seasonId: c.season_id,
  competition: c.competition_name,
  season: c.season_name,
  country: c.country_name,
  gender: c.competition_gender,
}));
console.log(`competitions.json: ${seasons.length} competition-seasons`);

let done = 0;
const perSeason = await pool(
  seasons,
  async (s) => {
    const rows = await getJSON(`${BASE}/matches/${s.competitionId}/${s.seasonId}.json`);
    done++;
    if (done % 10 === 0) console.log(`  matches lists: ${done}/${seasons.length}`);
    if (!rows) return [];
    return rows.map((m) => ({
      // compact keys — this file ships to the browser
      id: m.match_id,
      d: m.match_date,
      ko: m.kick_off ?? null,
      c: s.competition,
      cc: s.country,
      g: s.gender === 'female' ? 'f' : 'm',
      s: s.season,
      st: m.competition_stage?.name ?? null,
      v: m.stadium?.name ?? null,
      h: m.home_team?.home_team_name,
      a: m.away_team?.away_team_name,
      hg: m.home_score,
      ag: m.away_score,
      hm: m.home_team?.managers?.[0]?.name ?? null,
      am: m.away_team?.managers?.[0]?.name ?? null,
      w: m.match_week ?? null,
    }));
  },
  CONCURRENCY
);

const all = perSeason.flat();
// de-dupe (a match can appear under overlapping season listings) + sort newest first
const byId = new Map();
for (const m of all) if (!byId.has(m.id)) byId.set(m.id, m);
const matches = [...byId.values()].sort((x, y) => (x.d < y.d ? 1 : -1));

await mkdir(OUT, { recursive: true });
await writeFile(
  path.join(OUT, 'index.json'),
  JSON.stringify({
    generated: new Date().toISOString(),
    attribution: 'Data: StatsBomb Open Data (non-commercial, with attribution)',
    count: matches.length,
    matches,
  })
);

const comps2 = new Set(matches.map((m) => `${m.c} ${m.s}`));
console.log(`wrote public/data/index.json — ${matches.length} matches, ${comps2.size} competition-seasons`);

// quick pointers for curating the featured list
for (const probe of [
  ['Argentina', 'France'],
  ['Spain', 'England'],
  ['France', 'Croatia'],
  ['Bayer Leverkusen', null],
]) {
  const hit = matches.find(
    (m) =>
      (m.h === probe[0] || m.a === probe[0]) &&
      (!probe[1] || m.h === probe[1] || m.a === probe[1]) &&
      (m.st === 'Final' || probe[1] === null)
  );
  if (hit) console.log(`  probe ${probe.join(' v ')}: ${hit.id} — ${hit.h} ${hit.hg}-${hit.ag} ${hit.a} (${hit.c} ${hit.s})`);
}
