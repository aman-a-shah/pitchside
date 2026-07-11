/**
 * Tennis match synthesis (singles).
 *
 * A rally simulation: alternating groundstrokes with a genuinely 3D ball that
 * arcs over the net, bounces once in the opponent's court, and is chased down by
 * a moving player — or not (a winner). Serves start each point; simplified
 * game/set scoring drives the HUD. Same MatchIR shape as every other sport.
 */

import { Action, Entity, MatchEvent, MatchIR, ScoreSnapshot, TeamInfo, Track } from '@/ir/types';
import { createTrack } from '@/ir/sampler';
import { Rng } from '@/lib/rng';

const CL = 23.77; // baseline to baseline (x)
const CW = 8.23; // singles width (z)
const HALF_CL = CL / 2;
const HALF_CW = CW / 2;
const BALL_R = 0.033;
const HZ = 25;

const REACH_SPEED = 6.4;
const ACCEL = 12;

interface SimP {
  id: string;
  teamIndex: 0 | 1;
  baselineSign: number; // -1 home, +1 away
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  track: Track;
}

export interface TennisSynthOptions {
  id: string;
  seed?: number | string;
  duration?: number;
  title?: string;
  competition?: string;
  venue?: string;
  surface?: 'clay' | 'grass' | 'hard';
  home: { name: string; short: string; color: string };
  away: { name: string; short: string; color: string };
  videos?: MatchIR['meta']['videos'];
  fidelity?: MatchIR['fidelity'];
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function tennisKit(color: string) {
  return {
    primary: color,
    secondary: '#FFFFFF',
    shorts: '#FFFFFF',
    socks: '#FFFFFF',
    numberColor: '#FFFFFF',
    skin: '#d8a373',
  };
}

export function synthesizeTennisMatch(opts: TennisSynthOptions): MatchIR {
  const duration = opts.duration ?? 200;
  const frames = Math.round(duration * HZ) + 1;
  const rng = new Rng(opts.seed ?? opts.id);
  const dt = 1 / HZ;

  const teamInfos: TeamInfo[] = [
    { id: 'H', name: opts.home.name, short: opts.home.short, kit: tennisKit(opts.home.color), attackDir: 1 },
    { id: 'A', name: opts.away.name, short: opts.away.short, kit: tennisKit(opts.away.color), attackDir: -1 },
  ];

  const entities: Entity[] = [{ id: 'ball', role: 'ball' }];
  const tracks: Record<string, Track> = { ball: createTrack(HZ, frames) };

  const players: SimP[] = teamInfos.map((info, ti) => {
    const id = `${info.id}0`;
    const track = createTrack(HZ, frames);
    tracks[id] = track;
    entities.push({ id, role: 'player', team: info.id, number: 1, position: 'P' });
    const sign = ti === 0 ? -1 : 1;
    return {
      id,
      teamIndex: ti as 0 | 1,
      baselineSign: sign,
      x: sign * (HALF_CL - 0.8),
      z: 0,
      vx: 0,
      vz: 0,
      heading: sign < 0 ? 0 : Math.PI,
      track,
    };
  });

  const ballTrack = tracks.ball;

  // ball / rally state
  const ball = {
    x: 0,
    z: 0,
    y: 1.0,
    prevContactSign: 1,
  };

  interface Shot {
    sx: number; sz: number; sy: number;
    bx: number; bz: number; // bounce point
    ex: number; ez: number; ey: number; // opponent contact point
    dur: number; elapsed: number; ub: number; // fraction at bounce
    apex1: number; apex2: number;
    hitter: SimP; receiver: SimP; reachable: boolean;
    fault: 'net' | 'out' | null;
  }
  let shot: Shot | null = null;

  const score: Record<string, number> = { H: 0, A: 0 }; // games
  const gamePoints = [0, 0]; // points within current game
  const setsWon = [0, 0];
  const events: MatchEvent[] = [];
  const scoreboard: ScoreSnapshot[] = [{ t: 0, home: 0, away: 0, detail: '0-0 · Sets 0-0' }];

  const ptNames = ['0', '15', '30', '40'];
  function ptLabel(): string {
    const a = gamePoints[0];
    const b = gamePoints[1];
    if (a >= 3 && b >= 3) {
      if (a === b) return 'Deuce';
      return a > b ? 'Ad-40' : '40-Ad';
    }
    return `${ptNames[Math.min(a, 3)]}-${ptNames[Math.min(b, 3)]}`;
  }

  let server: 0 | 1 = 0;
  let phase: 'serve' | 'rally' | 'dead' = 'serve';
  let phaseUntil = 0.8;

  function opp(p: SimP): SimP {
    return players[1 - p.teamIndex];
  }

  function planShot(t: number, hitter: SimP, isServe: boolean) {
    const receiver = opp(hitter);
    const dirToOpp = -hitter.baselineSign; // sign of opponent side

    // decide error first so an 'out' shot can actually be aimed past the lines
    let fault: Shot['fault'] = null;
    const errP = isServe ? 0.06 : 0.09;
    if (rng.chance(errP)) fault = rng.chance(0.5) ? 'net' : 'out';
    const longOut = fault === 'out';

    // target depth: deep in opponent court, occasionally short; 'out' lands past the baseline
    const depthFrac = longOut
      ? rng.range(1.04, 1.14)
      : isServe
      ? rng.range(0.35, 0.55)
      : rng.range(0.55, 0.95);
    const ex = dirToOpp * HALF_CL * depthFrac;
    // lateral placement: cross-court / down-the-line; 'out' sometimes sails wide
    let ez = clamp(rng.gaussian(0, 1) * HALF_CW * 0.7, -HALF_CW + 0.3, HALF_CW - 0.3);
    if (longOut && rng.chance(0.5)) ez = (ez >= 0 ? 1 : -1) * (HALF_CW + rng.range(0.4, 1.5));
    // bounce lands ~62% of the way to contact
    const ub = 0.62;
    const bx = hitter.x + (ex - hitter.x) * ub;
    const bz = hitter.z + (ez - hitter.z) * ub;

    const d = Math.hypot(ex - hitter.x, ez - hitter.z);
    const dur = clamp(d / (isServe ? 22 : 17), 0.45, 1.4);

    // can the receiver reach the contact point in time?
    const recDist = Math.hypot(ex - receiver.x, ez - receiver.z);
    const reachable = fault ? false : recDist <= REACH_SPEED * dur * 1.15;

    const contactH = isServe ? 1.4 : 0.85;
    shot = {
      sx: hitter.x, sz: hitter.z, sy: ball.y,
      bx, bz,
      ex, ez, ey: reachable ? contactH : 0.2,
      dur, elapsed: 0, ub,
      apex1: 1.7 + d * 0.02,
      apex2: 1.2,
      hitter, receiver, reachable, fault,
    };
    phase = 'rally';

    // Only serves get a timeline event; individual rally strokes would flood it.
    // (The renderer still triggers a swing pose from the ball changing direction.)
    if (isServe) {
      events.push({
        t,
        type: 'serve',
        actor: hitter.id,
        team: teamInfos[hitter.teamIndex].id,
        location: [hitter.x, hitter.z],
        animIntent: 'serve',
        importance: 0.15,
      });
    }
  }

  function progressShot(t: number) {
    if (!shot) return;
    const s = shot;
    s.elapsed += dt;
    const u = clamp(s.elapsed / s.dur, 0, 1);

    if (s.fault === 'net') {
      // ball travels to net then drops
      const un = 0.5;
      if (u < un) {
        ball.x = s.sx + (0 - s.sx) * (u / un);
        ball.z = s.sz + (0 - s.sz) * (u / un);
        ball.y = s.sy + s.apex1 * Math.sin(Math.PI * (u / un)) - u * 0.2;
      } else {
        ball.x = 0;
        ball.z = s.sz + (0 - s.sz);
        ball.y = Math.max(BALL_R, 0.9 - (u - un) * 2);
      }
      if (u >= 1) pointOver(t, s.receiver, 'net');
      return;
    }

    // normal / out flight: two-hump path through bounce
    if (u < s.ub) {
      const uu = u / s.ub;
      ball.x = s.sx + (s.bx - s.sx) * uu;
      ball.z = s.sz + (s.bz - s.sz) * uu;
      ball.y = s.sy + s.apex1 * Math.sin(Math.PI * uu) - uu * s.sy;
      if (ball.y < BALL_R) ball.y = BALL_R;
    } else {
      const uu = (u - s.ub) / (1 - s.ub);
      ball.x = s.bx + (s.ex - s.bx) * uu;
      ball.z = s.bz + (s.ez - s.bz) * uu;
      ball.y = BALL_R + s.apex2 * Math.sin(Math.PI * uu) + (s.ey - BALL_R) * uu;
    }

    if (u >= 1) {
      if (s.fault === 'out') {
        pointOver(t, s.receiver, 'out');
      } else if (!s.reachable) {
        pointOver(t, s.hitter, 'winner');
      } else {
        // receiver hits it back
        ball.x = s.ex;
        ball.z = s.ez;
        ball.y = s.ey;
        ball.prevContactSign = -s.hitter.baselineSign;
        planShot(t, s.receiver, false);
      }
    }
  }

  function pointOver(t: number, winner: SimP, how: 'winner' | 'net' | 'out') {
    shot = null;
    phase = 'dead';
    phaseUntil = t + 1.6;
    awardPoint(t, winner.teamIndex);
    const wid = teamInfos[winner.teamIndex].id;
    const text =
      how === 'winner'
        ? `Clean winner — point ${teamInfos[winner.teamIndex].short}.`
        : how === 'net'
        ? `Into the net. Point ${teamInfos[winner.teamIndex].short}.`
        : `Long! Point ${teamInfos[winner.teamIndex].short}.`;
    events.push({
      t,
      type: how === 'winner' ? 'winner' : 'point',
      team: wid,
      location: [ball.x, ball.z],
      importance: how === 'winner' ? 0.5 : 0.3,
      text,
    });
  }

  function awardPoint(t: number, team: 0 | 1) {
    gamePoints[team]++;
    const a = gamePoints[team];
    const b = gamePoints[1 - team];
    let gameEnded = false;
    if (a >= 4 && a - b >= 2) {
      // game won
      score[teamInfos[team].id]++;
      gamePoints[0] = 0;
      gamePoints[1] = 0;
      server = (1 - server) as 0 | 1;
      const g = score[teamInfos[team].id];
      // set won at 6 games with margin 2
      if (g >= 6 && g - score[teamInfos[1 - team].id] >= 2) {
        setsWon[team]++;
        score.H = 0;
        score.A = 0;
      }
      events.push({
        t,
        type: 'point',
        team: teamInfos[team].id,
        importance: 0.4,
        text: `Game, ${teamInfos[team].short}. (${setsWon[0]}-${setsWon[1]} sets)`,
      });
      gameEnded = true;
    }
    scoreboard.push({
      t,
      home: score.H,
      away: score.A,
      detail: gameEnded
        ? `Games · Sets ${setsWon[0]}-${setsWon[1]}`
        : `${ptLabel()} · Sets ${setsWon[0]}-${setsWon[1]}`,
    });
  }

  function computeTarget(p: SimP): { x: number; z: number; speed: number } {
    // If a shot is heading to this player, move to its contact point.
    if (shot && shot.reachable && shot.receiver === p) {
      return { x: shot.ex, z: shot.ez, speed: REACH_SPEED };
    }
    // recovery: return toward center of own baseline
    const homeX = p.baselineSign * (HALF_CL - 0.7);
    return { x: homeX, z: p.z * 0.5, speed: 3.4 };
  }

  function integrate(p: SimP) {
    const tg = computeTarget(p);
    let dx = tg.x - p.x;
    let dz = tg.z - p.z;
    const dl = Math.hypot(dx, dz);
    let ds = tg.speed;
    if (dl < 0.15) ds = 0;
    let dvx = dl > 0.001 ? (dx / dl) * ds - p.vx : -p.vx;
    let dvz = dl > 0.001 ? (dz / dl) * ds - p.vz : -p.vz;
    const dvl = Math.hypot(dvx, dvz);
    const maxDV = ACCEL * dt;
    if (dvl > maxDV) {
      dvx = (dvx / dvl) * maxDV;
      dvz = (dvz / dvl) * maxDV;
    }
    p.vx += dvx;
    p.vz += dvz;
    // clamp to own half (can't cross the net far)
    p.x = clamp(p.x + p.vx * dt, p.baselineSign < 0 ? -HALF_CL - 2 : 0.5, p.baselineSign < 0 ? -0.5 : HALF_CL + 2);
    p.z = clamp(p.z + p.vz * dt, -HALF_CW - 2, HALF_CW + 2);
    // face the net / ball
    const face = Math.atan2(ball.x - p.x, ball.z - p.z);
    let d = (face - p.heading) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    p.heading += d * Math.min(1, dt * 6);
  }

  // serve position at match start
  function beginServe(t: number) {
    const sv = players[server];
    sv.x = sv.baselineSign * (HALF_CL - 0.3);
    sv.z = sv.baselineSign * -1.5; // deuce side-ish
    ball.x = sv.x;
    ball.z = sv.z;
    ball.y = 1.4;
    phase = 'serve';
    phaseUntil = t + 0.7;
  }

  beginServe(0);

  for (let frame = 0; frame < frames; frame++) {
    const t = frame / HZ;

    const ph = phase as string;
    if (ph === 'serve' && t >= phaseUntil) {
      planShot(t, players[server], true);
    } else if (ph === 'rally') {
      progressShot(t);
    } else if (ph === 'dead' && t >= phaseUntil) {
      beginServe(t);
    }

    for (const p of players) integrate(p);

    for (const p of players) {
      const tr = p.track;
      tr.x[frame] = p.x;
      tr.y[frame] = 0;
      tr.z[frame] = p.z;
      const sp = Math.hypot(p.vx, p.vz);
      tr.speed[frame] = sp;
      tr.heading[frame] = p.heading;
      tr.action[frame] = sp < 0.35 ? Action.Idle : sp < 2.2 ? Action.Jog : Action.Run;
    }
    ballTrack.x[frame] = ball.x;
    ballTrack.y[frame] = ball.y;
    ballTrack.z[frame] = ball.z;
    ballTrack.speed[frame] = 0;
    ballTrack.heading[frame] = 0;
    ballTrack.action[frame] = 0;
  }

  events.unshift({
    t: 0,
    type: 'kickoff',
    team: 'H',
    location: [0, 0],
    importance: 0.3,
    text: `${opts.home.name} to serve.`,
  });

  return {
    id: opts.id,
    sport: 'tennis',
    fidelity: opts.fidelity ?? 'synth',
    meta: {
      title: opts.title ?? `${opts.home.name} vs ${opts.away.name}`,
      competition: opts.competition,
      venue: opts.venue,
      teams: teamInfos,
      score,
      attribution: 'PitchSide synthesis engine',
      videos: opts.videos,
      mood: 'day',
    },
    fieldSpec: { type: 'tennis', length: CL, width: CW, surface: opts.surface ?? 'clay' },
    duration,
    entities,
    tracks,
    events,
    scoreboard,
  };
}
