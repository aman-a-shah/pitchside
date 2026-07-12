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
  Sample,
  ScoreSnapshot,
  TeamInfo,
  Track,
} from '@/ir/types';
import { createTrack, lerpAngle, sampleTrack } from '@/ir/sampler';
import { eraOf } from '@/lib/era';
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

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const smooth = (f: number) => f * f * (3 - 2 * f);

/** deterministic per-player 0..1 (persona traits must survive reloads/scrubs) */
function hash01p(id: number, salt: number): number {
  let h = (Math.imul(id, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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
  /** entity responsible for the ball AT this waypoint (actor / pass recipient) */
  actor?: string;
  /** the actor fetches the ball and carries it here (see escort pass) */
  escort?: boolean;
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

  function pushBall(
    t: number,
    x: number,
    z: number,
    h = BALL_R,
    arc = 0,
    force = false,
    actor?: string
  ) {
    const last = ballWps[ballWps.length - 1];
    if (t <= last.t + 0.02) {
      if (!force) return; // ambiguous same-instant locations: first one wins
      last.x = x;
      last.z = z;
      last.h = Math.max(last.h, h);
      last.arc = Math.max(last.arc, arc);
      last.actor ??= actor;
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
    ballWps.push({ t, x, z, h, arc, actor });
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

  // dead-ball restarts: the ball must be PLACED and at rest before it's
  // struck. Without this the dense-track easing has the ball arrive at the
  // spot at the exact instant of the kick, still moving flat out — goal
  // kicks looked like the ball was struck from a random spot mid-flight.
  const RESTART_PASSES = new Set(['Goal Kick', 'Corner', 'Free Kick', 'Throw-in', 'Kick Off']);

  const kickoffOfPeriod = new Set<number>();

  // ---- possession model -----------------------------------------------------
  // Who has the ball at their feet, and when it is genuinely in flight. The
  // ball waypoints and the player tracks are synthesized independently, so on
  // their own they drift apart; possession spans let a final pass glue the
  // rendered ball to the carrier's ACTUAL track (the only way it truly stays
  // on the dribbler's boots). Flight windows are the passes/shots where it
  // must not be glued to anyone.
  interface PossSpan {
    t0: number;
    t1: number;
    eid: string;
  }
  const possSpans: PossSpan[] = [];
  const flights: [number, number][] = [];
  let carrier: { eid: string; t0: number } | null = null;
  const closePoss = (t: number) => {
    if (carrier && t > carrier.t0 + 0.05) possSpans.push({ t0: carrier.t0, t1: t, eid: carrier.eid });
    carrier = null;
  };
  const openPoss = (eid: string, t: number) => {
    if (carrier?.eid === eid) return;
    closePoss(t);
    carrier = { eid, t0: t };
  };

  for (const e of events) {
    const t = tOf(e);
    const letter = letterOfEvent(e);
    const typeName = e.type.name;

    // period kickoffs: pin the ball to the centre spot as the half opens
    if (!kickoffOfPeriod.has(e.period)) {
      kickoffOfPeriod.add(e.period);
      const t0 = periodOffset.get(e.period) ?? 0;
      closePoss(Math.max(0, t0 - PERIOD_PAD));
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

    // dead-ball restart choreography — MUST run before the generic waypoint
    // pushes below (pushBall/pushWp merge same-instant entries, so the
    // earlier "settle" waypoints have to enter the lists first). The ball is
    // placed on the spot ~2s before the kick and rests there; the taker
    // arrives and stands over it, then strikes a stationary ball.
    if (typeName === 'Pass' && e.location && RESTART_PASSES.has(e.pass?.type?.name ?? '')) {
      const w = toWorld(e.location, letter, e.period);
      const last = ballWps[ballWps.length - 1];
      const gap = t - last.t;
      const d = Math.hypot(w.x - last.x, w.z - last.z);
      // leave the approach at least its natural travel time (mirrors the
      // dense-track pace cap), then settle with whatever remains, up to 2.2s
      const settle = Math.min(2.2, gap - Math.max(0.8, d / 16) - 0.3);
      if (settle > 0.6) {
        closePoss(t - settle); // the ball is placed on the spot — nobody carries it
        pushBall(t - settle, w.x, w.z, BALL_R, 0, true, e.player ? `p${e.player.id}` : undefined);
        if (e.player) {
          const p = ensurePlayer(e.player, letter, e.position?.id);
          const standT = t - Math.min(1.5, settle);
          const lastWp = p.wps[p.wps.length - 1];
          if (!lastWp || standT > lastWp.t + 0.3) pushWp(p.wps, standT, w.x, w.z);
        }
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
      pushBall(t, w.x, w.z, BALL_R, 0, false, e.player ? `p${e.player.id}` : undefined);
    }

    switch (typeName) {
      case 'Pass': {
        const pass = e.pass!;
        const end = toWorld(pass.end_location, letter, e.period);
        const dur = Math.max(0.15, e.duration ?? (pass.length ?? 15) / 14);
        const hName = pass.height?.name ?? 'Ground Pass';
        const len = (pass.length ?? 15) * SX;
        const arc = hName === 'High Pass' ? clamp(2 + len * 0.14, 2.2, 9) : hName === 'Low Pass' ? 1.1 : 0;
        pushBall(
          t + dur,
          end.x,
          end.z,
          BALL_R,
          arc,
          true,
          !pass.outcome && pass.recipient ? `p${pass.recipient.id}` : undefined
        );
        closePoss(t);
        flights.push([t, t + dur]);
        // a completed pass (no outcome recorded) hands possession to the
        // recipient the moment the ball arrives
        if (!pass.outcome && pass.recipient) carrier = { eid: `p${pass.recipient.id}`, t0: t + dur };
        if (pass.recipient) {
          const r = ensurePlayer(pass.recipient, letter);
          pushWp(r.wps, t + dur, end.x, end.z);
        }
        if (e.player) {
          const who = displayName(e.player);
          const recip = pass.recipient ? displayName(pass.recipient) : null;
          const kind = pass.type?.name;
          const outName = pass.outcome?.name;
          const bodyPart = pass.body_part?.name;
          const headed = bodyPart === 'Head';
          const live =
            kind === 'Throw-in'
              ? `Throw-in — ${who}`
              : kind === 'Corner'
                ? `Corner — ${who} delivers`
                : kind === 'Free Kick'
                  ? `${who} takes the free kick`
                  : kind === 'Goal Kick'
                    ? `Goal kick — ${who}`
                    : kind === 'Kick Off'
                      ? `${who} gets it moving`
                      : outName === 'Out'
                        ? `${who} puts it out of play`
                        : outName === 'Pass Offside'
                          ? `${who} plays it through — flag up`
                          : !outName && recip
                            ? headed
                              ? `${who} heads it to ${recip}`
                              : hName === 'High Pass' && (pass.length ?? 0) > 30
                                ? `${who} goes long to ${recip}`
                                : `${who} passes to ${recip}`
                            : outName === 'Incomplete'
                              ? recip
                                ? `${who}'s ball to ${recip} is cut out`
                                : `${who}'s pass doesn't come off`
                              : `${who} gives it away`;
          irEvents.push({
            t,
            type: 'pass',
            actor: `p${e.player.id}`,
            team: letter,
            location: [toWorld(e.location!, letter, e.period).x, toWorld(e.location!, letter, e.period).z],
            // real body part → the right one-shot: two-handed throw for
            // throw-ins (and keeper bowls), a headed flick for headers
            animIntent:
              kind === 'Throw-in' || bodyPart === 'Keeper Arm'
                ? 'throw'
                : headed
                  ? 'header'
                  : 'pass',
            importance: 0.12,
            live,
          });
        }
        break;
      }

      case 'Carry': {
        const end = toWorld(e.carry!.end_location, letter, e.period);
        const dur = Math.max(0.1, e.duration ?? 1);
        pushBall(t + dur, end.x, end.z, BALL_R, 0, true, e.player ? `p${e.player.id}` : undefined);
        if (e.player) {
          const p = ensurePlayer(e.player, letter);
          pushWp(p.wps, t + dur, end.x, end.z);
          openPoss(p.eid, t);
          // ticker line for a genuine run with the ball (short touches between
          // passes would just churn the text) — SB coords, so +x is always
          // "toward the goal they attack"
          const distSB = Math.hypot(
            e.carry!.end_location[0] - e.location![0],
            e.carry!.end_location[1] - e.location![1]
          );
          if (distSB >= 4) {
            const who = displayName(e.player);
            const fwdGain = e.carry!.end_location[0] - e.location![0];
            irEvents.push({
              t,
              type: 'carry',
              actor: p.eid,
              team: letter,
              importance: 0.05,
              live: fwdGain > 9 ? `${who} drives forward with the ball` : `${who} on the ball`,
            });
          }
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
        closePoss(t);
        flights.push([t, t + dur]);

        // goals: physics don't stop at the goal line — the net catches the
        // ball, absorbs it, and it drops with a soft bounce and settles.
        // (Without this the track froze the ball mid-net until the respot.)
        if (shot.outcome.name === 'Goal') {
          const tg = t + dur;
          const ux = (end.x - start.x) / (distM || 1);
          const uz = (end.z - start.z) / (distM || 1);
          pushBall(tg + 0.16, end.x + ux * 1.0, end.z + uz * 1.0, Math.max(BALL_R, endH * 0.35), 0, true);
          pushBall(tg + 0.55, end.x + ux * 0.72, end.z + uz * 0.72, BALL_R, 0.3, true);
          pushBall(tg + 1.35, end.x + ux * 0.85, end.z + uz * 0.85, BALL_R, 0, true);
        }

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

        const headed = shot.body_part?.name === 'Head';
        irEvents.push({
          t,
          type: 'shot',
          actor,
          team: letter,
          location: [start.x, start.z],
          target: [end.x, end.z],
          animIntent: headed ? 'header' : 'shot_finish',
          importance: clamp(0.45 + xg * 0.5, 0.45, 0.9),
          text:
            outcome === 'Goal'
              ? headed
                ? `${who} rises to head it…`
                : `${who} shoots…`
              : outcome === 'Saved' || outcome === 'Saved to Post' || outcome === 'Saved Off Target'
                ? `${who}'s ${headed ? 'header' : 'shot'} is saved.`
                : outcome === 'Post'
                  ? `${who} hits the woodwork!`
                  : outcome === 'Blocked'
                    ? `${who}'s ${headed ? 'header' : 'shot'} is blocked.`
                    : headed
                      ? `${who} heads it off target.`
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

      case 'Ball Receipt*': {
        // a controlled receipt (no outcome = clean) puts the ball at this
        // player's feet until something else happens to it
        if (e.player && !e.ball_receipt?.outcome) openPoss(`p${e.player.id}`, t);
        break;
      }

      case 'Dribble': {
        if (e.player) {
          openPoss(`p${e.player.id}`, t);
          irEvents.push({
            t,
            type: 'carry',
            actor: `p${e.player.id}`,
            team: letter,
            importance: 0.15,
            live: `${displayName(e.player)} takes the defender on`,
          });
        }
        break;
      }

      case 'Miscontrol': {
        closePoss(t);
        if (e.player)
          irEvents.push({
            t,
            type: 'turnover',
            actor: `p${e.player.id}`,
            team: letter,
            importance: 0.08,
            live: `${displayName(e.player)} miscontrols it`,
          });
        break;
      }

      case 'Clearance': {
        closePoss(t);
        if (e.player)
          irEvents.push({
            t,
            type: 'clearance',
            actor: `p${e.player.id}`,
            team: letter,
            importance: 0.1,
            live: `${displayName(e.player)} clears it`,
          });
        break;
      }

      case 'Out': {
        closePoss(t);
        irEvents.push({ t, type: 'out', importance: 0.06, live: 'The ball runs out of play' });
        break;
      }

      case '50/50':
      case 'Foul Won':
      case 'Shield': {
        closePoss(t);
        break;
      }

      case 'Goal Keeper': {
        closePoss(t);
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
        closePoss(t);
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
        closePoss(t);
        if (e.player) {
          irEvents.push({
            t,
            type: 'tackle',
            actor: `p${e.player.id}`,
            team: letter,
            importance: 0.2,
            live: `${displayName(e.player)} wins the ball back`,
          });
        }
        break;
      }

      case 'Dispossessed': {
        closePoss(t);
        if (e.player)
          irEvents.push({
            t,
            type: 'turnover',
            actor: `p${e.player.id}`,
            team: letter,
            importance: 0.18,
            live: `${displayName(e.player)} is dispossessed`,
          });
        break;
      }

      case 'Foul Committed':
      case 'Bad Behaviour': {
        closePoss(t);
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
            live: e.player ? `Foul by ${displayName(e.player)}` : 'Free kick given',
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
        if (p) {
          // a brief treatment/equipment pause: the player never really left,
          // so reopen the window rather than teleporting them to the bench
          // and back for a few seconds
          const last = p.windows[p.windows.length - 1];
          if (last && t - last[1] < 90) last[1] = duration;
          else p.windows.push([t, duration]);
        }
        break;
      }

      case 'Offside': {
        irEvents.push({ t, type: 'foul', team: letter, importance: 0.25, text: 'Flag up — offside.' });
        break;
      }
    }
  }

  closePoss(duration);

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

  // ---- escort unattended relocations --------------------------------------------
  // A dead ball that has to travel to the next action (goal-kick respots,
  // throw-in returns, gaps the data never recorded) used to roll there ALONE —
  // on screen it read as the ball being kicked from empty grass. Whoever acts
  // next now fetches it: they get a waypoint at the ball's old spot when the
  // travel starts and a possession span for the trip, so the attach pass glues
  // the ball to their feet the whole way there.
  const ESCORT_PACE = 6.5; // carrying pace, m/s (a player can actually keep up)
  const escortTravel = (a: BallWp, b: BallWp) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const pace = b.escort ? ESCORT_PACE : 16;
    return clamp(d / pace, 0.8, Math.min(b.escort ? 9 : 6, (b.t - a.t) * 0.8));
  };
  {
    const playersByEid = new Map([...players.values()].map((pl) => [pl.eid, pl] as const));
    for (let i = 1; i < ballWps.length; i++) {
      const a = ballWps[i - 1];
      const b = ballWps[i];
      const gap = b.t - a.t;
      if (gap <= 3.5) continue;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < 6 || d > 30 || !b.actor) continue;
      const p = playersByEid.get(b.actor);
      if (!p) continue;
      b.escort = true;
      const tStart = b.t - escortTravel(a, b);
      // don't fight the player's real recorded movement in that window
      if (p.wps.some((w) => w.t > tStart - 1.5 && w.t < b.t - 0.05)) {
        b.escort = false;
        continue;
      }
      const idx = p.wps.findIndex((w) => w.t > tStart);
      const wp = { t: tStart, x: a.x, z: a.z };
      if (idx < 0) p.wps.push(wp);
      else p.wps.splice(idx, 0, wp);
      possSpans.push({ t0: tStart, t1: b.t, eid: p.eid });
    }
  }

  // finalize possession spans: time-ordered, non-overlapping, indexed by player
  possSpans.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i < possSpans.length - 1; i++)
    possSpans[i].t1 = Math.min(possSpans[i].t1, possSpans[i + 1].t0);
  flights.sort((a, b) => a[0] - b[0]);
  const spansByEid = new Map<string, PossSpan[]>();
  for (const sp of possSpans) {
    let list = spansByEid.get(sp.eid);
    if (!list) spansByEid.set(sp.eid, (list = []));
    list.push(sp);
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
      const travel = escortTravel(a, b); // mirror dense-track easing
      const nearGoal = goalTimes.some((g) => g >= a.t - 3 && g <= a.t + 1);
      const linger = nearGoal ? 4.5 : 2.5;
      const s0 = a.t + linger;
      // escorted travel is worth watching (a player brings the ball); an
      // unescorted far respot is a ghost roll — jump straight past it
      const s1 = !b.escort && d > 6 ? b.t - 0.25 : b.t - travel - 1;
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
          // dead ball: hold, then travel late in the gap — carried by the
          // escorting player when one fetches it, eased otherwise
          const travel = escortTravel(a, b);
          f01 = t < b.t - travel ? 0 : smooth((t - (b.t - travel)) / travel);
        } else if (b.arc === 0) {
          // ground ball: friction — leaves the boot quick, decelerates in
          f01 = 1 - Math.pow(1 - f01, 1.6);
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
  }
  // speed + heading from finite differences (rerun after the possession pass
  // below rewrites possessed frames)
  const deriveBall = () => {
    for (let f = 0; f < ballFrames; f++) {
      const g = Math.min(f + 1, ballFrames - 1);
      const dx = (ballTrack.x[g] - ballTrack.x[f]) * BALL_HZ;
      const dz = (ballTrack.z[g] - ballTrack.z[f]) * BALL_HZ;
      ballTrack.speed[f] = Math.hypot(dx, dz);
      ballTrack.heading[f] =
        Math.hypot(dx, dz) > 0.5 ? Math.atan2(dx, dz) : f > 0 ? ballTrack.heading[f - 1] : 0;
    }
  };
  deriveBall();

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

    // per-player persona — no two players react to the game identically. A
    // shared deterministic anchor formula made whole teams translate in
    // lockstep; individual reaction lag, gains and a slow wander break that.
    const pr = (salt: number) => hash01p(p.sbId, salt);
    const lag = p.role === 'GK' ? 0.15 : 0.3 + pr(1) * 0.85;
    const gainPush = 0.78 + pr(2) * 0.45;
    const gainZ = p.role === 'GK' ? 0.3 : 0.14 + pr(3) * 0.14;
    const wanderA = p.role === 'GK' ? 0.35 : 0.9 + pr(4) * 1.3;
    const w1 = 0.25 + pr(5) * 0.4; // rad/s — slow jockeying drift
    const w2 = 0.7 + pr(6) * 0.7;
    const ph1 = pr(7) * TAU;
    const ph2 = pr(8) * TAU;
    const ph3 = pr(9) * TAU;
    const ph4 = pr(10) * TAU;
    const prefSpeed = 3.0 + pr(11) * 1.6; // off-ball approach pace, m/s
    const bowDir = pr(12) < 0.5 ? -1 : 1;

    const benchIdx = p.letter === 'H' ? benchH++ : benchA++;
    const benchX = (p.letter === 'H' ? -1 : 1) * (6 + (benchIdx % 10) * 2.4);
    const benchZ = HALF_W + 4;

    const onAt = (t: number) => p.windows.some(([a, b]) => t >= a && t < b);

    const wpTimes = p.wps.map((w) => w.t);
    let wi = 0;
    const mySpans = spansByEid.get(p.eid) ?? [];
    let mi = 0;

    for (let f = 0; f < pFrames; f++) {
      const t = f / PLAYER_HZ;

      if (!onAt(t)) {
        track.x[f] = benchX;
        track.z[f] = benchZ;
        continue;
      }

      // team-shape anchor that follows the ball — through this player's own
      // reaction lag and gains, plus a slow wander so nobody is statue-still
      const s = dirOf(p.letter, periodAt(t));
      const ball = ballAt(Math.max(0, t - lag));
      const ballTX = ball.x * s; // ball in team frame
      const ballTZ = ball.z * s;
      const push = clamp(ballTX / HALF_L, -1, 1) * pushAmt * gainPush;
      const zbias = clamp(ballTZ * gainZ, -9, 9);
      const wx = (Math.sin(t * w1 + ph1) + 0.4 * Math.sin(t * w2 + ph2)) * wanderA;
      const wz = (Math.cos(t * w1 * 0.83 + ph3) + 0.4 * Math.sin(t * w2 * 1.13 + ph4)) * wanderA;
      const ax = clamp((mx + push) * s + wx, -HALF_L + 1, HALF_L - 1);
      const az = clamp((mz + zbias) * s + wz, -HALF_W + 1, HALF_W - 1);

      // real waypoints pin the player; between them, move like a footballer:
      // linger, then set off in time to arrive at a natural pace. (The old
      // constant-velocity slide and the mid-gap target snap both read as
      // robotic — and the snap caused visible position pops.)
      while (wi < wpTimes.length - 1 && wpTimes[wi + 1] <= t) wi++;
      const prev = p.wps[wi] && wpTimes[wi] <= t ? p.wps[wi] : undefined;
      const next = wpTimes[wi] > t ? p.wps[wi] : p.wps[wi + 1];

      let x = ax;
      let z = az;
      if (prev && next && next.t > prev.t && next.t - prev.t <= 9) {
        const gap = next.t - prev.t;
        const d = Math.hypot(next.x - prev.x, next.z - prev.z);
        const travel = clamp(d / prefSpeed, Math.min(0.35, gap), gap);
        const dep = next.t - travel;
        const f01 = t <= dep ? 0 : smooth(clamp((t - dep) / travel, 0, 1));
        x = lerp(prev.x, next.x, f01);
        z = lerp(prev.z, next.z, f01);
        if (d > 4 && f01 > 0) {
          // slight curved run — nobody covers ground in a laser-straight line
          const bow = Math.sin(f01 * Math.PI) * Math.min(d * 0.07, 1.7) * bowDir;
          x += (-(next.z - prev.z) / d) * bow;
          z += ((next.x - prev.x) / d) * bow;
        }
        if (f01 <= 0) {
          // lingering on the spot: a hint of wander keeps them alive
          x += wx * 0.3;
          z += wz * 0.3;
        }
      } else {
        // long gap (or no bracketing waypoint): relax from the last real spot
        // back into team shape, then set off in time to make the next one
        if (prev) {
          const relax = smooth(clamp(1 - (t - prev.t) / 6, 0, 1));
          x = lerp(x, prev.x, relax);
          z = lerp(z, prev.z, relax);
        }
        if (next) {
          const dA = Math.hypot(next.x - x, next.z - z);
          const travel = clamp(dA / prefSpeed, 0.5, 8);
          const appr = smooth(clamp(1 - (next.t - t) / travel, 0, 1));
          x = lerp(x, next.x, appr);
          z = lerp(z, next.z, appr);
        }
      }

      // while THIS player has the ball, stay with it — the waypoint schedule
      // doesn't know about possession and would happily wander a keeper (or a
      // slow-carrying midfielder) away from a ball at their feet
      while (mi < mySpans.length && mySpans[mi].t1 < t) mi++;
      if (mi < mySpans.length && t >= mySpans[mi].t0) {
        const sp = mySpans[mi];
        const bp = ballAt(t);
        const d = Math.hypot(bp.x - x, bp.z - z);
        const w = 0.75 * clamp((t - sp.t0) / 0.4, 0, 1);
        if (d < 14 && w > 0) {
          x = lerp(x, bp.x, w);
          z = lerp(z, bp.z, w);
        }
      }
      track.x[f] = x;
      track.z[f] = z;
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
    // hard cap on implied ground speed — freeze-frame pins and long-gap pulls
    // can otherwise demand superhuman glides. Resets across bench and period
    // boundaries (legitimate teleports, not gameplay).
    {
      const MAXD = 9.2 / PLAYER_HZ;
      let lx = track.x[0];
      let lz = track.z[0];
      for (let f = 1; f < pFrames; f++) {
        const t = f / PLAYER_HZ;
        const freeMove =
          !onAt(t) ||
          !onAt((f - 1) / PLAYER_HZ) ||
          periodStarts.some(({ t0 }) => t >= t0 - 0.5 && t < t0 + PERIOD_PAD + 1);
        if (!freeMove) {
          const dx = track.x[f] - lx;
          const dz = track.z[f] - lz;
          const d = Math.hypot(dx, dz);
          if (d > MAXD) {
            track.x[f] = lx + (dx / d) * MAXD;
            track.z[f] = lz + (dz / d) * MAXD;
          }
        }
        lx = track.x[f];
        lz = track.z[f];
      }
    }

    let heading = p.letter === 'H' ? 0 : Math.PI;
    const MAXTURN = 5.5 / PLAYER_HZ; // rad per frame — nobody whips around instantly
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
      // moving fast → face travel; slow → square up to the ball (jockeying),
      // the way real off-ball players track the game
      let target = heading;
      const b = ballAt(t);
      const bdx = b.x - track.x[f];
      const bdz = b.z - track.z[f];
      const ballNear = Math.hypot(bdx, bdz) < 1.5; // carrier: keep travel heading
      if (sp > 2.2) {
        target = Math.atan2(dx, dz);
      } else if (sp > 0.7) {
        const vh = Math.atan2(dx, dz);
        target = ballNear ? vh : lerpAngle(Math.atan2(bdx, bdz), vh, clamp((sp - 0.7) / 1.5, 0, 1));
      } else if (!ballNear) {
        target = Math.atan2(bdx, bdz);
      }
      let dAng = (target - heading) % TAU;
      if (dAng > Math.PI) dAng -= TAU;
      else if (dAng < -Math.PI) dAng += TAU;
      heading += clamp(dAng, -MAXTURN, MAXTURN);
      track.heading[f] = heading;
      track.action[f] = actionFromSpeed(sp);
    }
  }

  // ---- glue the possessed ball to its carrier ---------------------------------
  // Wherever the possession model says someone has the ball (and it isn't
  // mid-flight), place it at the carrier's feet — sampled from their FINAL
  // smoothed track, so the two can never disagree — pushed a touch ahead along
  // their facing with a distance-driven rhythm so dribbles read as pushes, not
  // a ball welded to the shin. A rate-limited blend and a disagreement guard
  // keep handoffs, deflections and data noise from popping.
  {
    const sTmp: Sample = { x: 0, y: 0, z: 0, speed: 0, heading: 0, action: 0 };
    let si = 0;
    let fi = 0;
    let attach = 0; // rate-limited blend weight toward the carrier's foot
    let lastFx = 0;
    let lastFz = 0;
    let touchDist = 0; // carrier metres travelled this span — drives touch rhythm
    let lastSpan: PossSpan | null = null;
    let pcx = 0;
    let pcz = 0;

    for (let f = 0; f < ballFrames; f++) {
      const t = f / BALL_HZ;
      while (si < possSpans.length && possSpans[si].t1 < t) si++;
      while (fi < flights.length && flights[fi][1] < t) fi++;
      const span = si < possSpans.length && t >= possSpans[si].t0 ? possSpans[si] : null;
      const inFlight = fi < flights.length && t >= flights[fi][0] && t <= flights[fi][1];

      let target = 0;
      const tr = span && !inFlight ? tracks[span.eid] : undefined;
      if (span && tr) {
        sampleTrack(tr, t, sTmp);
        if (span !== lastSpan) touchDist = 0;
        else touchDist += Math.hypot(sTmp.x - pcx, sTmp.z - pcz);
        lastSpan = span;
        pcx = sTmp.x;
        pcz = sTmp.z;
        // a touch every ~3m: ball pushed ahead, carrier runs onto it
        const pulse = 0.45 + 0.55 * Math.max(0, Math.sin((touchDist / 3) * TAU));
        const lead = 0.3 + clamp(sTmp.speed * 0.17, 0, 1.0) * pulse;
        const fx = sTmp.x + Math.sin(sTmp.heading) * lead;
        const fz = sTmp.z + Math.cos(sTmp.heading) * lead;
        const dev = Math.hypot(fx - ballTrack.x[f], fz - ballTrack.z[f]);
        const onPitch = Math.abs(sTmp.x) < HALF_L && Math.abs(sTmp.z) < HALF_W;
        // engage only when carrier and waypoint-ball agree; once engaged, stay
        // sticky (ball-at-foot IS the truth then) unless they truly desync
        const sticky = attach > 0.9;
        if (onPitch && (sticky ? dev < 12 : dev < 5 && ballTrack.y[f] < 1.4)) {
          target = 1;
          lastFx = fx;
          lastFz = fz;
        }
      } else {
        lastSpan = null;
      }
      // ramp on gently (~0.25s), release fast (~0.15s, masked by the kick).
      // While releasing, keep blending toward the last foot spot so flights
      // visually originate at the boot rather than popping to the waypoint.
      attach += clamp(target - attach, -6.5 / BALL_HZ, 4 / BALL_HZ);
      if (attach > 0.002) {
        ballTrack.x[f] = lerp(ballTrack.x[f], lastFx, attach);
        ballTrack.z[f] = lerp(ballTrack.z[f], lastFz, attach);
        ballTrack.y[f] = Math.max(BALL_R, lerp(ballTrack.y[f], BALL_R, attach));
      }
    }
    // the attach/release blends can briefly imply superball speeds when they
    // let go across a distance — cap to the waypoint-repair ceiling and let
    // the ball catch up over a few frames instead of streaking
    {
      const MAXD = 45 / BALL_HZ;
      let lx = ballTrack.x[0];
      let lz = ballTrack.z[0];
      for (let f = 1; f < ballFrames; f++) {
        const dx = ballTrack.x[f] - lx;
        const dz = ballTrack.z[f] - lz;
        const d = Math.hypot(dx, dz);
        if (d > MAXD) {
          ballTrack.x[f] = lx + (dx / d) * MAXD;
          ballTrack.z[f] = lz + (dz / d) * MAXD;
        }
        lx = ballTrack.x[f];
        lz = ballTrack.z[f];
      }
    }
    deriveBall();
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
  const era = eraOf(meta.d);
  // pre-VHS matches render in daylight regardless of listed kickoff hour —
  // floodlit night football is an anachronism on newsreel/16mm stock, and the
  // era grade is built for sunlit film
  const mood =
    era === 'archive' || era === 'technicolor'
      ? 'day'
      : koHour >= 17 || koHour < 6
        ? 'night'
        : koHour >= 16
          ? 'dusk'
          : 'day';

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
      era,
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
