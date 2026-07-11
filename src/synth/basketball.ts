/**
 * Basketball match synthesis (5v5).
 *
 * Half-court sets, dribble-drives, ball-swings, jump shots and dunks with a
 * genuinely 3D ball (bouncing dribble, parabolic shot arcs to a 3.05m rim),
 * makes/misses, rebounds and transition. Produces the same MatchIR shape as
 * every other sport.
 */

import { Action, Entity, KitSpec, MatchEvent, MatchIR, ScoreSnapshot, TeamInfo, Track } from '@/ir/types';
import { createTrack } from '@/ir/sampler';
import { Rng } from '@/lib/rng';

const CL = 28.65; // court length (x)
const CW = 15.24; // court width (z)
const HALF_CL = CL / 2;
const HALF_CW = CW / 2;
const RIM_INSET = 1.6;
const RIM_X = HALF_CL - RIM_INSET; // +x basket
const RIM_Y = 3.05;
const THREE_DIST = 7.24;
const BALL_R = 0.12;
const HZ = 25;

interface Spot {
  xn: number;
  zn: number;
  role: 'G' | 'F' | 'C';
}

// Half-court offensive spots in attacking-normalized frame (+1 = attacking rim).
const SET: Spot[] = [
  { xn: 0.28, zn: 0.0, role: 'G' }, // point
  { xn: 0.5, zn: -0.72, role: 'G' }, // wing
  { xn: 0.5, zn: 0.72, role: 'F' }, // wing
  { xn: 0.74, zn: -0.4, role: 'F' }, // short corner
  { xn: 0.78, zn: 0.28, role: 'C' }, // post
];

const SPEED = { sprint: 6.6, run: 5.0, jog: 3.2, walk: 1.6 };
const ACCEL = 11;

interface SimP {
  id: string;
  teamIndex: 0 | 1;
  number: number;
  role: 'G' | 'F' | 'C';
  spot: Spot;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  track: Track;
}

export interface BasketballSynthOptions {
  id: string;
  seed?: number | string;
  duration?: number;
  title?: string;
  competition?: string;
  venue?: string;
  home: { name: string; short: string; kit: KitSpec };
  away: { name: string; short: string; kit: KitSpec };
  videos?: MatchIR['meta']['videos'];
  fidelity?: MatchIR['fidelity'];
}

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function actionFromSpeed(s: number): Action {
  if (s < 0.35) return Action.Idle;
  if (s < 1.9) return Action.Walk;
  if (s < 3.6) return Action.Jog;
  if (s < 5.6) return Action.Run;
  return Action.Sprint;
}

