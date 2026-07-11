/** Sanity-check the reconstructor against a real downloaded match. */
import { readFileSync } from 'node:fs';
import { reconstructSoccerMatch } from '../src/data/reconstruct';
import type { SBEvent, SBIndexMatch, SBLineupTeam } from '../src/data/statsbomb';

const [eventsPath, lineupsPath] = process.argv.slice(2);
const events = JSON.parse(readFileSync(eventsPath, 'utf8')) as SBEvent[];
const lineups = JSON.parse(readFileSync(lineupsPath, 'utf8')) as SBLineupTeam[];

const index = JSON.parse(readFileSync('public/data/index.json', 'utf8'));
const matchId = Number(/(\d+)\.json$/.exec(eventsPath)![1]);
const meta = index.matches.find((m: SBIndexMatch) => m.id === matchId) as SBIndexMatch;

const ir = reconstructSoccerMatch(meta, events, lineups);

console.log('== meta ==');
console.log(ir.meta.title, '|', ir.meta.competition, '|', ir.meta.venue, '|', ir.meta.mood);
console.log('duration:', (ir.duration / 60).toFixed(1), 'min | score:', ir.meta.score, '| expected:', meta.hg, '-', meta.ag);
console.log('teams:', ir.meta.teams.map((t) => `${t.short}(${t.formation})`).join(' v '));

console.log('\n== entities ==');
const players = ir.entities.filter((e) => e.role === 'player');
console.log('players:', players.length, '| tracks:', Object.keys(ir.tracks).length);
console.log('sample:', players.slice(0, 4).map((p) => `${p.name}#${p.number}(${p.position},${p.team})`).join(', '));

console.log('\n== goals ==');
for (const e of ir.events.filter((e) => e.type === 'goal')) {
  console.log(` ${(e.t / 60).toFixed(1)}min [${e.team}]`, e.text);
}
console.log('\n== scoreboard tail ==');
for (const s of ir.scoreboard.slice(-4)) console.log(` t=${(s.t / 60).toFixed(1)}min ${s.home}-${s.away} ${s.detail ?? ''}`);

console.log('\n== events by type ==');
const counts: Record<string, number> = {};
for (const e of ir.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
console.log(counts);
console.log('key events (importance>=0.4):', ir.events.filter((e) => (e.importance ?? 0) >= 0.4).length);

console.log('\n== track sanity ==');
let bad = 0;
let maxSpeed = 0;
for (const [id, tr] of Object.entries(ir.tracks)) {
  for (let i = 0; i < tr.count; i++) {
    if (!isFinite(tr.x[i]) || !isFinite(tr.z[i]) || !isFinite(tr.heading[i])) bad++;
    if (id !== 'ball') maxSpeed = Math.max(maxSpeed, tr.speed[i]);
  }
}
const bt = ir.tracks.ball;
let ballMax = 0;
for (let i = 0; i < bt.count; i++) ballMax = Math.max(ballMax, bt.speed[i]);
let ballYMax = 0;
for (let i = 0; i < bt.count; i++) ballYMax = Math.max(ballYMax, bt.y[i]);
console.log('non-finite samples:', bad, '| player max speed:', maxSpeed.toFixed(1), 'm/s | ball max speed:', ballMax.toFixed(1), '| ball max height:', ballYMax.toFixed(1));

const memMB = Object.values(ir.tracks).reduce((s, t) => s + t.count * 21, 0) / 1e6;
console.log('track memory ≈', memMB.toFixed(1), 'MB');
