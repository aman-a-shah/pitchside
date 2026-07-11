/**
 * Real-match reconstruction — StatsBomb event stream → MatchIR.
 *
 * Every discrete fact is real: who was on the pitch, every pass, carry, shot,
 * save, card, sub and goal, with its pitch location and timestamp. What the
 * data does NOT contain is continuous tracking, so between a player's real
 * event locations we synthesize plausible movement: each player drifts around
 * an anchor derived from the mean of their own real positions (shifted with
 * the ball, like a real team shape), and is pulled onto their exact recorded
 * location whenever a real waypoint is near in time. Shot freeze-frames pin
 * up to 20 players to their true positions at every shot.
 *
 * The ball path is stitched purely from real waypoints (pass start→end with
 * the recorded flight height, carries, shots to their real 3D end points),
 * eased through dead-ball gaps so it never teleports.
 */

import {
  Action,
  Entity,
  FieldPosition,
  MatchEvent,
  MatchIR,
  PeriodSpec,
  ScoreSnapshot,
  TeamInfo,
  Track,
} from '@/ir/types';
import { createTrack } from '@/ir/sampler';
import { SBEvent, SBIndexMatch, SBLineupTeam, SBRef } from './statsbomb';
import { accentFor, kitsForFixture, teamCode } from './teamKits';

// ------------------------------ field constants ------------------------------

const L = 105;
const W = 68;
const HALF_L = L / 2;
const HALF_W = W / 2;
const SX = L / 120; // StatsBomb x: 0..120
const SZ = W / 80; // StatsBomb y: 0..80
const SY = 0.9144; // shot end height is in yards
const BALL_R = 0.11;

const BALL_HZ = 15;
const PLAYER_HZ = 8;
const PERIOD_PAD = 3; // breather inserted between periods, seconds

// ------------------------------ small helpers --------------------------------

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const smooth = (f: number) => f * f * (3 - 2 * f);

function tsSec(timestamp: string): number {
  const [h, m, s] = timestamp.split(':');
  return +h * 3600 + +m * 60 + parseFloat(s);
}

function actionFromSpeed(s: number): Action {
  if (s < 0.35) return Action.Idle;
  if (s < 1.9) return Action.Walk;
  if (s < 3.9) return Action.Jog;
  if (s < 6.3) return Action.Run;
  return Action.Sprint;
}

/** display name: nickname when the data has one, else last word of full name */
function shortName(fullName: string, nickname?: string | null): string {
  if (nickname) return nickname;
  const parts = fullName.split(' ');
  return parts.length > 1 ? parts.slice(-1)[0] : fullName;
}

/** StatsBomb position id → coarse role */
function roleOf(positionId: number | undefined): FieldPosition {
  if (!positionId) return 'MID';
  if (positionId === 1) return 'GK';
  if (positionId <= 8) return 'DEF';
  if (positionId <= 16 || (positionId >= 18 && positionId <= 20)) return 'MID';
  return 'FWD';
}

function fmtFormation(f?: number): string | undefined {
  return f ? String(f).split('').join('-') : undefined;
}

/** official-record minute label (StatsBomb minutes count from 0, records from 1) */
function minuteLabel(e: SBEvent): string {
  return `${e.minute + 1}'`;
}

// ------------------------------ waypoints -------------------------------------

interface Wp {
  t: number;
  x: number;
  z: number;
}

interface BallWp extends Wp {
  /** height at this waypoint, meters */
  h: number;
  /** arc peak (m) of the flight ARRIVING at this waypoint; 0 = along the ground */
  arc: number;
}

function pushWp(list: Wp[], t: number, x: number, z: number) {
  const last = list[list.length - 1];
  if (last && t <= last.t + 0.02) {
    last.x = x;
    last.z = z;
    return;
  }
  list.push({ t, x, z });
}

// ------------------------------ main entry ------------------------------------

