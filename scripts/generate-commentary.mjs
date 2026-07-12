/**
 * generate-commentary.mjs — bake the voice track for the hero matches.
 *
 * For each hero match this script:
 *   1. downloads the real StatsBomb event stream + lineups (cached in scratch/),
 *   2. rebuilds the SAME continuous match clock as src/data/reconstruct.ts
 *      (period offsets + 3s pad) so cues land exactly on the 3D action,
 *   3. writes a broadcast script — hand-authored lines for the famous moments
 *      (the Hand of God, Pelé '58, Istanbul...), era-voiced templates for the
 *      rest (radio register for the newsreel era, TV register for modern),
 *   4. renders each line with macOS TTS (say -v Daniel) → AAC (.m4a),
 *   5. writes public/audio/<matchId>/cues.json for the runtime AudioDirector.
 *
 * Fully offline at demo time — everything is baked into public/.
 *
 * Usage: node scripts/generate-commentary.mjs [sb-<id> ...]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RAW = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.join(ROOT, '..');
const CACHE = path.join(REPO, 'scratch', 'sb-cache');
const OUT_ROOT = path.join(REPO, 'public', 'audio');
const PERIOD_PAD = 3; // MUST match reconstruct.ts

// ------------------------------ hero matches ---------------------------------

const HEROES = [
  { id: 3888705, era: 'archive' },      // Brazil 5–2 Sweden, 1958 final (Pelé, 17)
  { id: 3888702, era: 'technicolor' },  // Brazil 4–1 Italy, 1970 final
  { id: 3888720, era: 'technicolor' },  // Netherlands 1–2 Germany, 1974 final
  { id: 3750191, era: 'vhs' },          // Argentina 2–1 England, 1986 QF
  { id: 2302764, era: 'modern' },       // Milan 3–3 Liverpool, Istanbul 2005
  { id: 3869685, era: 'modern' },       // Argentina 3–3 France, 2022 final
];

// ---------------------- hand-authored famous-moment lines ---------------------
// goals: keyed by goal index (time order, both teams). The script prints the
// scorer it matched each line to — eyeball that output when regenerating.

const FLAVOR = {
  3750191: {
    kickoff:
      'The Azteca Stadium, Mexico City. A hundred and fourteen thousand inside. Argentina against England, for a place in the World Cup semi final.',
    goals: {
      0: "The ball loops up into the England box... Maradona and Shilton both go for it — and it's in! It's in off Maradona! Every white shirt is appealing for handball — the referee says no! The goal stands. You will hear about that one for years. Argentina one, England nil.",
      1: "Maradona picks it up inside his own half... he turns, he's away from two men — he's off on a run here! Past Butcher, past Fenwick, England cannot get near him — he's in on Shilton, goes round him — and scores! Oh, you have to say that is magnificent! Argentina two, England nil — and there is no argument about that one!",
      2: 'Barnes gets to the byline and hangs it up... Lineker! Gary Lineker! England have one back, with ten minutes to play!',
    },
    fulltime:
      "There's the final whistle. Argentina are through to the semi finals, after a match that will be argued about forever. The Hand of God, and the Goal of the Century — four minutes apart.",
  },
  3888705: {
    kickoff:
      "Good afternoon from the Råsunda Stadium in Stockholm, where Sweden, the hosts, meet Brazil in the final of the World Cup. And there is much talk of Brazil's seventeen year old inside forward... a boy they call Pelé.",
    goals: {
      0: 'Liedholm strides through the middle and places it home! Sweden, the hosts, have the lead inside four minutes!',
      1: 'Garrincha tears down the right, to the byline... squares it — and Vavá turns it in! Brazil are level!',
      2: 'Vavá! Vavá again, from a Garrincha cross once more! Brazil have turned it around!',
      3: "Oh my word. The boy Pelé! He has flicked the ball clean over the defender's head, run around him, and volleyed it home! Seventeen years of age! That is one of the finest goals a final has ever seen!",
      4: 'Zagallo forces it over the line! Four one to Brazil, and the World Cup is surely bound for South America!',
      5: 'Simonsson pulls one back for the Swedes, but time is short.',
      6: 'And there it is! Pelé, with a header, his second of the final! Five two! The boy is in tears before the whistle has even gone — Brazil are champions of the world!',
    },
    fulltime:
      'The final whistle sounds in Stockholm! Brazil five, Sweden two. Brazil are champions of the world for the first time — and the whole world now knows the name... Pelé.',
  },
  3888702: {
    kickoff:
      'High noon at the Estadio Azteca. Brazil, in those famous golden shirts, against Italy. The two great football nations of the age, playing for the Jules Rimet trophy itself.',
    goals: {
      0: 'Rivellino hangs it to the far post — Pelé! Pelé climbs above Burgnich and thumps the header home! Brazil lead in the final!',
      1: 'A dreadful mix-up at the back for Brazil — and Boninsegna pounces! Italy are level, quite against the run of play!',
      2: 'Gérson... makes room, and lets fly with that famous left foot — it is there! Brazil lead again!',
      3: "Gérson lofts it forward, Pelé nods it down — Jairzinho bundles it in! He has now scored in every single round of this World Cup!",
      4: "Now watch this... Clodoaldo beats one, two, three, four men in his own half... down the wing through Jairzinho, inside to Pelé... Pelé rolls it to his right without so much as a glance — CARLOS ALBERTO! Like a thunderbolt! That, ladies and gentlemen, is the greatest team goal ever scored!",
    },
    fulltime:
      'It is all over! Brazil four, Italy one. The Jules Rimet trophy belongs to Brazil — theirs to keep, forever.',
  },
  3888720: {
    kickoff:
      "Munich, the Olympic Stadium. West Germany, the hosts, against Holland — Cruyff, Neeskens, and the total football that has enchanted this tournament.",
    goals: {
      0: "A penalty to Holland inside the first minute — Cruyff brought down before a German had even touched the ball! Neeskens thumps it home! What a start!",
      1: 'Now a penalty to the Germans... Breitner sends the keeper the wrong way. All square in the final.',
      2: 'Bonhof to the byline, pulled back — Müller! He swivels, and scores! Gerd Müller, as ever, in the one yard that matters!',
    },
    fulltime:
      'West Germany are champions of the world. Holland — perhaps the finest team of their age — beaten in the final they were born to win.',
  },
  2302764: {
    kickoff:
      'Istanbul. The final of the Champions League. AC Milan, the aristocrats of European football, against Liverpool. Nobody here has any idea what they are about to witness.',
    goals: {
      0: 'Fifty two seconds! Paolo Maldini! Milan lead inside the first minute of the final!',
      1: 'Kaká slides it through — Crespo! Two nil Milan, and Liverpool are drowning.',
      2: 'Kaká again, a ball of outrageous vision — Crespo clips it over the keeper! Three nil at half time. Surely, surely this final is over.',
      3: 'Riise crosses — GERRARD! Steven Gerrard! A lifeline for Liverpool, and listen to that noise!',
      4: "Šmicer... from twenty five yards — IT'S IN! Two goals in two minutes! Liverpool believe, and Milan are shaking!",
      5: 'Gerrard is brought down — penalty! Alonso steps up... saved — ALONSO ON THE REBOUND! From three nil down to three three! The miracle of Istanbul is ON!',
    },
    fulltime:
      'Liverpool have won the Champions League! From three nil down at half time — the miracle of Istanbul is complete!',
  },
  3869685: {
    kickoff:
      "Lusail, and the final of the World Cup. Argentina, with the little genius chasing the one prize that has escaped him... against France, the holders, and Kylian Mbappé. Whatever you are doing — stop.",
    goals: {
      0: 'Messi. From the penalty spot... GOAL! Lionel Messi scores in a World Cup final! Argentina lead!',
      1: "Argentina slice France open — Mac Allister, rolled across — Di María! Oh, that is a glorious, glorious team goal! Two nil!",
      2: 'A penalty to France, out of absolutely nothing. Mbappé... scores. Game on.',
      3: 'MBAPPÉ! An astonishing side volley! Ninety seven seconds, two goals — we are LEVEL in the World Cup final!',
      4: 'Lautaro shoots, spilled — MESSI! Messi has surely won the World Cup! The hundred and eighth minute!',
      5: 'Handball! Penalty! Mbappé again — a hat trick, in a World Cup final! The first since nineteen sixty six! Three three!',
    },
    pensWinner:
      'Montiel. For the World Cup itself... ARGENTINA ARE CHAMPIONS OF THE WORLD! Lionel Messi has his World Cup! The greatest final ever played, settled from the spot!',
    fulltime:
      'It is settled. Argentina are champions of the world, and Lionel Messi walks into eternity. The greatest final ever played.',
  },
};

// ------------------------------ helpers ---------------------------------------

const tsSec = (ts) => {
  const [h, m, s] = ts.split(':');
  return +h * 3600 + +m * 60 + parseFloat(s);
};

async function fetchJSON(url, cacheName) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, cacheName);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  process.stdout.write(`  fetching ${cacheName}...\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
  const data = await res.json();
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}

/** display name: nickname if present, else last word (mirrors reconstruct.ts) */
function nameMap(lineups) {
  const m = new Map();
  for (const team of lineups) {
    for (const p of team.lineup) {
      const parts = p.player_name.split(' ');
      m.set(p.player_id, p.player_nickname ?? (parts.length > 1 ? parts.at(-1) : p.player_name));
    }
  }
  return m;
}

