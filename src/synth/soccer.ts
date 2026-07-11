/**
 * Soccer match synthesis engine.
 *
 * This is the heart of PitchSide's "Tier-2 synthesis": it manufactures a full,
 * continuous, believable 11v11 match — formation-based team shape, pressing,
 * man-marking, ball-carrier decision-making (pass / shoot / dribble), planned
 * ball trajectories, tackles, goals and restarts — and bakes it all into dense
 * per-entity tracks + a discrete event stream, i.e. a `MatchIR`.
 *
 * The exact same output shape is what a real-tracking ingest (Metrica/PFF) would
 * produce, so the renderer is identical for real and synthesized matches.
 */

import {
  Action,
  Entity,
  FieldPosition,
  KitSpec,
  MatchEvent,
  MatchIR,
  ScoreSnapshot,
  TeamInfo,
  Track,
} from '@/ir/types';
import { createTrack } from '@/ir/sampler';
import { Rng } from '@/lib/rng';

// ------------------------------- field constants -----------------------------

const L = 105; // length along x
const W = 68; // width along z
const HALF_L = L / 2;
const HALF_W = W / 2;
const GOAL_HALF_W = 3.66; // 7.32m goal
const GOAL_H = 2.44;
const BALL_R = 0.11;

const HZ = 25; // simulation + storage rate

// ------------------------------- formations ----------------------------------

interface Slot {
  xn: number; // -1 = own goal, +1 = opponent goal
  zn: number; // -1..+1 across width
  role: FieldPosition;
}

const FORMATIONS: Record<string, Slot[]> = {
  '4-3-3': [
    { xn: -0.92, zn: 0.0, role: 'GK' },
    { xn: -0.55, zn: -0.66, role: 'DEF' },
    { xn: -0.6, zn: -0.24, role: 'DEF' },
    { xn: -0.6, zn: 0.24, role: 'DEF' },
    { xn: -0.55, zn: 0.66, role: 'DEF' },
    { xn: -0.12, zn: -0.44, role: 'MID' },
    { xn: -0.2, zn: 0.0, role: 'MID' },
    { xn: -0.12, zn: 0.44, role: 'MID' },
    { xn: 0.38, zn: -0.6, role: 'FWD' },
    { xn: 0.5, zn: 0.0, role: 'FWD' },
    { xn: 0.38, zn: 0.6, role: 'FWD' },
  ],
  '4-4-2': [
    { xn: -0.92, zn: 0.0, role: 'GK' },
    { xn: -0.58, zn: -0.66, role: 'DEF' },
    { xn: -0.62, zn: -0.24, role: 'DEF' },
    { xn: -0.62, zn: 0.24, role: 'DEF' },
    { xn: -0.58, zn: 0.66, role: 'DEF' },
    { xn: -0.05, zn: -0.66, role: 'MID' },
    { xn: -0.12, zn: -0.22, role: 'MID' },
    { xn: -0.12, zn: 0.22, role: 'MID' },
    { xn: -0.05, zn: 0.66, role: 'MID' },
    { xn: 0.42, zn: -0.26, role: 'FWD' },
    { xn: 0.42, zn: 0.26, role: 'FWD' },
  ],
};

// ------------------------------- movement model ------------------------------

const SPEED = {
  sprint: 7.8,
  run: 6.0,
  jog: 3.6,
  walk: 1.7,
  gkMax: 5.6,
};
const ACCEL = 9.5; // m/s^2 steering cap
const CONTROL_RADIUS = 1.0; // gain a loose ball within this range
const TACKLE_RADIUS = 1.3;
const PASS_SPEED_GROUND = 15;
const PASS_SPEED_LOFT = 19;
const SHOT_SPEED = 27;

// ------------------------------- sim types -----------------------------------

interface SimPlayer {
  id: string;
  teamIndex: 0 | 1;
  number: number;
  name: string;
  role: FieldPosition;
  slot: Slot;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  track: Track;
}

type BallState = 'controlled' | 'flight' | 'loose';

interface Flight {
  sx: number;
  sz: number;
  sy: number;
  ex: number;
  ez: number;
  ey: number;
  dur: number;
  elapsed: number;
  arc: number;
  kind: 'pass' | 'shot' | 'goalkick';
  receiver: SimPlayer | null;
  shooter: SimPlayer | null;
  outcome?: 'goal' | 'save' | 'miss';
}