export function reconstructSoccerMatch(
  meta: SBIndexMatch,
  events: SBEvent[],
  lineups: SBLineupTeam[]
): MatchIR {
  // ---- team identity -----------------------------------------------------
  const homeLineup = lineups.find((l) => l.team_name === meta.h) ?? lineups[0];
  const awayLineup = lineups.find((l) => l !== homeLineup) ?? lineups[1];
  const teamLetterBySbId = new Map<number, 'H' | 'A'>();
  teamLetterBySbId.set(homeLineup.team_id, 'H');
  teamLetterBySbId.set(awayLineup.team_id, 'A');

  const startingXI = events.filter((e) => e.type.name === 'Starting XI');
  const [homeKit, awayKit] = kitsForFixture(meta.h, meta.a);

  const teams: TeamInfo[] = [
    {
      id: 'H',
      name: meta.h,
      short: teamCode(meta.h),
      formation: fmtFormation(
        startingXI.find((e) => teamLetterBySbId.get(e.team.id) === 'H')?.tactics?.formation
      ),
      kit: homeKit,
      attackDir: 1,
    },
    {
      id: 'A',
      name: meta.a,
      short: teamCode(meta.a),
      formation: fmtFormation(
        startingXI.find((e) => teamLetterBySbId.get(e.team.id) === 'A')?.tactics?.formation
      ),
      kit: awayKit,
      attackDir: -1,
    },
  ];

  // ---- continuous match clock ---------------------------------------------
  const periods = [...new Set(events.map((e) => e.period))].sort((a, b) => a - b);
  const periodEnd = new Map<number, number>();
  for (const e of events) {
    const s = tsSec(e.timestamp) + (e.duration ?? 0);
    if (s > (periodEnd.get(e.period) ?? 0)) periodEnd.set(e.period, s);
  }
  const periodOffset = new Map<number, number>();
  let acc = 0;
  for (const p of periods) {
    periodOffset.set(p, acc);
    acc += (periodEnd.get(p) ?? 0) + PERIOD_PAD;
  }
  const duration = acc + 5;
  const tOf = (e: SBEvent) => (periodOffset.get(e.period) ?? 0) + tsSec(e.timestamp);

  // ---- coordinate transform -------------------------------------------------
  // StatsBomb coordinates are always in the acting team's attacking frame
  // (they attack x→120). World frame: home attacks +x in period 1, ends swap
  // each period. Mapping between the two frames is a 180° rotation.
  const dirOf = (letter: 'H' | 'A', period: number): 1 | -1 => {
    const homeDir = period % 2 === 1 ? 1 : -1;
    return (letter === 'H' ? homeDir : -homeDir) as 1 | -1;
  };
  const toWorld = (loc: [number, number], letter: 'H' | 'A', period: number) => {
    const s = dirOf(letter, period);
    return { x: s * (loc[0] - 60) * SX, z: s * (loc[1] - 40) * SZ };
  };

  // ---- roster ----------------------------------------------------------------
  interface P {
    sbId: number;
    eid: string;
    letter: 'H' | 'A';
    name: string;
    number: number;
    role: FieldPosition;
    /** [on, off] windows on the pitch, seconds */
    windows: [number, number][];
    wps: Wp[];
  }

  const players = new Map<number, P>();
  const letterOfEvent = (e: SBEvent): 'H' | 'A' => teamLetterBySbId.get(e.team.id) ?? 'H';

  const lineupInfo = new Map<number, { name: string; number: number }>();
  for (const team of lineups) {
    for (const lp of team.lineup) {
      lineupInfo.set(lp.player_id, {
        name: shortName(lp.player_name, lp.player_nickname),
        number: lp.jersey_number,
      });
    }
  }

  /** display name for event text — prefer the lineup nickname ("Messi", "Mbappé") */
  const displayName = (ref: SBRef): string =>
    lineupInfo.get(ref.id)?.name ?? shortName(ref.name);

  function ensurePlayer(ref: SBRef, letter: 'H' | 'A', positionId?: number): P {
    let p = players.get(ref.id);
    if (!p) {
      const info = lineupInfo.get(ref.id);
      p = {
        sbId: ref.id,
        eid: `p${ref.id}`,
        letter,
        name: info?.name ?? shortName(ref.name),
        number: info?.number ?? 0,
        role: roleOf(positionId),
        windows: [],
        wps: [],
      };
      players.set(ref.id, p);
    }
    return p;
  }

  // starters open a window at t=0
  for (const xi of startingXI) {
    const letter = letterOfEvent(xi);
    for (const slot of xi.tactics?.lineup ?? []) {
      const p = ensurePlayer(slot.player, letter, slot.position.id);
      p.role = roleOf(slot.position.id);
      p.number = slot.jersey_number || p.number;
      p.windows.push([0, duration]);
    }
  }

  const closeWindow = (p: P, t: number) => {
    const w = p.windows[p.windows.length - 1];
    if (w && w[1] > t) w[1] = t;
  };

  // ---- one pass over the event stream ----------------------------------------
  const ballWps: BallWp[] = [{ t: 0, x: 0, z: 0, h: BALL_R, arc: 0 }];
  const irEvents: MatchEvent[] = [];
  const scoreboard: ScoreSnapshot[] = [{ t: 0, home: 0, away: 0 }];
  const score = { H: 0, A: 0 };
  const pens = { H: 0, A: 0 };
  let sawPens = false;

  function pushBall(t: number, x: number, z: number, h = BALL_R, arc = 0, force = false) {
    const last = ballWps[ballWps.length - 1];
    if (t <= last.t + 0.02) {
      if (!force) return; // ambiguous same-instant locations: first one wins
      last.x = x;
      last.z = z;
      last.h = Math.max(last.h, h);
      last.arc = Math.max(last.arc, arc);
      return;
    }
    // data-noise guard: a non-authoritative waypoint implying an impossibly
    // fast SHORT hop is actor-position jitter, not the ball — drop it. But a
    // far relocation is real (restarts, out-of-play movement the data never
    // records): keep it, and the flight-repair pass below shapes it into a
    // plausible long ball instead of a teleport. Authoritative arrivals
    // (pass/shot with a too-short recorded duration) get their arrival time
    // pushed back to a physical ball speed.
    const d = Math.hypot(x - last.x, z - last.z);
    const speed = d / (t - last.t);
    if (speed > 38) {
      if (!force && d < 14) return;
      if (force) t = last.t + d / 38;
    }
    ballWps.push({ t, x, z, h, arc });
  }

  function addGoal(t: number, letter: 'H' | 'A', text: string, loc?: [number, number], actor?: string) {
    score[letter]++;
    scoreboard.push({ t, home: score.H, away: score.A, detail: sawPens ? pensDetail() : undefined });
    irEvents.push({
      t,
      type: 'goal',
      actor,
      team: letter,
      location: loc,
      animIntent: 'celebration',
      importance: 1,
      text,
    });
  }

  const pensDetail = () => `Pens ${pens.H}–${pens.A}`;

  // event types whose location is a genuine ball location (Goal Keeper, Block,
  // Dribbled Past etc. record the ACTOR's spot, which teleports the ball — the
  // actor still gets their waypoint via the player pass above)
  const BALL_EVENTS = new Set([
    'Pass', 'Ball Receipt*', 'Carry', 'Shot', 'Clearance', 'Interception',
    'Ball Recovery', 'Miscontrol', 'Dispossessed', 'Duel', '50/50',
    'Dribble', 'Shield', 'Foul Won',
  ]);

  const kickoffOfPeriod = new Set<number>();

  for (const e of events) {
    const t = tOf(e);
    const letter = letterOfEvent(e);
    const typeName = e.type.name;

    // period kickoffs: pin the ball to the centre spot as the half opens
    if (!kickoffOfPeriod.has(e.period)) {
      kickoffOfPeriod.add(e.period);
      const t0 = periodOffset.get(e.period) ?? 0;
      if (e.period > 1 && e.period < 5) pushBall(t0, 0, 0, BALL_R, 0, true);
      if (e.period === 2)
        irEvents.push({ t: t0, type: 'restart', importance: 0.45, text: 'Second half under way.' });
      if (e.period === 3)
        irEvents.push({ t: t0, type: 'restart', importance: 0.55, text: 'Extra time.' });
      if (e.period === 5) {
        sawPens = true;
        irEvents.push({ t: t0, type: 'restart', importance: 0.85, text: 'Penalty shoot-out.' });
      }
    }

    // player waypoint from the actor's real location
    if (e.player && e.location) {
      const p = ensurePlayer(e.player, letter, e.position?.id);
      const w = toWorld(e.location, letter, e.period);
      pushWp(p.wps, t, w.x, w.z);
    }

    // ball waypoint
    if (e.location && BALL_EVENTS.has(typeName)) {
      const w = toWorld(e.location, letter, e.period);
      pushBall(t, w.x, w.z);
    }

    switch (typeName) {
      case 'Pass': {
        const pass = e.pass!;
        const end = toWorld(pass.end_location, letter, e.period);
        const dur = Math.max(0.15, e.duration ?? (pass.length ?? 15) / 14);
        const hName = pass.height?.name ?? 'Ground Pass';
        const len = (pass.length ?? 15) * SX;
        const arc = hName === 'High Pass' ? clamp(2 + len * 0.14, 2.2, 9) : hName === 'Low Pass' ? 1.1 : 0;
        pushBall(t + dur, end.x, end.z, BALL_R, arc, true);
        if (pass.recipient) {
          const r = ensurePlayer(pass.recipient, letter);
          pushWp(r.wps, t + dur, end.x, end.z);
        }
        if (e.player) {
          irEvents.push({
            t,
            type: 'pass',
            actor: `p${e.player.id}`,
            team: letter,
            location: [toWorld(e.location!, letter, e.period).x, toWorld(e.location!, letter, e.period).z],
            animIntent: 'pass',
            importance: 0.12,
          });
        }
        break;
      }

      case 'Carry': {
        const end = toWorld(e.carry!.end_location, letter, e.period);
        const dur = Math.max(0.1, e.duration ?? 1);
        pushBall(t + dur, end.x, end.z, BALL_R, 0, true);
        if (e.player) {
          const p = ensurePlayer(e.player, letter);
          pushWp(p.wps, t + dur, end.x, end.z);
        }
        break;
      }

      case 'Shot': {
        const shot = e.shot!;
        const isPen = e.period === 5;
        const endRaw = shot.end_location;
        const end = toWorld([endRaw[0], endRaw[1]], letter, e.period);
        const endH = endRaw.length > 2 ? clamp((endRaw as number[])[2] * SY, 0, 4.5) : 0.4;
        const start = toWorld(e.location!, letter, e.period);
        const distM = Math.hypot(end.x - start.x, end.z - start.z);
        const dur = Math.max(0.2, e.duration ?? distM / 20);
        pushBall(t + dur, end.x, end.z, endH, Math.max(endH, 0.2), true);

        const who = e.player ? displayName(e.player) : 'Shot';
        const actor = e.player ? `p${e.player.id}` : undefined;
        const xg = shot.statsbomb_xg ?? 0.05;
        const outcome = shot.outcome.name;

        // freeze frame: pin every visible player to their true position
        for (const ff of shot.freeze_frame ?? []) {
          const ffLetter = ff.teammate ? letter : letter === 'H' ? 'A' : 'H';
          const fp = ensurePlayer(ff.player, ffLetter, ff.position?.id);
          // freeze-frame coords are in the SHOOTER's frame
          const fw = toWorld(ff.location, letter, e.period);
          pushWp(fp.wps, t, fw.x, fw.z);
        }

        if (isPen) {
          // shoot-out kick — never touches the main score
          const scored = outcome === 'Goal';
          if (scored) pens[letter]++;
          scoreboard.push({ t: t + dur, home: score.H, away: score.A, detail: pensDetail() });
          irEvents.push({
            t,
            type: scored ? 'goal' : 'shot',
            actor,
            team: letter,
            location: [start.x, start.z],
            target: [end.x, end.z],
            animIntent: scored ? 'celebration' : 'shot_finish',
            importance: 0.95,
            text: scored
              ? `Shoot-out: ${who} scores. ${pensDetail()}`
              : `Shoot-out: ${who} ${outcome === 'Saved' ? 'is denied!' : 'misses!'} ${pensDetail()}`,
          });
          break;
        }

        irEvents.push({
          t,
          type: 'shot',
          actor,
          team: letter,
          location: [start.x, start.z],
          target: [end.x, end.z],
          animIntent: 'shot_finish',
          importance: clamp(0.45 + xg * 0.5, 0.45, 0.9),
          text:
            outcome === 'Goal'
              ? `${who} shoots…`
              : outcome === 'Saved' || outcome === 'Saved to Post' || outcome === 'Saved Off Target'
                ? `${who}'s shot is saved.`
                : outcome === 'Post'
                  ? `${who} hits the woodwork!`
                  : outcome === 'Blocked'
                    ? `${who}'s shot is blocked.`
                    : `${who} shoots — off target.`,
        });

        if (outcome === 'Goal') {
          const team = teams[letter === 'H' ? 0 : 1];
          const penNote = shot.type?.name === 'Penalty' ? ' (pen)' : '';
          addGoal(
            t + dur,
            letter,
            `GOAL! ${team.short} — ${who}${penNote}, ${minuteLabel(e)}`,
            [end.x, end.z],
            actor
          );
        }
        break;
      }

      case 'Own Goal Against': {
        // goal credited to the OTHER team; this event carries the net location
        const other = letter === 'H' ? 'A' : 'H';
        const team = teams[other === 'H' ? 0 : 1];
        const who = e.player ? displayName(e.player) : 'Own goal';
        const w = e.location ? toWorld(e.location, letter, e.period) : undefined;
        addGoal(t, other, `GOAL! ${team.short} — own goal (${who}), ${minuteLabel(e)}`, w && [w.x, w.z]);
        break;
      }

      case 'Goal Keeper': {
        const gkType = e.goalkeeper?.type.name ?? '';
        if ((gkType === 'Shot Saved' || gkType === 'Penalty Saved') && e.player && e.period < 5) {
          const w = e.location ? toWorld(e.location, letter, e.period) : undefined;
          irEvents.push({
            t,
            type: 'save',
            actor: `p${e.player.id}`,
            team: letter,
            location: w && [w.x, w.z],
            animIntent: 'save',
            importance: 0.62,
            text: `Great save by ${displayName(e.player)}!`,
          });
        }
        break;
      }

      case 'Duel': {
        if (e.player && e.duel?.type?.name === 'Tackle') {
          irEvents.push({
            t,
            type: 'tackle',
            actor: `p${e.player.id}`,
            team: letter,
            animIntent: 'tackle',
            importance: 0.32,
            text: `${displayName(e.player)} with the challenge.`,
          });
        }
        break;
      }

      case 'Interception':
      case 'Ball Recovery': {
        if (e.player) {
          irEvents.push({
            t,
            type: 'tackle',
            actor: `p${e.player.id}`,
            team: letter,
            importance: 0.2,
          });
        }
        break;
      }

      case 'Dispossessed': {
        if (e.player)
          irEvents.push({ t, type: 'turnover', actor: `p${e.player.id}`, team: letter, importance: 0.18 });
        break;
      }

      case 'Foul Committed':
      case 'Bad Behaviour': {
        const card = (e.foul_committed?.card ?? e.bad_behaviour?.card)?.name;
        const who = e.player ? displayName(e.player) : 'Foul';
        if (card) {
          const red = card !== 'Yellow Card';
          irEvents.push({
            t,
            type: 'card',
            actor: e.player && `p${e.player.id}`,
            team: letter,
            importance: red ? 0.9 : 0.55,
            text: red ? `RED CARD — ${who}, ${minuteLabel(e)}` : `Yellow card — ${who}.`,
          });
          if ((card === 'Red Card' || card === 'Second Yellow') && e.player) {
            const p = players.get(e.player.id);
            if (p) closeWindow(p, t);
          }
        } else if (typeName === 'Foul Committed') {
          irEvents.push({
            t,
            type: 'foul',
            actor: e.player && `p${e.player.id}`,
            team: letter,
            importance: 0.2,
          });
        }
        break;
      }

      case 'Substitution': {
        const off = players.get(e.player!.id);
        if (off) closeWindow(off, t);
        const on = ensurePlayer(e.substitution!.replacement, letter, e.position?.id);
        on.windows.push([t, duration]);
        const team = teams[letter === 'H' ? 0 : 1];
        irEvents.push({
          t,
          type: 'sub',
          team: letter,
          importance: 0.4,
          text: `${team.short} sub: ${displayName(e.substitution!.replacement)} on for ${
            e.player ? displayName(e.player) : '—'
          }.`,
        });
        break;
      }

      case 'Player Off': {
        const p = e.player && players.get(e.player.id);
        if (p) closeWindow(p, t);
        break;
      }

      case 'Player On': {
        const p = e.player && players.get(e.player.id);
        if (p) p.windows.push([t, duration]);
        break;
      }

      case 'Offside': {
        irEvents.push({ t, type: 'foul', team: letter, importance: 0.25, text: 'Flag up — offside.' });
        break;
      }
    }
  }

  irEvents.unshift({
    t: 0,
    type: 'kickoff',
    team: 'H',
    location: [0, 0],
    importance: 0.4,
    text: `Kick-off: ${meta.h} vs ${meta.a}.`,
  });

  // ---- ball flight repair ------------------------------------------------------
  // Fast long hops (restarts the data never recorded, relocations kept by the
  // guard above) would read as teleports if the ball zipped along the ground.
  // Fake them as lofted long balls: give the flight an arc, and stretch truly
  // impossible arrivals to a hard speed cap where the timeline allows.
  {
    const VARC = 22; // arc any flight quicker than this over distance
    const VMAX = 45; // absolute speed cap; arrivals stretch to meet it
    for (let i = 1; i < ballWps.length; i++) {
      const a = ballWps[i - 1];
      const b = ballWps[i];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const v = d / Math.max(b.t - a.t, 1e-3);
      if (d > 18 && v > VARC) b.arc = Math.max(b.arc, clamp(d * 0.14, 2.5, 9));
      if (v > VMAX) {
        const next = ballWps[i + 1];
        b.t = Math.min(a.t + d / VMAX, next ? next.t - 0.08 : Infinity);
      }
    }
  }

  // ---- dead spans ----------------------------------------------------------------
  // Long stretches with no ball movement (free-kick setups, VAR, injuries,
  // celebrations). The playback clock jumps over these while playing. Each span
  // starts after a short linger (longer after goals, so celebrations breathe)
  // and ends just before the dense track starts easing the ball to its next spot.
  const deadSpans: [number, number][] = [];
  {
    const SKIP_GAP = 8; // only gaps longer than this are worth skipping
    const goalTimes = irEvents.filter((e) => e.type === 'goal').map((e) => e.t);
    for (let i = 1; i < ballWps.length; i++) {
      const a = ballWps[i - 1];
      const b = ballWps[i];
      const gap = b.t - a.t;
      if (gap <= SKIP_GAP) continue;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const travel = clamp(d / 16, 0.8, Math.min(6, gap * 0.8)); // mirror dense-track easing
      const nearGoal = goalTimes.some((g) => g >= a.t - 3 && g <= a.t + 1);
      const linger = nearGoal ? 4.5 : 2.5;
      const s0 = a.t + linger;
      const s1 = b.t - travel - 1;
      if (s1 - s0 > 1.5) deadSpans.push([s0, s1]);
    }
  }

  // ---- ball dense track --------------------------------------------------------
  const ballFrames = Math.ceil(duration * BALL_HZ) + 1;
  const ballTrack = createTrack(BALL_HZ, ballFrames);
  {
    let i = 0;
    for (let f = 0; f < ballFrames; f++) {
      const t = f / BALL_HZ;
      while (i < ballWps.length - 2 && ballWps[i + 1].t <= t) i++;
      const a = ballWps[i];
      const b = ballWps[Math.min(i + 1, ballWps.length - 1)];
      let x = a.x;
      let z = a.z;
      let y = a.h;
      if (b.t > a.t && t >= a.t) {
        const gap = b.t - a.t;
        let f01 = clamp((t - a.t) / gap, 0, 1);
        if (gap > 3.5) {
          // dead ball: hold, then travel late in the gap at a physical pace
          const d = Math.hypot(b.x - a.x, b.z - a.z);
          const travel = clamp(d / 16, 0.8, Math.min(6, gap * 0.8));
          f01 = t < b.t - travel ? 0 : smooth((t - (b.t - travel)) / travel);
        }
        x = lerp(a.x, b.x, f01);
        z = lerp(a.z, b.z, f01);
        // flight arc into b: parabola over the segment + endpoint heights
        const base = lerp(a.h, b.h, f01);
        y = base + (b.arc > 0 ? b.arc * 4 * f01 * (1 - f01) : 0);
      }
      ballTrack.x[f] = x;
      ballTrack.y[f] = Math.max(BALL_R, y);
      ballTrack.z[f] = z;
    }
    // speed + heading from finite differences
    for (let f = 0; f < ballFrames; f++) {
      const g = Math.min(f + 1, ballFrames - 1);
      const dx = (ballTrack.x[g] - ballTrack.x[f]) * BALL_HZ;
      const dz = (ballTrack.z[g] - ballTrack.z[f]) * BALL_HZ;
      ballTrack.speed[f] = Math.hypot(dx, dz);
      ballTrack.heading[f] =
        Math.hypot(dx, dz) > 0.5 ? Math.atan2(dx, dz) : f > 0 ? ballTrack.heading[f - 1] : 0;
    }
  }

  // ---- player dense tracks -------------------------------------------------
  const entities: Entity[] = [{ id: 'ball', role: 'ball' }];
  const tracks: Record<string, Track> = { ball: ballTrack };

  const periodStarts = periods.map((p) => ({ p, t0: periodOffset.get(p) ?? 0 }));
  const periodAt = (t: number): number => {
    let cur = periods[0];
    for (const { p, t0 } of periodStarts) if (t >= t0) cur = p;
    return cur;
  };

  const ballAt = (t: number) => {
    const f = clamp(Math.round(t * BALL_HZ), 0, ballFrames - 1);
    return { x: ballTrack.x[f], z: ballTrack.z[f] };
  };

  const pFrames = Math.ceil(duration * PLAYER_HZ) + 1;
  const roster = [...players.values()].filter((p) => p.windows.length > 0 || p.wps.length > 3);

  // bench slots along the far touchline
  let benchH = 0;
  let benchA = 0;

  for (const p of roster) {
    if (p.windows.length === 0) p.windows.push([duration + 1, duration + 1]); // never on

    entities.push({
      id: p.eid,
      role: 'player',
      team: p.letter,
      name: p.name,
      number: p.number,
      position: p.role,
    });

    const track = createTrack(PLAYER_HZ, pFrames);
    tracks[p.eid] = track;

    // anchor = mean of the player's real locations, in the team's attacking frame
    let mx = p.role === 'GK' ? -48 : p.role === 'DEF' ? -18 : p.role === 'MID' ? 0 : 15;
    let mz = 0;
    if (p.wps.length > 0) {
      let sx = 0;
      let sz = 0;
      for (const w of p.wps) {
        const s = dirOf(p.letter, periodAt(w.t));
        sx += w.x * s;
        sz += w.z * s;
      }
      mx = clamp(sx / p.wps.length, -HALF_L + 4, HALF_L - 4);
      mz = clamp(sz / p.wps.length, -HALF_W + 3, HALF_W - 3);
    }
    const pushAmt = p.role === 'GK' ? 2.5 : p.role === 'DEF' ? 8 : p.role === 'MID' ? 11 : 13;

    const benchIdx = p.letter === 'H' ? benchH++ : benchA++;
    const benchX = (p.letter === 'H' ? -1 : 1) * (6 + (benchIdx % 10) * 2.4);
    const benchZ = HALF_W + 4;

    const onAt = (t: number) => p.windows.some(([a, b]) => t >= a && t < b);

    const wpTimes = p.wps.map((w) => w.t);
    let wi = 0;

    for (let f = 0; f < pFrames; f++) {
      const t = f / PLAYER_HZ;

      if (!onAt(t)) {
        track.x[f] = benchX;
        track.z[f] = benchZ;
        continue;
      }

      // team-shape anchor that follows the ball
      const s = dirOf(p.letter, periodAt(t));
      const ball = ballAt(t);
      const ballTX = ball.x * s; // ball in team frame
      const ballTZ = ball.z * s;
      const push = clamp(ballTX / HALF_L, -1, 1) * pushAmt;
      const zbias = clamp(ballTZ * 0.22, -8, 8);
      const ax = clamp((mx + push) * s, -HALF_L + 1, HALF_L - 1);
      const az = clamp((mz + zbias) * s, -HALF_W + 1, HALF_W - 1);

      // pull onto real waypoints when one is near in time
      while (wi < wpTimes.length - 1 && wpTimes[wi + 1] <= t) wi++;
      const prev = p.wps[wi] && wpTimes[wi] <= t ? p.wps[wi] : undefined;
      const next = wpTimes[wi] > t ? p.wps[wi] : p.wps[wi + 1];

      const WINDOW = 7;
      let wpX = ax;
      let wpZ = az;
      let wgt = 0;
      if (prev && next && next.t > prev.t) {
        const gap = next.t - prev.t;
        const f01 = clamp((t - prev.t) / gap, 0, 1);
        if (gap <= 9) {
          wpX = lerp(prev.x, next.x, f01);
          wpZ = lerp(prev.z, next.z, f01);
          wgt = 1;
        } else {
          const wIn = Math.max(0, 1 - (t - prev.t) / WINDOW);
          const wOut = Math.max(0, 1 - (next.t - t) / WINDOW);
          wgt = Math.max(wIn, wOut);
          const target = wIn >= wOut ? prev : next;
          wpX = target.x;
          wpZ = target.z;
        }
      } else if (prev) {
        wgt = Math.max(0, 1 - (t - prev.t) / WINDOW);
        wpX = prev.x;
        wpZ = prev.z;
      } else if (next) {
        wgt = Math.max(0, 1 - (next.t - t) / WINDOW);
        wpX = next.x;
        wpZ = next.z;
      }

      track.x[f] = lerp(ax, wpX, wgt);
      track.z[f] = lerp(az, wpZ, wgt);
    }

    // smooth (two 5-tap passes ≈ 0.5s window at 8Hz) then derive speed/heading
    for (let pass = 0; pass < 2; pass++) {
      let px = track.x[0];
      let pz = track.z[0];
      for (let f = 1; f < pFrames - 1; f++) {
        const nx = (px + track.x[f] * 2 + track.x[f + 1]) / 4;
        const nz = (pz + track.z[f] * 2 + track.z[f + 1]) / 4;
        px = track.x[f];
        pz = track.z[f];
        track.x[f] = nx;
        track.z[f] = nz;
      }
    }
    let heading = p.letter === 'H' ? 0 : Math.PI;
    for (let f = 0; f < pFrames; f++) {
      const t = f / PLAYER_HZ;
      if (!onAt(t)) {
        // benched: face the game (track the ball), never the crowd — a
        // stationary player would otherwise keep the default team heading,
        // which for the home bench points into the stands
        const b = ballAt(t);
        heading = Math.atan2(b.x - track.x[f], b.z - track.z[f]);
        track.heading[f] = heading;
        track.speed[f] = 0;
        track.action[f] = actionFromSpeed(0);
        continue;
      }
      const g = Math.min(f + 1, pFrames - 1);
      const dx = (track.x[g] - track.x[f]) * PLAYER_HZ;
      const dz = (track.z[g] - track.z[f]) * PLAYER_HZ;
      const sp = Math.min(Math.hypot(dx, dz), 9.5);
      track.speed[f] = sp;
      if (sp > 0.5) heading = Math.atan2(dx, dz);
      track.heading[f] = heading;
      track.action[f] = actionFromSpeed(sp);
    }
  }

  // ---- assemble ----------------------------------------------------------------
  const PERIOD_MINUTE: Record<number, [number, string]> = {
    1: [0, 'First half'],
    2: [45, 'Second half'],
    3: [90, 'Extra time'],
    4: [105, 'Extra time'],
    5: [120, 'Penalties'],
  };
  const periodSpecs: PeriodSpec[] = periods.map((p) => ({
    t0: periodOffset.get(p) ?? 0,
    startMinute: PERIOD_MINUTE[p]?.[0] ?? 120,
    label: PERIOD_MINUTE[p]?.[1] ?? 'Penalties',
  }));

  const koHour = meta.ko ? parseInt(meta.ko.slice(0, 2), 10) : 20;
  const mood = koHour >= 17 || koHour < 6 ? 'night' : koHour >= 16 ? 'dusk' : 'day';

  const stage = meta.st && meta.st !== 'Regular Season' ? ` — ${meta.st}` : '';

  return {
    id: `sb-${meta.id}`,
    sport: 'soccer',
    fidelity: 'tracking',
    meta: {
      title: `${meta.h} vs ${meta.a}`,
      competition: `${meta.c} ${meta.s}${stage}`,
      date: meta.d,
      venue: meta.v ?? undefined,
      teams,
      score,
      attribution: 'Data: StatsBomb Open Data',
      mood,
    },
    fieldSpec: {
      type: 'soccer',
      length: L,
      width: W,
      goalWidth: 3.66,
      goalHeight: 2.44,
    },
    duration,
    deadSpans,
    periods: periodSpecs,
    entities,
    tracks,
    events: irEvents.sort((a, b) => a.t - b.t),
    scoreboard,
  };
}

export { accentFor };