const pick = (arr, i) => arr[i % arr.length];

// ------------------------------ script writer ---------------------------------

function writeScript(meta, events, lineups, era) {
  const names = nameMap(lineups);
  const nameOf = (ref) => names.get(ref.id) ?? ref.name.split(' ').at(-1);
  const flavor = FLAVOR[meta.id] ?? {};
  const vintage = era === 'archive' || era === 'technicolor';

  // continuous clock — EXACTLY reconstruct.ts
  const periods = [...new Set(events.map((e) => e.period))].sort((a, b) => a - b);
  const periodEnd = new Map();
  for (const e of events) {
    const s = tsSec(e.timestamp) + (e.duration ?? 0);
    if (s > (periodEnd.get(e.period) ?? 0)) periodEnd.set(e.period, s);
  }
  const periodOffset = new Map();
  let acc = 0;
  for (const p of periods) {
    periodOffset.set(p, acc);
    acc += (periodEnd.get(p) ?? 0) + PERIOD_PAD;
  }
  const tOf = (e) => (periodOffset.get(e.period) ?? 0) + tsSec(e.timestamp);

  const homeName = meta.h;
  const awayName = meta.a;
  const teamIds = new Map(); // sb team id -> 'H' | 'A'
  const lineupHome = lineups.find((l) => l.team_name === homeName) ?? lineups[0];
  teamIds.set(lineupHome.team_id, 'H');
  for (const l of lineups) if (l !== lineupHome) teamIds.set(l.team_id, 'A');

  const lines = [];
  const score = { H: 0, A: 0 };
  const pens = { H: 0, A: 0 };
  let goalIdx = 0;
  let lastSaveT = -999;
  let lastYellowT = -999;
  let saves = 0;
  let yellows = 0;
  let penKicks = [];

  const scorePhrase = () => {
    if (score.H === score.A) return score.H === 1 ? "it's one apiece" : `it's ${score.H} all`;
    const lead = score.H > score.A ? homeName : awayName;
    return `${lead} lead ${Math.max(score.H, score.A)} ${Math.min(score.H, score.A)}`;
  };

  const GOAL_TEMPLATES = vintage
    ? [
        (n, team) => `And it is a goal! ${n} has scored for ${team}! ${scorePhrase()}.`,
        (n, team) => `${n} finds the net! A goal for ${team}! ${scorePhrase()}.`,
      ]
    : [
        (n, team) => `GOAL! ${n}! ${team} strike, and it's ${scorePhrase()}!`,
        (n, team) => `It's in! ${n} scores for ${team}! ${scorePhrase()}!`,
      ];

  lines.push({
    t: 0.8,
    p: 2,
    text:
      flavor.kickoff ??
      (vintage
        ? `Good afternoon. ${homeName} against ${awayName} — and we are under way.`
        : `${homeName} against ${awayName}. The referee checks his watch... and we're under way.`),
  });

  let lastEventT = 0;
  for (const e of events) {
    const t = tOf(e);
    if (t > lastEventT) lastEventT = t;
    const type = e.type.name;
    const letter = teamIds.get(e.team.id) ?? 'H';
    const teamName = letter === 'H' ? homeName : awayName;

    if (type === 'Shot' && e.period < 5) {
      if (e.shot?.outcome?.name === 'Goal') {
        score[letter]++;
        const n = e.player ? nameOf(e.player) : 'A goal';
        const custom = flavor.goals?.[goalIdx];
        lines.push({
          t,
          p: 3,
          text: custom ?? pick(GOAL_TEMPLATES, goalIdx)(n, teamName),
          debug: `goal#${goalIdx} ${n} (${teamName}) ${custom ? '[FLAVOR]' : '[template]'}`,
        });
        goalIdx++;
      } else if (
        (e.shot?.statsbomb_xg ?? 0) > 0.28 &&
        e.shot?.outcome?.name !== 'Blocked' &&
        t - lastSaveT > 40 &&
        saves < 8
      ) {
        const n = e.player ? nameOf(e.player) : 'The striker';
        const denied = e.shot?.outcome?.name?.startsWith('Saved');
        lines.push({
          t,
          p: 1,
          text: denied
            ? `${n} must score... kept out! What a chance for ${teamName}!`
            : e.shot?.outcome?.name === 'Post'
              ? `${n} strikes the woodwork! Inches away for ${teamName}!`
              : `A big chance for ${n}... it won't count. ${teamName} so close.`,
        });
        lastSaveT = t;
        saves++;
      }
    } else if (type === 'Own Goal Against') {
      const other = letter === 'H' ? 'A' : 'H';
      score[other]++;
      const custom = flavor.goals?.[goalIdx];
      lines.push({
        t,
        p: 3,
        text: custom ?? `An own goal! It counts for ${other === 'H' ? homeName : awayName}! ${scorePhrase()}!`,
        debug: `goal#${goalIdx} OWN GOAL ${custom ? '[FLAVOR]' : '[template]'}`,
      });
      goalIdx++;
    } else if (type === 'Shot' && e.period === 5) {
      penKicks.push({ e, t, letter });
    } else if (type === 'Foul Committed' || type === 'Bad Behaviour') {
      const card = (e.foul_committed?.card ?? e.bad_behaviour?.card)?.name;
      if (!card || !e.player) continue;
      if (card === 'Yellow Card') {
        if (t - lastYellowT < 90 || yellows >= 5) continue;
        lastYellowT = t;
        yellows++;
        lines.push({ t, p: 1, text: `${nameOf(e.player)} goes into the referee's book.` });
      } else {
        lines.push({
          t,
          p: 2,
          text: `He's off! ${nameOf(e.player)} has been sent off, and ${teamName} are down to ten men!`,
        });
      }
    }
  }

  // penalty shoot-out
  if (penKicks.length) {
    lines.push({
      t: (periodOffset.get(5) ?? 0) + 0.8,
      p: 2,
      text: 'So it comes down to this. A penalty shoot-out will decide it.',
    });
    for (let i = 0; i < penKicks.length; i++) {
      const { e, t, letter } = penKicks[i];
      const scored = e.shot?.outcome?.name === 'Goal';
      if (scored) pens[letter]++;
      const n = e.player ? nameOf(e.player) : 'He';
      const last = i === penKicks.length - 1;
      const text =
        last && scored && flavor.pensWinner
          ? flavor.pensWinner
          : scored
            ? `${n} steps up... and scores. ${pens.H} ${pens.A}.`
            : `${n} steps up... ${e.shot?.outcome?.name === 'Saved' ? 'SAVED! Kept out!' : 'He misses! Wide!'}`;
      lines.push({ t, p: last ? 3 : 2, text, debug: last ? 'pens winner' : undefined });
    }
  }

  // half-time / full-time
  const p1End = (periodOffset.get(1) ?? 0) + (periodEnd.get(1) ?? 0);
  if (periods.includes(2)) {
    lines.push({
      t: p1End + 0.6,
      p: 2,
      text: `And that's half time. ${score.H > 0 || score.A > 0 ? `${homeName} ${score.H}, ${awayName} ${score.A}.` : 'Goalless, so far.'}`,
    });
    lines.push({
      t: (periodOffset.get(2) ?? 0) + 0.8,
      p: 1,
      text: 'We are back under way for the second half.',
    });
  }
  if (periods.includes(3)) {
    lines.push({
      t: (periodOffset.get(3) ?? 0) + 0.8,
      p: 2,
      text: `Extra time it is. Thirty more minutes to settle it.`,
    });
  }
  lines.push({
    t: lastEventT + 1.6,
    p: 3,
    text:
      flavor.fulltime ??
      `There's the final whistle! ${homeName} ${score.H}, ${awayName} ${score.A}.`,
  });

  // sort + thin: drop a line if a same-or-higher priority line sits within 5s before it
  lines.sort((a, b) => a.t - b.t);
  const thinned = [];
  for (const l of lines) {
    const prev = thinned[thinned.length - 1];
    if (prev && l.t - prev.t < 5 && prev.p >= l.p) continue;
    if (prev && l.t - prev.t < 5 && prev.p < l.p) thinned.pop();
    thinned.push(l);
  }
  return thinned;
}