export function synthesizeBasketballMatch(opts: BasketballSynthOptions): MatchIR {
  const duration = opts.duration ?? 240;
  const frames = Math.round(duration * HZ) + 1;
  const rng = new Rng(opts.seed ?? opts.id);
  const dt = 1 / HZ;

  const teamInfos: TeamInfo[] = [
    { id: 'H', name: opts.home.name, short: opts.home.short, kit: opts.home.kit, attackDir: 1 },
    { id: 'A', name: opts.away.name, short: opts.away.short, kit: opts.away.kit, attackDir: -1 },
  ];

  const entities: Entity[] = [{ id: 'ball', role: 'ball' }];
  const tracks: Record<string, Track> = { ball: createTrack(HZ, frames) };
  const numbers = [3, 11, 23, 34, 15];

  const teams = teamInfos.map((info, ti) => {
    const players: SimP[] = SET.map((spot, i) => {
      const id = `${info.id}${i}`;
      const track = createTrack(HZ, frames);
      tracks[id] = track;
      entities.push({ id, role: 'player', team: info.id, number: numbers[i], position: spot.role });
      const dir = info.attackDir;
      return {
        id,
        teamIndex: ti as 0 | 1,
        number: numbers[i],
        role: spot.role,
        spot,
        x: -dir * spot.xn * HALF_CL * 0.6,
        z: spot.zn * HALF_CW * 0.7,
        vx: 0,
        vz: 0,
        heading: dir > 0 ? 0 : Math.PI,
        track,
      };
    });
    return { index: ti as 0 | 1, info, attackDir: info.attackDir, players };
  });

  const allP = [...teams[0].players, ...teams[1].players];
  const ballTrack = tracks.ball;

  const rimX = (teamIndex: number) => teams[teamIndex].attackDir * RIM_X;

  // ball state
  const ball = {
    x: 0,
    z: 0,
    y: 1.0,
    vx: 0,
    vz: 0,
    state: 'controlled' as 'controlled' | 'flight' | 'loose',
    owner: null as SimP | null,
    flight: null as null | {
      sx: number; sz: number; sy: number;
      ex: number; ez: number; ey: number;
      dur: number; elapsed: number; apex: number;
      kind: 'pass' | 'shot'; receiver: SimP | null; shooter: SimP | null;
      make?: boolean; three?: boolean;
    },
    dribblePhase: 0,
  };

  const score: Record<string, number> = { H: 0, A: 0 };
  const events: MatchEvent[] = [];
  const scoreboard: ScoreSnapshot[] = [{ t: 0, home: 0, away: 0 }];
  let possession: 0 | 1 = 0;
  let nextDecisionAt = 1.2;
  let deadUntil = 0;

  // give point guard the ball
  ball.owner = teams[0].players[0];
  ball.state = 'controlled';

  function offSpotWorld(p: SimP): { x: number; z: number } {
    const dir = teams[p.teamIndex].attackDir;
    return { x: dir * p.spot.xn * HALF_CL * 0.82, z: p.spot.zn * HALF_CW * 0.78 };
  }

  function nearest(list: SimP[], x: number, z: number): SimP {
    let best = list[0];
    let bd = Infinity;
    for (const p of list) {
      const d = dist(p.x, p.z, x, z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  function nearestOppDist(p: SimP): number {
    let bd = Infinity;
    for (const o of teams[1 - p.teamIndex].players) bd = Math.min(bd, dist(p.x, p.z, o.x, o.z));
    return bd;
  }

  function decide(t: number) {
    const c = ball.owner!;
    const rx = rimX(c.teamIndex);
    const dRim = dist(c.x, c.z, rx, 0);
    const pressure = nearestOppDist(c);
    const shotClockLow = t - possessionStart > 6.5;

    const shootProb = clamp(0.22 * (7 / Math.max(dRim, 3)) + (shotClockLow ? 0.5 : 0), 0.05, 0.9);
    if (rng.chance(shootProb)) {
      shoot(t, c, dRim);
      return;
    }
    // pass to a teammate (swing)
    const mates = teams[c.teamIndex].players.filter((p) => p !== c);
    const open = mates
      .map((p) => ({ p, o: nearestOppDist(p) }))
      .sort((a, b) => b.o - a.o);
    if (open.length && rng.chance(0.7)) {
      passTo(t, c, open[0].p);
      return;
    }
    nextDecisionAt = t + rng.range(0.5, 1.0);
  }

  let possessionStart = 0;

  function shoot(t: number, c: SimP, dRim: number) {
    const rx = rimX(c.teamIndex);
    const three = dRim > THREE_DIST - 0.3;
    const dunk = dRim < 1.8;
    const makeProb = dunk
      ? 0.9
      : clamp(0.62 * (5.5 / Math.max(dRim, 2.5)) * (nearestOppDist(c) < 1.5 ? 0.65 : 1), 0.2, 0.85);
    const make = rng.chance(makeProb);
    const apex = dunk ? RIM_Y + 0.4 : Math.max(RIM_Y + 1.6, ball.y + 2.4 + dRim * 0.12);
    const ex = make ? rx : rx - teams[c.teamIndex].attackDir * rng.range(0.3, 1.2);
    const ez = make ? 0 : rng.gaussian(0, 1.0);
    const dur = clamp(dRim / 12 + 0.5, 0.5, 1.3);
    ball.flight = {
      sx: ball.x, sz: ball.z, sy: ball.y,
      ex, ez, ey: RIM_Y,
      dur, elapsed: 0, apex,
      kind: 'shot', receiver: null, shooter: c, make, three,
    };
    ball.state = 'flight';
    ball.owner = null;
    events.push({
      t,
      type: dunk ? 'dunk' : 'shot',
      actor: c.id,
      team: teams[c.teamIndex].info.id,
      location: [c.x, c.z],
      target: [ex, ez],
      animIntent: dunk ? 'dunk' : 'jumpshot',
      importance: three ? 0.7 : dunk ? 0.75 : 0.5,
      text: dunk ? `${teams[c.teamIndex].info.short} — thunderous dunk!` : undefined,
    });
    nextDecisionAt = t + dur + 0.3;
  }

  function passTo(t: number, c: SimP, r: SimP) {
    const d = dist(c.x, c.z, r.x, r.z);
    const dur = clamp(d / 14 + 0.12, 0.15, 0.8);
    ball.flight = {
      sx: ball.x, sz: ball.z, sy: ball.y,
      ex: r.x, ez: r.z, ey: 1.1,
      dur, elapsed: 0, apex: 1.5,
      kind: 'pass', receiver: r, shooter: null,
    };
    ball.state = 'flight';
    ball.owner = null;
    events.push({
      t, type: 'pass', actor: c.id, team: teams[c.teamIndex].info.id,
      location: [c.x, c.z], animIntent: 'pass', importance: 0.12,
    });
    nextDecisionAt = t + dur + 0.1;
  }

  function progressBall(t: number) {
    if (ball.state === 'controlled' && ball.owner) {
      const o = ball.owner;
      ball.dribblePhase += dt * 7;
      const fx = Math.sin(o.heading);
      const fz = Math.cos(o.heading);
      ball.x = o.x + fx * 0.4;
      ball.z = o.z + fz * 0.4;
      const moving = Math.hypot(o.vx, o.vz) > 0.5;
      ball.y = moving ? 0.35 + Math.abs(Math.sin(ball.dribblePhase)) * 0.55 : 0.9;
      return;
    }
    if (ball.state === 'flight' && ball.flight) {
      const f = ball.flight;
      f.elapsed += dt;
      const u = clamp(f.elapsed / f.dur, 0, 1);
      ball.x = f.sx + (f.ex - f.sx) * u;
      ball.z = f.sz + (f.ez - f.sz) * u;
      // parabola through apex
      const base = f.sy + (f.ey - f.sy) * u;
      ball.y = base + (f.apex - Math.max(f.sy, f.ey)) * Math.sin(Math.PI * u) * (u < 1 ? 1 : 0);
      if (u >= 1) resolveFlight(t, f);
      return;
    }
    if (ball.state === 'loose') {
      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;
      ball.vx *= Math.exp(-2 * dt);
      ball.vz *= Math.exp(-2 * dt);
      // rebound bounce settle
      ball.y = Math.max(BALL_R, ball.y - dt * 2.5);
    }
  }

  function resolveFlight(t: number, f: NonNullable<typeof ball.flight>) {
    ball.flight = null;
    if (f.kind === 'pass') {
      if (f.receiver) {
        ball.state = 'controlled';
        ball.owner = f.receiver;
      } else {
        ball.state = 'loose';
      }
      return;
    }
    // shot
    const shooter = f.shooter!;
    if (f.make) {
      const pts = f.three ? 3 : 2;
      score[teams[shooter.teamIndex].info.id] += pts;
      scoreboard.push({ t, home: score.H, away: score.A });
      events.push({
        t, type: 'made_shot', actor: shooter.id, team: teams[shooter.teamIndex].info.id,
        location: [f.ex, f.ez], importance: f.three ? 0.75 : 0.55,
        text: `${teams[shooter.teamIndex].info.short} scores ${pts}! ${score.H}-${score.A}`,
      });
      // inbound to other team
      flipPossession(t, (1 - shooter.teamIndex) as 0 | 1, true);
    } else {
      events.push({
        t, type: 'missed_shot', actor: shooter.id, team: teams[shooter.teamIndex].info.id,
        location: [f.ex, f.ez], importance: 0.25,
      });
      // rebound: ball loose near rim
      ball.state = 'loose';
      ball.x = f.ex;
      ball.z = f.ez;
      ball.y = RIM_Y - 0.4;
      ball.vx = rng.gaussian(0, 1.5);
      ball.vz = rng.gaussian(0, 1.5);
      reboundPending = t + 0.5;
    }
  }

  let reboundPending = -1;

  function flipPossession(t: number, team: 0 | 1, afterScore: boolean) {
    possession = team;
    possessionStart = t;
    const inbounder = teams[team].players[0];
    ball.state = 'controlled';
    ball.owner = inbounder;
    // reset to backcourt on made basket
    if (afterScore) {
      const dir = teams[team].attackDir;
      inbounder.x = -dir * (HALF_CL - 2);
      inbounder.z = 0;
    }
    nextDecisionAt = t + 1.4;
  }

  // steering target
  const tgt = { x: 0, z: 0, speed: 0 };

  function computeTarget(p: SimP, t: number) {
    const dir = teams[p.teamIndex].attackDir;
    const hasPoss = possession === p.teamIndex;

    if (ball.owner === p) {
      // drive toward rim or hold at spot
      const rx = rimX(p.teamIndex);
      const dRim = dist(p.x, p.z, rx, 0);
      if (dRim > 6 && rng.float() < 0.02) {
        tgt.x = rx * 0.7;
        tgt.z = 0;
        tgt.speed = SPEED.run;
      } else {
        const w = offSpotWorld(p);
        tgt.x = w.x;
        tgt.z = w.z;
        tgt.speed = SPEED.jog;
      }
      return;
    }

    if (hasPoss) {
      const w = offSpotWorld(p);
      tgt.x = w.x;
      tgt.z = w.z;
      const d = dist(p.x, p.z, w.x, w.z);
      tgt.speed = d > 8 ? SPEED.run : d > 2 ? SPEED.jog : SPEED.walk;
      return;
    }

    // defense: between man and own rim / contest ball
    const ownRimX = -dir * RIM_X;
    const man = nearest(teams[1 - p.teamIndex].players, p.x, p.z);
    const bx = ball.owner ? ball.owner.x : ball.x;
    const bz = ball.owner ? ball.owner.z : ball.z;
    const guardBall = dist(p.x, p.z, bx, bz) < 4.5;
    if (guardBall && ball.owner) {
      tgt.x = ball.owner.x + (ownRimX - ball.owner.x) * 0.14;
      tgt.z = ball.owner.z * 0.85;
      tgt.speed = SPEED.run;
    } else {
      tgt.x = man.x * 0.6 + ownRimX * 0.4;
      tgt.z = man.z * 0.8;
      tgt.speed = SPEED.jog;
    }
  }

  function integrate(p: SimP) {
    let dx = tgt.x - p.x;
    let dz = tgt.z - p.z;
    const dl = Math.hypot(dx, dz);
    let ds = tgt.speed;
    if (dl < 0.3) ds = 0;
    let dvx = dl > 0.001 ? (dx / dl) * ds - p.vx : -p.vx;
    let dvz = dl > 0.001 ? (dz / dl) * ds - p.vz : -p.vz;

    // separation
    for (const q of allP) {
      if (q === p) continue;
      const d = dist(p.x, p.z, q.x, q.z);
      if (d < 1.6 && d > 0.001) {
        const w = (1.6 - d) / 1.6;
        dvx += ((p.x - q.x) / d) * w * 2.5;
        dvz += ((p.z - q.z) / d) * w * 2.5;
      }
    }

    const dvl = Math.hypot(dvx, dvz);
    const maxDV = ACCEL * dt;
    if (dvl > maxDV) {
      dvx = (dvx / dvl) * maxDV;
      dvz = (dvz / dvl) * maxDV;
    }
    p.vx += dvx;
    p.vz += dvz;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > SPEED.sprint) {
      p.vx = (p.vx / sp) * SPEED.sprint;
      p.vz = (p.vz / sp) * SPEED.sprint;
    }
    p.x = clamp(p.x + p.vx * dt, -HALF_CL + 0.4, HALF_CL - 0.4);
    p.z = clamp(p.z + p.vz * dt, -HALF_CW + 0.4, HALF_CW - 0.4);

    const speed = Math.hypot(p.vx, p.vz);
    if (speed > 0.4) {
      // face the rim we attack when on offense, else face the ball
      const face =
        ball.owner === p || possession === p.teamIndex
          ? Math.atan2(rimX(p.teamIndex) - p.x, 0 - p.z)
          : Math.atan2(p.vx, p.vz);
      let d = (face - p.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      p.heading += d * Math.min(1, dt * 8);
    }
  }

  function resolveRebound(t: number) {
    if (reboundPending > 0 && t >= reboundPending) {
      reboundPending = -1;
      const rebounder = nearest(allP, ball.x, ball.z);
      ball.state = 'controlled';
      ball.owner = rebounder;
      const wasOff = possession === rebounder.teamIndex;
      if (!wasOff) {
        possession = rebounder.teamIndex;
        possessionStart = t;
      }
      events.push({
        t, type: 'rebound', actor: rebounder.id, team: teams[rebounder.teamIndex].info.id,
        location: [ball.x, ball.z], importance: 0.2,
      });
      nextDecisionAt = t + 1.0;
    }
  }

  for (let frame = 0; frame < frames; frame++) {
    const t = frame / HZ;

    if (ball.state === 'controlled' && ball.owner && t >= nextDecisionAt && t >= deadUntil) {
      decide(t);
    }
    progressBall(t);
    resolveRebound(t);

    for (const p of allP) {
      computeTarget(p, t);
      integrate(p);
    }
    // re-glue after integration
    if (ball.state === 'controlled' && ball.owner) {
      const o = ball.owner;
      ball.x = o.x + Math.sin(o.heading) * 0.4;
      ball.z = o.z + Math.cos(o.heading) * 0.4;
    }

    for (const p of allP) {
      const tr = p.track;
      tr.x[frame] = p.x;
      tr.y[frame] = 0;
      tr.z[frame] = p.z;
      const sp = Math.hypot(p.vx, p.vz);
      tr.speed[frame] = sp;
      tr.heading[frame] = p.heading;
      tr.action[frame] = actionFromSpeed(sp);
    }
    ballTrack.x[frame] = ball.x;
    ballTrack.y[frame] = ball.y;
    ballTrack.z[frame] = ball.z;
    ballTrack.speed[frame] = Math.hypot(ball.vx, ball.vz);
    ballTrack.heading[frame] = 0;
    ballTrack.action[frame] = 0;
  }

  events.unshift({
    t: 0, type: 'kickoff', team: 'H', location: [0, 0], importance: 0.3,
    text: `Tip-off: ${teams[0].info.name} vs ${teams[1].info.name}.`,
  });

  return {
    id: opts.id,
    sport: 'basketball',
    fidelity: opts.fidelity ?? 'synth',
    meta: {
      title: opts.title ?? `${opts.home.name} vs ${opts.away.name}`,
      competition: opts.competition,
      venue: opts.venue,
      teams: teamInfos,
      score,
      attribution: 'PitchSide synthesis engine',
      videos: opts.videos,
      mood: 'indoor',
    },
    fieldSpec: { type: 'basketball', length: CL, width: CW, goalWidth: 0.45, goalHeight: RIM_Y },
    duration,
    entities,
    tracks,
    events,
    scoreboard,
  };
}