interface SimTeam {
  index: 0 | 1;
  info: TeamInfo;
  attackDir: 1 | -1;
  players: SimPlayer[];
}

// ------------------------------- helpers -------------------------------------

const dist = (ax: number, az: number, bx: number, bz: number) =>
  Math.hypot(ax - bx, az - bz);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function actionFromSpeed(s: number): Action {
  if (s < 0.35) return Action.Idle;
  if (s < 1.9) return Action.Walk;
  if (s < 3.9) return Action.Jog;
  if (s < 6.3) return Action.Run;
  return Action.Sprint;
}

function slotWorld(p: SimPlayer, dir: number): { x: number; z: number } {
  return { x: dir * p.slot.xn * HALF_L * 0.9, z: p.slot.zn * HALF_W * 0.8 };
}

// ------------------------------- roster --------------------------------------

const SURNAMES = [
  'Silva', 'Rossi', 'Müller', 'Sato', 'Kim', 'Dubois', 'Novak', 'Haaland',
  'Costa', 'Kroos', 'Vidal', 'Mendes', 'Okafor', 'Ferreira', 'Larsson',
  'Ibrahim', 'Popov', 'Andersen', 'Marchetti', 'Bianchi', 'Owusu', 'Nakamura',
];

// ------------------------------- main entry ----------------------------------

export interface SoccerSynthOptions {
  id: string;
  seed?: number | string;
  duration?: number; // seconds of continuous play
  title?: string;
  competition?: string;
  venue?: string;
  mood?: 'night' | 'day' | 'dusk';
  home: { name: string; short: string; kit: KitSpec; formation?: string };
  away: { name: string; short: string; kit: KitSpec; formation?: string };
  starName?: string; // optional name for home #10
  videos?: MatchIR['meta']['videos'];
  fidelity?: MatchIR['fidelity'];
}

