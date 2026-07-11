/**
 * Bake a reconstructed match into unity/SampleData/sample-match.json so the
 * Unity scene plays a real match inside the editor with no website running.
 *
 *   npm run unity:sample            # World Cup 2022 final (default)
 *   npm run unity:sample -- 3943043 # any StatsBomb match id from the index
 *
 * The JSON shape mirrors Unity's JsonUtility-compatible message types
 * (unity/Assets/Scripts/MatchTypes.cs): a MatchSetupMsg plus dense tracks with
 * base64-encoded little-endian float32 arrays.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconstructSoccerMatch } from '../src/data/reconstruct';
import type { SBEvent, SBIndexMatch, SBLineupTeam } from '../src/data/statsbomb';
import type { MatchIR, Track } from '../src/ir/types';

const RAW = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const matchId = Number(process.argv[2] ?? 3869685);

const index = JSON.parse(readFileSync(join(root, 'public/data/index.json'), 'utf8'));
const meta = index.matches.find((m: SBIndexMatch) => m.id === matchId) as SBIndexMatch | undefined;
if (!meta) throw new Error(`match ${matchId} not found in public/data/index.json`);

console.log(`Fetching ${meta.h} vs ${meta.a} (${meta.d})…`);
const [events, lineups] = await Promise.all([
  fetch(`${RAW}/events/${matchId}.json`).then((r) => r.json() as Promise<SBEvent[]>),
  fetch(`${RAW}/lineups/${matchId}.json`).then((r) => r.json() as Promise<SBLineupTeam[]>),
]);

const ir: MatchIR = reconstructSoccerMatch(meta, events, lineups);

const setup = {
    field: {
      length: ir.fieldSpec.length,
      width: ir.fieldSpec.width,
      goalWidth: ir.fieldSpec.goalWidth ?? 3.66,
      goalHeight: ir.fieldSpec.goalHeight ?? 2.44,
    },
    mood: ir.meta.mood ?? 'night',
    duration: ir.duration,
    teams: ir.meta.teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.short,
      kit: t.kit,
      attackDir: t.attackDir,
    })),
    entities: ir.entities.map((e) => ({
      id: e.id,
      role: e.role,
      team: e.team ?? '',
      name: e.name ?? '',
      number: e.number ?? 0,
      position: e.position ?? 'MID',
    })),
    keyEvents: ir.events
      .filter((e) => (e.importance ?? 0) >= 0.7)
      .map((e) => ({
        t: e.t,
        x: e.location?.[0] ?? 0,
        z: e.location?.[1] ?? 0,
        importance: e.importance ?? 0,
      })),
    deadSpans: (ir.deadSpans ?? []).map(([t0, t1]) => ({ t0, t1 })),
};

// tracks → compact binary (little-endian), parsed by EditorMatchSource with a
// BinaryReader: [count:i32] then per track [idLen:i32][id utf8][hz:f32][t0:f32]
// [n:i32][x,y,z,speed,heading: f32×n each][action: u8×n]
function packTracks(tracks: Record<string, Track>): Buffer {
  const parts: Buffer[] = [];
  const i32 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v);
    return b;
  };
  const f32 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeFloatLE(v);
    return b;
  };
  const arr = (a: Float32Array | Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

  const entries = Object.entries(tracks);
  parts.push(i32(entries.length));
  for (const [id, t] of entries) {
    const idBuf = Buffer.from(id, 'utf8');
    parts.push(i32(idBuf.length), idBuf, f32(t.hz), f32(t.t0), i32(t.count));
    parts.push(arr(t.x), arr(t.y), arr(t.z), arr(t.speed), arr(t.heading), arr(t.action));
  }
  return Buffer.concat(parts);
}

const outDir = join(root, 'unity/SampleData');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'sample-setup.json'), JSON.stringify(setup));
const bin = packTracks(ir.tracks);
writeFileSync(join(outDir, 'sample-tracks.bin'), bin);
console.log(
  `Wrote unity/SampleData/sample-setup.json + sample-tracks.bin (${(bin.length / 1024 / 1024).toFixed(1)} MB): ` +
    `${ir.meta.title}, ${ir.entities.length} entities, ${(ir.duration / 60).toFixed(1)} min.`
);