// ------------------------------ TTS bake ---------------------------------------

function bake(matchDir, lines, era) {
  fs.rmSync(matchDir, { recursive: true, force: true });
  fs.mkdirSync(matchDir, { recursive: true });
  const vintage = era === 'archive' || era === 'technicolor';
  const rate = vintage ? 172 : 182;
  const cues = [];
  const tmpAiff = path.join(CACHE, 'tts-tmp.aiff');

  lines.forEach((line, i) => {
    const f = `${String(i + 1).padStart(3, '0')}.m4a`;
    const out = path.join(matchDir, f);
    execFileSync('say', ['-v', 'Daniel', '-r', String(line.p === 3 ? rate + 14 : rate), '-o', tmpAiff, line.text]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', tmpAiff, out]);
    const info = execFileSync('afinfo', [out]).toString();
    const dur = parseFloat(info.match(/estimated duration: ([\d.]+)/)?.[1] ?? '3');
    cues.push({ t: Math.round(line.t * 10) / 10, f, d: Math.round(dur * 10) / 10, p: line.p, text: line.text });
    if (line.debug) console.log(`    ${line.debug} @ ${Math.round(line.t)}s`);
  });
  fs.rmSync(tmpAiff, { force: true });
  fs.writeFileSync(path.join(matchDir, 'cues.json'), JSON.stringify({ cues }, null, 1));
  return cues.length;
}

// ------------------------------ main -------------------------------------------

const only = process.argv.slice(2).map((a) => parseInt(a.replace('sb-', ''), 10));
const index = JSON.parse(fs.readFileSync(path.join(REPO, 'public', 'data', 'index.json'), 'utf8'));

for (const hero of HEROES) {
  if (only.length && !only.includes(hero.id)) continue;
  const meta = index.matches.find((m) => m.id === hero.id);
  if (!meta) {
    console.warn(`sb-${hero.id} missing from index — skipped`);
    continue;
  }
  console.log(`\nsb-${hero.id}: ${meta.h} vs ${meta.a} (${meta.s}) [${hero.era}]`);
  const events = await fetchJSON(`${RAW}/events/${hero.id}.json`, `events-${hero.id}.json`);
  const lineups = await fetchJSON(`${RAW}/lineups/${hero.id}.json`, `lineups-${hero.id}.json`);
  const lines = writeScript(meta, events, lineups, hero.era);
  const n = bake(path.join(OUT_ROOT, `sb-${hero.id}`), lines, hero.era);
  console.log(`  baked ${n} lines → public/audio/sb-${hero.id}/`);
}
console.log('\ndone.');