export function synthesizeSoccerMatch(opts: SoccerSynthOptions): MatchIR {
  const duration = opts.duration ?? 300;
  const frames = Math.round(duration * HZ) + 1;
  const rng = new Rng(opts.seed ?? opts.id);

  const teamInfos: TeamInfo[] = [
    {
      id: 'H',
      name: opts.home.name,
      short: opts.home.short,
      formation: opts.home.formation ?? '4-3-3',
      kit: opts.home.kit,
      attackDir: 1,
    },
    {
      id: 'A',
      name: opts.away.name,
      short: opts.away.short,
      formation: opts.away.formation ?? '4-3-3',
      kit: opts.away.kit,
      attackDir: -1,
    },
  ];

  const entities: Entity[] = [{ id: 'ball', role: 'ball' }];
  const tracks: Record<string, Track> = {
    ball: createTrack(HZ, frames),
  };

  const teams: SimTeam[] = teamInfos.map((info, ti) => {
    const formation = FORMATIONS[info.formation!] ?? FORMATIONS['4-3-3'];
    const numbers = [1, 2, 3, 4, 5, 6, 8, 7, 9, 10, 11];
    const players: SimPlayer[] = formation.map((slot, i) => {
      const id = `${info.id}${i}`;
      const number = numbers[i] ?? i + 1;
      const isStar = ti === 0 && number === 10 && opts.starName;
      const name = isStar
        ? opts.starName!
        : `${rng.pick(SURNAMES)}`;
      const track = createTrack(HZ, frames);
      tracks[id] = track;
      entities.push({
        id,
        role: 'player',
        team: info.id,
        name,
        number,
        position: slot.role,
      });
      const w = { x: (info.attackDir as number) * slot.xn * HALF_L * 0.9, z: slot.zn * HALF_W * 0.8 };
      return {
        id,
        teamIndex: ti as 0 | 1,
        number,
        name,
        role: slot.role,
        slot,
        x: w.x,
        z: w.z,
        vx: 0,
        vz: 0,
        heading: info.attackDir > 0 ? 0 : Math.PI,
        track,
      };
    });
    return { index: ti as 0 | 1, info, attackDir: info.attackDir, players };
  });

  const allPlayers = [...teams[0].players, ...teams[1].players];
  const ballTrack = tracks.ball;

  // -------------------------- simulation state -------------------------------

  const ball = {
    x: 0,
    z: 0,
    y: BALL_R,
    vx: 0,
    vz: 0,
    state: 'loose' as BallState,
    owner: null as SimPlayer | null,
    flight: null as Flight | null,
    lastTouchTeam: -1 as number,
    looseCooldown: 0,
  };

  const score: Record<string, number> = { H: 0, A: 0 };
  const events: MatchEvent[] = [];
  const scoreboard: ScoreSnapshot[] = [{ t: 0, home: 0, away: 0 }];

  let phase: 'play' | 'celebration' = 'play';
  let resetAt = 0;
  let concedingTeam: 0 | 1 = 1;
  let scorer: SimPlayer | null = null;
  let nextDecisionAt = 0.6;
  const dt = 1 / HZ;

  // Kick things off: home team in possession at center.
  kickoff(0);

  function kickoff(possTeam: 0 | 1) {
    for (const tm of teams) {
      for (const p of tm.players) {
        const w = slotWorld(p, tm.attackDir);
        // team out of possession sits slightly deeper at kickoff
        p.x = w.x + (tm.index === possTeam ? 3 * tm.attackDir : -1 * tm.attackDir);
        p.z = w.z;
        p.vx = 0;
        p.vz = 0;
        p.heading = tm.attackDir > 0 ? 0 : Math.PI;
      }
    }
    ball.x = 0;
    ball.z = 0;
    ball.y = BALL_R;
    ball.vx = 0;
    ball.vz = 0;
    ball.state = 'loose';
    ball.owner = null;
    ball.flight = null;
    ball.looseCooldown = 0.15;
    ball.lastTouchTeam = possTeam;
    // nudge a center player to collect
  }

  // -------------------------- ball trajectory --------------------------------

  function progressBall(t: number) {
    if (ball.looseCooldown > 0) ball.looseCooldown -= dt;

    if (ball.state === 'controlled' && ball.owner) {
      const o = ball.owner;
      const fx = Math.sin(o.heading);
      const fz = Math.cos(o.heading);
      ball.x = o.x + fx * 0.75;
      ball.z = o.z + fz * 0.75;
      ball.y = BALL_R;
      ball.vx = o.vx;
      ball.vz = o.vz;
      return;
    }

    if (ball.state === 'flight' && ball.flight) {
      const f = ball.flight;
      f.elapsed += dt;
      const u = clamp(f.elapsed / f.dur, 0, 1);
      // ease the horizontal travel slightly for pass weight
      const ux = f.kind === 'shot' ? u : u * (2 - u); // ease-out for passes
      ball.x = f.sx + (f.ex - f.sx) * ux;
      ball.z = f.sz + (f.ez - f.sz) * ux;
      // parabolic arc for height
      ball.y = f.sy + (f.ey - f.sy) * u + f.arc * Math.sin(Math.PI * u);
      if (ball.y < BALL_R) ball.y = BALL_R;
      if (u >= 1) resolveFlight(t, f);
      return;
    }

    if (ball.state === 'loose') {
      // simple rolling friction
      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;
      ball.y = BALL_R;
      const fr = Math.exp(-1.6 * dt);
      ball.vx *= fr;
      ball.vz *= fr;
      // out of bounds → throw-in / restart
      if (Math.abs(ball.z) > HALF_W || Math.abs(ball.x) > HALF_L) {
        restartFromOut(t);
      }
    }
  }

  function resolveFlight(t: number, f: Flight) {
    ball.flight = null;
    if (f.kind === 'shot') {
      if (f.outcome === 'goal') {
        const tm = f.shooter!;
        score[teams[tm.teamIndex].info.id]++;
        scoreboard.push({ t, home: score.H, away: score.A });
        scorer = f.shooter;
        concedingTeam = (1 - tm.teamIndex) as 0 | 1;
        events.push({
          t,
          type: 'goal',
          actor: f.shooter!.id,
          team: teams[tm.teamIndex].info.id,
          location: [ball.x, ball.z],
          animIntent: 'celebration',
          importance: 1,
          text: `GOAL! ${teams[tm.teamIndex].info.short} — ${f.shooter!.name} finishes it off.`,
        });
        phase = 'celebration';
        resetAt = t + 4.5;
        ball.state = 'loose';
        ball.owner = null;
        ball.vx = 0;
        ball.vz = 0;
      } else if (f.outcome === 'save') {
        const gk = keeperOf(1 - f.shooter!.teamIndex);
        ball.state = 'controlled';
        ball.owner = gk;
        ball.lastTouchTeam = gk.teamIndex;
        events.push({
          t,
          type: 'save',
          actor: gk.id,
          team: teams[gk.teamIndex].info.id,
          location: [ball.x, ball.z],
          animIntent: 'save',
          importance: 0.7,
          text: `Great save by ${gk.name}!`,
        });
        nextDecisionAt = t + 1.2;
      } else {
        // miss → goal kick to defending team
        restartGoalKick(t, (1 - f.shooter!.teamIndex) as 0 | 1);
      }
    } else if (f.kind === 'pass' || f.kind === 'goalkick') {
      const r = f.receiver;
      if (r && dist(r.x, r.z, ball.x, ball.z) < CONTROL_RADIUS * 2.2) {
        ball.state = 'controlled';
        ball.owner = r;
        ball.lastTouchTeam = r.teamIndex;
        nextDecisionAt = t + rng.range(0.5, 1.1);
      } else {
        ball.state = 'loose';
        ball.owner = null;
        ball.looseCooldown = 0.1;
      }
    }
  }

  function keeperOf(teamIndex: number): SimPlayer {
    return teams[teamIndex].players.find((p) => p.role === 'GK')!;
  }

  function restartGoalKick(t: number, teamIndex: 0 | 1) {
    const gk = keeperOf(teamIndex);
    ball.state = 'controlled';
    ball.owner = gk;
    ball.x = teams[teamIndex].attackDir * -(HALF_L - 5);
    ball.z = 0;
    ball.y = BALL_R;
    ball.lastTouchTeam = teamIndex;
    nextDecisionAt = t + 1.4;
    events.push({
      t,
      type: 'restart',
      team: teams[teamIndex].info.id,
      location: [ball.x, ball.z],
      importance: 0.15,
      text: 'Goal kick.',
    });
  }

  function restartFromOut(t: number) {
    const restartTeam = (1 - Math.max(0, ball.lastTouchTeam)) as 0 | 1;
    // snap ball to nearest in-bounds point
    ball.x = clamp(ball.x, -HALF_L + 1, HALF_L - 1);
    ball.z = clamp(ball.z, -HALF_W + 0.5, HALF_W - 0.5);
    ball.vx = 0;
    ball.vz = 0;
    // give to nearest player of restartTeam
    let best: SimPlayer | null = null;
    let bd = Infinity;
    for (const p of teams[restartTeam].players) {
      const d = dist(p.x, p.z, ball.x, ball.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) {
      ball.state = 'controlled';
      ball.owner = best;
      ball.lastTouchTeam = restartTeam;
      nextDecisionAt = t + 1.0;
    }
    events.push({
      t,
      type: 'out',
      team: teams[restartTeam].info.id,
      location: [ball.x, ball.z],
      importance: 0.1,
      text: 'Out of play.',
    });
  }

  // -------------------------- carrier decisions ------------------------------

  function carrierDecision(t: number) {
    const c = ball.owner!;
    const team = teams[c.teamIndex];
    const dir = team.attackDir;
    const oppGoalX = dir * HALF_L;
    const distGoal = dist(c.x, c.z, oppGoalX, 0);
    const pressure = nearestOpponentDist(c);

    // shoot?
    if (distGoal < 27 && Math.abs(c.z) < 22 && rng.chance(shootProb(distGoal, pressure))) {
      shoot(t, c);
      return;
    }

    // pass?
    const option = findBestPass(c);
    const wantPass = option && (pressure < 4.5 || rng.chance(0.45));
    if (wantPass && option) {
      pass(t, c, option);
      return;
    }

    // otherwise dribble — no discrete event, handled by targets; re-decide soon
    nextDecisionAt = t + rng.range(0.35, 0.7);
  }

  function shootProb(distGoal: number, pressure: number): number {
    const base = clamp(0.55 * (16 / Math.max(distGoal, 8)), 0.06, 0.6);
    const pen = pressure < 2 ? 0.6 : 1;
    return base * pen;
  }

  function shoot(t: number, c: SimPlayer) {
    const dir = teams[c.teamIndex].attackDir;
    const oppGoalX = dir * HALF_L;
    const distGoal = dist(c.x, c.z, oppGoalX, 0);
    const pressure = nearestOpponentDist(c);

    // outcome roll
    const goalChance = clamp(
      0.32 * (16 / Math.max(distGoal, 7)) * (pressure < 2 ? 0.5 : 1),
      0.05,
      0.6
    );
    const r = rng.float();
    let outcome: Flight['outcome'];
    let targetZ: number;
    let targetY: number;
    if (r < goalChance) {
      outcome = 'goal';
      targetZ = clamp(rng.gaussian(0, 2.0), -GOAL_HALF_W + 0.3, GOAL_HALF_W - 0.3);
      targetY = clamp(rng.range(0.3, GOAL_H - 0.4), 0.3, GOAL_H - 0.4);
    } else if (r < goalChance + 0.4) {
      outcome = 'save';
      const gk = keeperOf(1 - c.teamIndex);
      targetZ = clamp((gk.z + rng.gaussian(0, 1.2)) * 0.7, -GOAL_HALF_W, GOAL_HALF_W);
      targetY = clamp(rng.range(0.3, 1.6), 0.2, 1.8);
    } else {
      outcome = 'miss';
      targetZ = GOAL_HALF_W + rng.range(0.6, 3.5) * (rng.chance(0.5) ? 1 : -1);
      targetY = rng.chance(0.4) ? GOAL_H + rng.range(0.4, 2.2) : rng.range(0.2, 1.2);
    }

    const ex = oppGoalX + dir * 0.6; // just past the line
    const ez = targetZ;
    const d = dist(c.x, c.z, ex, ez);
    const dur = clamp(d / SHOT_SPEED, 0.35, 1.4);
    ball.flight = {
      sx: ball.x,
      sz: ball.z,
      sy: ball.y,
      ex,
      ez,
      ey: targetY,
      dur,
      elapsed: 0,
      arc: targetY > 1.5 ? rng.range(0.5, 1.5) : 0.2,
      kind: 'shot',
      receiver: null,
      shooter: c,
      outcome,
    };
    ball.state = 'flight';
    ball.owner = null;
    ball.lastTouchTeam = c.teamIndex;
    events.push({
      t,
      type: 'shot',
      actor: c.id,
      team: teams[c.teamIndex].info.id,
      location: [c.x, c.z],
      target: [ex, ez],
      animIntent: 'shot_finish',
      importance: outcome === 'goal' ? 0.9 : 0.6,
      text:
        outcome === 'miss'
          ? `${c.name} lets fly — just off target.`
          : `${c.name} shoots!`,
    });
    nextDecisionAt = t + dur + 0.4;
  }

  function pass(t: number, c: SimPlayer, r: SimPlayer) {
    const lead = 0.35;
    const ex = r.x + r.vx * lead;
    const ez = r.z + r.vz * lead;
    const d = dist(c.x, c.z, ex, ez);
    const lofted = d > 26 || rng.chance(0.15);
    const speed = lofted ? PASS_SPEED_LOFT : PASS_SPEED_GROUND;
    const dur = clamp(d / speed, 0.2, 1.6);
    ball.flight = {
      sx: ball.x,
      sz: ball.z,
      sy: ball.y,
      ex,
      ez,
      ey: BALL_R,
      dur,
      elapsed: 0,
      arc: lofted ? clamp(d * 0.08, 1, 6) : 0.15,
      kind: 'pass',
      receiver: r,
      shooter: null,
    };
    ball.state = 'flight';
    ball.owner = null;
    ball.lastTouchTeam = c.teamIndex;
    events.push({
      t,
      type: 'pass',
      actor: c.id,
      team: teams[c.teamIndex].info.id,
      location: [c.x, c.z],
      target: [ex, ez],
      animIntent: 'pass',
      importance: 0.2,
    });
    nextDecisionAt = t + dur + 0.15;
  }

  function findBestPass(c: SimPlayer): SimPlayer | null {
    const dir = teams[c.teamIndex].attackDir;
    let best: SimPlayer | null = null;
    let bestScore = 0.4; // threshold
    for (const r of teams[c.teamIndex].players) {
      if (r === c || r.role === 'GK') continue;
      const d = dist(c.x, c.z, r.x, r.z);
      if (d < 4 || d > 40) continue;
      const forward = (r.x - c.x) * dir; // progress toward goal
      const open = nearestOpponentDist(r);
      const score =
        forward * 0.06 + open * 0.12 - Math.max(0, d - 28) * 0.05 + rng.range(0, 0.2);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best;
  }

  function nearestOpponentDist(p: SimPlayer): number {
    let bd = Infinity;
    for (const o of teams[1 - p.teamIndex].players) {
      const d = dist(p.x, p.z, o.x, o.z);
      if (d < bd) bd = d;
    }
    return bd;
  }

  function nearestOpponent(p: SimPlayer): SimPlayer | null {
    let bd = Infinity;
    let best: SimPlayer | null = null;
    for (const o of teams[1 - p.teamIndex].players) {
      const d = dist(p.x, p.z, o.x, o.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  // -------------------------- targets & steering -----------------------------

  const target = { x: 0, z: 0, speed: 0 };

  function computeTarget(p: SimPlayer, t: number) {
    const tm = teams[p.teamIndex];
    const dir = tm.attackDir;

    if (phase === 'celebration') {
      if (p === scorer) {
        // run to nearest corner, arms up (pose handled by renderer)
        target.x = dir * (HALF_L - 6);
        target.z = (p.z >= 0 ? 1 : -1) * (HALF_W - 6);
        target.speed = SPEED.run;
      } else if (scorer && p.teamIndex === scorer.teamIndex) {
        target.x = scorer.x + rng.gaussian(0, 3);
        target.z = scorer.z + rng.gaussian(0, 3);
        target.speed = SPEED.jog;
      } else {
        const w = slotWorld(p, dir);
        target.x = w.x;
        target.z = w.z;
        target.speed = SPEED.walk;
      }
      return;
    }

    // Loose ball: the nearest player sprints straight to it to collect.
    if (ball.state === 'loose' && p === looseChaser) {
      target.x = ball.x;
      target.z = ball.z;
      target.speed = SPEED.sprint;
      return;
    }

    const isPossessing = ball.owner
      ? ball.owner.teamIndex === p.teamIndex
      : ball.lastTouchTeam === p.teamIndex;

    // Keeper
    if (p.role === 'GK') {
      const goalX = -dir * HALF_L;
      target.x = goalX + dir * (1.8 + clamp((ballAdv(p.teamIndex) + HALF_L) / L, 0, 1) * 2);
      target.z = clamp(ball.z * 0.35, -GOAL_HALF_W - 1.5, GOAL_HALF_W + 1.5);
      target.speed = SPEED.jog;
      return;
    }

    // Ball carrier: dribble toward goal, steering around nearest opponent
    if (ball.owner === p) {
      const oppGoalX = dir * HALF_L;
      let gx = oppGoalX - p.x;
      let gz = 0 - p.z;
      const gl = Math.hypot(gx, gz) || 1;
      gx /= gl;
      gz /= gl;
      const opp = nearestOpponent(p);
      if (opp) {
        const od = dist(p.x, p.z, opp.x, opp.z);
        if (od < 5) {
          let ax = p.x - opp.x;
          let az = p.z - opp.z;
          const al = Math.hypot(ax, az) || 1;
          gx += (ax / al) * 0.7;
          gz += (az / al) * 0.7;
        }
      }
      const gl2 = Math.hypot(gx, gz) || 1;
      target.x = p.x + (gx / gl2) * 8;
      target.z = p.z + (gz / gl2) * 8;
      target.speed = SPEED.run;
      return;
    }

    // Defending team: press / cover / mark
    if (!isPossessing) {
      const rank = pressRank(p);
      if (rank === 0) {
        // primary presser: go to ball, goal-side
        target.x = ball.x - dir * 1.2;
        target.z = ball.z;
        target.speed = SPEED.sprint;
        return;
      }
      if (rank === 1) {
        // cover: midpoint between ball and own goal
        target.x = (ball.x + -dir * HALF_L) * 0.5;
        target.z = ball.z * 0.6;
        target.speed = SPEED.run;
        return;
      }
      // mark nearest attacker in zone + hold shape (dropped)
      const w = shapeWorld(p, dir);
      const mark = nearestOpponent(p);
      if (mark && dist(p.x, p.z, mark.x, mark.z) < 16) {
        target.x = mark.x * 0.45 + w.x * 0.55 - dir * 1.0;
        target.z = mark.z * 0.45 + w.z * 0.55;
      } else {
        target.x = w.x;
        target.z = w.z;
      }
      target.speed = SPEED.jog;
      return;
    }

    // Attacking off-ball: hold shape, make forward runs
    const w = shapeWorld(p, dir);
    let tx = w.x;
    let tz = w.z;
    if (p.role === 'FWD' && ball.owner) {
      // stretch: push a bit beyond shape toward goal
      tx += dir * 4;
    }
    target.x = tx;
    target.z = tz;
    const dToSlot = dist(p.x, p.z, tx, tz);
    target.speed = dToSlot > 12 ? SPEED.run : dToSlot > 4 ? SPEED.jog : SPEED.walk;
  }

  function ballAdv(teamIndex: number): number {
    // ball advancement toward this team's attacking goal, world x-frame
    return ball.x * teams[teamIndex].attackDir;
  }

  function shapeWorld(p: SimPlayer, dir: number): { x: number; z: number } {
    const base = slotWorld(p, dir);
    const adv = clamp(ballAdv(p.teamIndex) / HALF_L, -1, 1);
    const push = adv * (p.role === 'FWD' ? 14 : p.role === 'MID' ? 11 : 7);
    const zbias = clamp(ball.z / HALF_W, -1, 1) * 6;
    return { x: base.x + dir * push, z: base.z + zbias };
  }

  // The single player (either team) sprinting to collect a loose ball this tick.
  let looseChaser: SimPlayer | null = null;
  function computeLooseChaser() {
    if (ball.state !== 'loose') {
      looseChaser = null;
      return;
    }
    let best: SimPlayer | null = null;
    let bd = Infinity;
    for (const p of allPlayers) {
      // keepers only chase loose balls very near their own goal
      if (p.role === 'GK' && Math.abs(ball.x - -teams[p.teamIndex].attackDir * HALF_L) > 22) continue;
      const d = dist(p.x, p.z, ball.x, ball.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    looseChaser = best;
  }

  // precomputed press ranks per tick
  const pressRankMap = new Map<string, number>();
  function computePressRanks() {
    pressRankMap.clear();
    for (const tm of teams) {
      const isPoss = ball.owner
        ? ball.owner.teamIndex === tm.index
        : ball.lastTouchTeam === tm.index;
      if (isPoss) continue;
      const sorted = tm.players
        .filter((p) => p.role !== 'GK')
        .map((p) => ({ p, d: dist(p.x, p.z, ball.x, ball.z) }))
        .sort((a, b) => a.d - b.d);
      sorted.forEach((e, i) => pressRankMap.set(e.p.id, i));
    }
  }
  function pressRank(p: SimPlayer): number {
    return pressRankMap.get(p.id) ?? 99;
  }

  function integrate(p: SimPlayer) {
    const maxSpeed = p.role === 'GK' ? SPEED.gkMax : SPEED.sprint;
    let dx = target.x - p.x;
    let dz = target.z - p.z;
    const dl = Math.hypot(dx, dz);
    let desiredSpeed = Math.min(target.speed, maxSpeed);
    if (dl < 0.4) desiredSpeed = 0;
    const dvx0 = dl > 0.001 ? (dx / dl) * desiredSpeed - p.vx : -p.vx;
    const dvz0 = dl > 0.001 ? (dz / dl) * desiredSpeed - p.vz : -p.vz;

    // separation from teammates
    let sx = 0;
    let sz = 0;
    for (const q of teams[p.teamIndex].players) {
      if (q === p) continue;
      const d = dist(p.x, p.z, q.x, q.z);
      if (d < 2.4 && d > 0.0001) {
        const w = (2.4 - d) / 2.4;
        sx += ((p.x - q.x) / d) * w;
        sz += ((p.z - q.z) / d) * w;
      }
    }

    let dvx = dvx0 + sx * 2.2;
    let dvz = dvz0 + sz * 2.2;
    const dvl = Math.hypot(dvx, dvz);
    const maxDV = ACCEL * dt;
    if (dvl > maxDV) {
      dvx = (dvx / dvl) * maxDV;
      dvz = (dvz / dvl) * maxDV;
    }
    p.vx += dvx;
    p.vz += dvz;

    // clamp to max speed
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > maxSpeed) {
      p.vx = (p.vx / sp) * maxSpeed;
      p.vz = (p.vz / sp) * maxSpeed;
    }

    p.x += p.vx * dt;
    p.z += p.vz * dt;
    // keep on field
    p.x = clamp(p.x, -HALF_L + 0.5, HALF_L - 0.5);
    p.z = clamp(p.z, -HALF_W + 0.5, HALF_W - 0.5);

    const speed = Math.hypot(p.vx, p.vz);
    if (speed > 0.4) {
      const desired = Math.atan2(p.vx, p.vz);
      p.heading = lerpAngleLocal(p.heading, desired, Math.min(1, dt * 9));
    }
  }

  function lerpAngleLocal(a: number, b: number, f: number): number {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    return a + d * f;
  }

  // -------------------------- control resolution -----------------------------

  function resolveControl(t: number) {
    if (phase !== 'play') return;

    if (ball.state === 'controlled' && ball.owner) {
      // tackle attempts by nearby opponents
      const c = ball.owner;
      for (const o of teams[1 - c.teamIndex].players) {
        if (o.role === 'GK') continue;
        const d = dist(o.x, o.z, ball.x, ball.z);
        if (d < TACKLE_RADIUS) {
          // per-tick tackle probability, higher the closer the challenger
          if (rng.chance(0.09 * (1 - d / TACKLE_RADIUS))) {
            // turnover
            ball.state = 'loose';
            ball.owner = null;
            ball.vx = (ball.x - c.x) * 2 + rng.gaussian(0, 1);
            ball.vz = (ball.z - c.z) * 2 + rng.gaussian(0, 1);
            ball.looseCooldown = 0.12;
            ball.lastTouchTeam = o.teamIndex;
            events.push({
              t,
              type: 'tackle',
              actor: o.id,
              team: teams[o.teamIndex].info.id,
              location: [ball.x, ball.z],
              animIntent: 'tackle',
              importance: 0.35,
              text: `${o.name} wins it back.`,
            });
            nextDecisionAt = t + 0.5;
            return;
          }
        }
      }
      return;
    }

    if (ball.state === 'loose' && ball.looseCooldown <= 0) {
      // nearest player gains control
      let best: SimPlayer | null = null;
      let bd = CONTROL_RADIUS;
      for (const p of allPlayers) {
        const d = dist(p.x, p.z, ball.x, ball.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        ball.state = 'controlled';
        ball.owner = best;
        ball.lastTouchTeam = best.teamIndex;
        ball.vx = 0;
        ball.vz = 0;
        nextDecisionAt = t + rng.range(0.3, 0.8);
      }
    }
  }

  // -------------------------- main loop --------------------------------------

  for (let frame = 0; frame < frames; frame++) {
    const t = frame / HZ;

    if ((phase as string) === 'celebration' && t >= resetAt) {
      phase = 'play';
      kickoff(concedingTeam);
      nextDecisionAt = t + 0.6;
    }

    if ((phase as string) === 'play') {
      if (ball.state === 'controlled' && ball.owner && t >= nextDecisionAt) {
        carrierDecision(t);
      }
      progressBall(t);
    } else {
      // celebration: ball dead, just sits
      ball.y = BALL_R;
    }

    computePressRanks();
    computeLooseChaser();
    for (const p of allPlayers) {
      computeTarget(p, t);
      integrate(p);
    }

    if ((phase as string) === 'play') {
      // keep ball glued after integration for controlled state
      progressBallGlue();
      resolveControl(t);
    }

    // write frame
    writeFrame(frame);
  }

  function progressBallGlue() {
    if (ball.state === 'controlled' && ball.owner) {
      const o = ball.owner;
      const fx = Math.sin(o.heading);
      const fz = Math.cos(o.heading);
      ball.x = o.x + fx * 0.7;
      ball.z = o.z + fz * 0.7;
      ball.y = BALL_R;
    }
  }

  function writeFrame(frame: number) {
    for (const p of allPlayers) {
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
    const bsp = Math.hypot(ball.vx, ball.vz);
    ballTrack.speed[frame] = bsp;
    ballTrack.heading[frame] = Math.atan2(ball.vx, ball.vz);
    ballTrack.action[frame] = 0;
  }

  // kickoff event
  events.unshift({
    t: 0,
    type: 'kickoff',
    team: teams[0].info.id,
    location: [0, 0],
    importance: 0.3,
    text: `Kick-off: ${teams[0].info.name} vs ${teams[1].info.name}.`,
  });

  return {
    id: opts.id,
    sport: 'soccer',
    fidelity: opts.fidelity ?? 'synth',
    meta: {
      title: opts.title ?? `${opts.home.name} vs ${opts.away.name}`,
      competition: opts.competition,
      venue: opts.venue,
      teams: teamInfos,
      score,
      attribution: 'PitchSide synthesis engine',
      videos: opts.videos,
      mood: opts.mood ?? 'night',
    },
    fieldSpec: {
      type: 'soccer',
      length: L,
      width: W,
      goalWidth: GOAL_HALF_W,
      goalHeight: GOAL_H,
    },
    duration,
    entities,
    tracks,
    events,
    scoreboard,
  };
}
