'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useMatch } from '@/state/match';
import { useClock, playhead, povTarget } from '@/state/clock';
import { MatchIR, Sample } from '@/ir/types';
import { sampleTrack } from '@/ir/sampler';

const s: Sample = { x: 0, y: 0, z: 0, speed: 0, heading: 0, action: 0 };

function samplePos(ir: MatchIR, id: string, t: number, out: THREE.Vector3): THREE.Vector3 {
  const tr = ir.tracks[id];
  if (!tr) return out.set(0, 0, 0);
  sampleTrack(tr, t, s);
  return out.set(s.x, s.y, s.z);
}

export default function CameraRig() {
  const mode = useClock((st) => st.cameraMode);
  const film = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('film'),
    []
  );
  if (film) return <FilmMode />;
  if (mode === 'orbit') return <OrbitMode />;
  if (mode === 'fly') return <FlyMode />;
  return <AutoMode key={mode} />;
}

// --------------------------- film (hero footage) -----------------------------

/**
 * FilmMode (?film=1&filmStart=s&filmEnd=s) — the hero-footage camera.
 * Position and aim are a PURE function of playhead.t, so a headless harness
 * stepping the clock (scripts/film.mjs) captures a perfectly smooth move with
 * zero per-frame lerp state. One continuous crane shot: high above the stand,
 * sweeping down across the bowl, settling into a low touchline angle that
 * tracks the ball into the key moment.
 */
function FilmMode() {
  const { ir } = useMatch();
  const { camera } = useThree();
  const ball = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());

  const cfg = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const start = parseFloat(q.get('filmStart') ?? '20');
    const end = parseFloat(q.get('filmEnd') ?? String(start + 10));
    const l = ir.fieldSpec.length;
    const w = ir.fieldSpec.width;
    // sweep TOWARD the end where the play concludes (which goal the ball is
    // at when the window closes) so the shot lands on the action
    const endBall = samplePos(ir, 'ball', end, new THREE.Vector3());
    const m = endBall.x >= 0 ? 1 : -1;
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-m * l * 0.42, 30, -(w * 0.5 + 30)),
        new THREE.Vector3(-m * l * 0.1, 18, -(w * 0.5 + 16)),
        new THREE.Vector3(m * l * 0.18, 8, -(w * 0.5 + 6)),
        new THREE.Vector3(m * l * 0.38, 4.6, -(w * 0.5 + 10)),
      ],
      false,
      'centripetal'
    );
    return { start, end, curve };
  }, [ir]);

  useFrame(() => {
    const u = THREE.MathUtils.clamp((playhead.t - cfg.start) / (cfg.end - cfg.start), 0, 1);
    const s = THREE.MathUtils.smootherstep(u, 0, 1);
    camera.position.copy(cfg.curve.getPoint(s));

    samplePos(ir, 'ball', playhead.t, ball.current);
    // early: hold the whole pitch; late: track the ball into the play
    const follow = THREE.MathUtils.smoothstep(u, 0.2, 0.6);
    look.current.set(
      THREE.MathUtils.lerp(0, ball.current.x, follow),
      THREE.MathUtils.lerp(2, 1.2, follow),
      THREE.MathUtils.lerp(0, ball.current.z * 0.8, follow)
    );
    camera.lookAt(look.current);

    const persp = camera as THREE.PerspectiveCamera;
    const fov = 50 - 10 * s; // slow push-in
    if (persp.fov !== fov) {
      persp.fov = fov;
      persp.updateProjectionMatrix();
    }
  });

  return null;
}

// --------------------------- orbit ------------------------------------------

function OrbitMode() {
  const { ir } = useMatch();
  const ref = useRef<any>(null);
  const target = useRef(new THREE.Vector3());
  const ballPos = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!ref.current) return;
    samplePos(ir, 'ball', playhead.t, ballPos.current);
    target.current.lerp(ballPos.current, 0.05);
    ref.current.target.copy(target.current);
    ref.current.update();
  });

  const scale = ir.fieldSpec.length;
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={scale * 2.2}
      maxPolarAngle={Math.PI * 0.495}
      enablePan
    />
  );
}

// --------------------------- broadcast / player / cinematic ------------------

function AutoMode() {
  const { ir, events } = useMatch();
  const { camera } = useThree();
  const mode = useClock((st) => st.cameraMode);
  const povView = useClock((st) => st.povView);
  const followId = useClock((st) => st.followId);

  const ball = useRef(new THREE.Vector3());
  const ent = useRef(new THREE.Vector3());
  const desiredPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const smoothLook = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  const len = ir.fieldSpec.length;
  const wid = ir.fieldSpec.width;

  // cinematic director state: current shot + its lens (fov snaps on cuts)
  const shotRef = useRef({ name: '', start: 0, fov: 40 });
  const ballAhead = useRef(new THREE.Vector3());
  // player cam state: current body + when we last re-evaluated who has the ball
  const povRef = useRef({ id: null as string | null, checked: -1 });
  // first-person body feel: stride phase, turn-lean roll, sprint fov, kick jolt
  const fpRef = useRef({
    phase: 0,
    lastT: null as number | null,
    prevHead: null as number | null,
    roll: 0,
    fov: 68,
    kick: 0,
  });

  useEffect(() => {
    initialized.current = false;
    const fp = fpRef.current;
    fp.lastT = null;
    fp.prevHead = null;
    fp.roll = 0;
    fp.fov = 68;
    fp.kick = 0;
  }, [mode, povView, followId]);

  // entering/leaving first person: widen the lens to a human field of view,
  // and always clear the hidden-body channel on the way out
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    if (mode === 'player' && povView === 'first') {
      persp.fov = 68;
      persp.updateProjectionMatrix();
    }
    return () => {
      povTarget.id = null;
      povRef.current.id = null;
      persp.fov = 40;
      persp.updateProjectionMatrix();
    };
  }, [mode, povView, camera]);

  /** the player nearest the ball right now (POV auto-follow of possession) */
  function nearestToBall(t: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const e of ir.entities) {
      if (e.role !== 'player') continue;
      const tr = ir.tracks[e.id];
      if (!tr) continue;
      sampleTrack(tr, t, s);
      const d = Math.hypot(s.x - ball.current.x, s.z - ball.current.z);
      if (d < bestD) {
        bestD = d;
        best = e.id;
      }
    }
    return best;
  }

  useFrame((_, delta) => {
    const t = playhead.t;
    samplePos(ir, 'ball', t, ball.current);

    let lerpPos = 0.06;
    let lerpLook = 0.08;

    if (mode === 'broadcast') {
      if (ir.sport === 'tennis') {
        // classic TV angle: behind one baseline, elevated, looking down the court
        desiredPos.current.set(-(len * 0.5 + 7), len * 0.42, 0);
        lookTarget.current.set(len * 0.12, 0.5, ball.current.z * 0.5);
      } else {
        const sideZ = -(wid * 0.5 + len * 0.28);
        desiredPos.current.set(ball.current.x * 0.55, len * 0.2, sideZ);
        lookTarget.current.set(ball.current.x * 0.85, 2, ball.current.z * 0.4);
      }
    } else if (mode === 'player') {
      // ---- the player cam: one target, two views ----
      const pv = povRef.current;
      // pinned to the chosen player; otherwise ride possession, re-checked
      // twice a second (sticky between checks so the view doesn't ping-pong
      // in a crowded midfield)
      if (followId && ir.tracks[followId]) {
        pv.id = followId;
      } else if (Math.abs(t - pv.checked) > 0.5 || !pv.id) {
        pv.checked = t;
        pv.id = nearestToBall(t) ?? pv.id;
      }
      const tr = pv.id ? ir.tracks[pv.id] : undefined;
      // hide the body only when we're inside it
      povTarget.id = tr && povView === 'first' ? pv.id : null;
      if (tr) {
        sampleTrack(tr, t, s);
        if (povView === 'first') {
          // ---- being a body, not a drone: everything is match-time driven
          // (freezes on pause, slows in slow-mo, exactly like the athletes) ----
          const fp = fpRef.current;
          // clock delta, zeroed across seeks/pause so state never jumps
          const dtc =
            fp.lastT === null || Math.abs(t - fp.lastT) > 0.5 ? 0 : Math.max(0, t - fp.lastT);
          fp.lastT = t;

          // stride-locked footsteps: cadence rises with speed; |sin| dips the
          // eye at each footfall, sin sways the weight left/right between them
          const stride = Math.min(1, s.speed / 3.2);
          const stepHz = 1.5 + Math.min(s.speed, 8) * 0.22;
          fp.phase += dtc * stepHz * Math.PI;
          const breath = Math.sin(t * 1.8) * 0.006;
          const bobY = (Math.abs(Math.sin(fp.phase)) - 0.6) * 0.06 * stride + breath;
          const sway = Math.sin(fp.phase) * 0.03 * stride;
          const rightX = Math.cos(s.heading);
          const rightZ = -Math.sin(s.heading);

          // the jolt of striking the ball — this body's own kicks, felt
          fp.kick = 0;
          {
            let lo = 0;
            let hi = events.length;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (events[mid].t < t - 0.35) lo = mid + 1;
              else hi = mid;
            }
            for (let i = lo; i < events.length && events[i].t <= t; i++) {
              const e = events[i];
              if (e.actor !== pv.id) continue;
              if (e.type === 'pass' || e.type === 'shot' || e.type === 'tackle' || e.type === 'clearance') {
                const k = 1 - (t - e.t) / 0.35;
                if (k > fp.kick) fp.kick = k;
              }
            }
          }

          desiredPos.current.set(
            s.x + rightX * sway,
            1.72 + bobY - fp.kick * 0.05,
            s.z + rightZ * sway
          );

          // a footballer's gaze: the ball when it's away from the feet, the
          // pitch ahead when carrying it (dipping toward the ball at pace)
          const dBall = Math.hypot(ball.current.x - s.x, ball.current.z - s.z);
          if (dBall > 1.4) {
            lookTarget.current.set(
              ball.current.x,
              Math.max(ball.current.y, 0.4),
              ball.current.z
            );
          } else {
            lookTarget.current.set(
              s.x + Math.sin(s.heading) * 9,
              1.5 - 0.35 * stride,
              s.z + Math.cos(s.heading) * 9
            );
          }
          // eyes are never perfectly still — a slow scanning wander
          lookTarget.current.x += Math.sin(t * 0.7 + 2.1) * 0.5;
          lookTarget.current.y += Math.sin(t * 1.1 + 0.6) * 0.12;
          lookTarget.current.z += Math.sin(t * 0.5 + 4.4) * 0.5;

          // lean into direction changes, like carrying your own momentum
          let headVel = 0;
          if (fp.prevHead !== null && dtc > 1e-4) {
            let dh = s.heading - fp.prevHead;
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            headVel = dh / dtc;
          }
          fp.prevHead = s.heading;
          // kept subtle — roll is the first thing that reads as motion sickness
          const lean = THREE.MathUtils.clamp(
            -headVel * 0.018 * Math.min(1, s.speed / 2),
            -0.04,
            0.04
          );
          const stepRoll = Math.sin(fp.phase) * 0.004 * stride;
          fp.roll += (lean + stepRoll - fp.roll) * Math.min(1, delta * 6);

          // the lens is always faintly alive: a slow breathing swell, a
          // stretch toward sprint pace, a punch when the ball is struck
          const persp = camera as THREE.PerspectiveCamera;
          const fovBreath = Math.sin(t * 0.9) * 0.7;
          const fovTarget = 68 + fovBreath + 8 * Math.min(1, s.speed / 7) + fp.kick * 3;
          fp.fov += (fovTarget - fp.fov) * Math.min(1, delta * 4);
          if (Math.abs(persp.fov - fp.fov) > 0.01) {
            persp.fov = fp.fov;
            persp.updateProjectionMatrix();
          }

          lerpPos = 0.5; // eyes track the body tightly — lag here reads as seasick
          lerpLook = 0.16;
        } else {
          // third person: behind the player's shoulder, looking past them
          ent.current.set(s.x, s.y, s.z);
          const back = new THREE.Vector3(-Math.sin(s.heading), 0, -Math.cos(s.heading));
          desiredPos.current
            .copy(ent.current)
            .addScaledVector(back, 6)
            .add(new THREE.Vector3(0, 3.1, 0));
          const fwd = new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
          lookTarget.current.copy(ent.current).addScaledVector(fwd, 6).setY(1.4);
          lerpPos = 0.12;
          lerpLook = 0.14;
        }
      }
    } else {
      // cinematic director
      directorShot(t, delta);
      // the lens is part of the cut: a camera switch lands on its focal
      // length instantly; within a shot the fov only creeps (slow zoom)
      const persp = camera as THREE.PerspectiveCamera;
      const targetFov = shotRef.current.fov;
      const nextFov = initialized.current
        ? persp.fov + (targetFov - persp.fov) * Math.min(1, delta * 1.5)
        : targetFov;
      if (Math.abs(persp.fov - nextFov) > 0.01) {
        persp.fov = nextFov;
        persp.updateProjectionMatrix();
      }
    }

    if (!initialized.current) {
      camera.position.copy(desiredPos.current);
      smoothLook.current.copy(lookTarget.current);
      initialized.current = true;
    } else {
      camera.position.lerp(desiredPos.current, lerpPos);
      smoothLook.current.lerp(lookTarget.current, lerpLook);
    }
    camera.lookAt(smoothLook.current);
    if (mode === 'player' && povView === 'first') {
      // lookAt zeroes roll every frame — re-apply the body lean and, while a
      // kick impulse is live, a fast decaying shudder
      const fp = fpRef.current;
      camera.rotateZ(fp.roll + fp.kick * Math.sin(t * 57) * 0.005);
    }
  });

  /**
   * The auto-director. A TV production's shot grammar, deterministic in match
   * time: because the whole future event stream is known, the director cuts
   * to the right place BEFORE the moment — behind the goal as a shot comes
   * in, tight on the scorer as the celebration starts — then falls back to a
   * rotating pattern of standard coverage shots between moments.
   *
   * Two rules keep it looking like television:
   *  - every low camera lives INSIDE the bowl (the runoff between the field
   *    edge and the first row — same envelope the fly cam obeys); only the
   *    high gantry rides above the stand tops. No shot ever sits in the crowd.
   *  - every shot has a lens: long glass (small fov) for the compressed
   *    coverage looks, wider only up close. Cuts snap the fov, shots creep it.
   */
  function directorShot(t: number, delta: number) {
    const sh = shotRef.current;
    const b = ball.current;
    const life = t - sh.start;
    const cutTo = (name: string, fov: number) => {
      if (sh.name !== name) {
        sh.name = name;
        sh.start = t;
        sh.fov = fov;
        initialized.current = false; // hard cut, like a vision mixer
      }
    };
    // the runoff envelope: between the field edge and the first row of seats
    const pad = (FLY_BOUNDS[ir.sport]?.pad ?? 5) - 0.8;
    const clampBowl = (v: THREE.Vector3, minY = 1.1) => {
      v.x = THREE.MathUtils.clamp(v.x, -(len * 0.5 + pad), len * 0.5 + pad);
      v.z = THREE.MathUtils.clamp(v.z, -(wid * 0.5 + pad), wid * 0.5 + pad);
      v.y = Math.max(v.y, minY);
    };
    // operators frame where the play is GOING — lead the ball slightly
    samplePos(ir, 'ball', t + 0.6, ballAhead.current);
    const leadX = (ballAhead.current.x - b.x) * 0.45;
    const leadZ = (ballAhead.current.z - b.z) * 0.45;

    // ---- hero coverage: goals own the camera from 2s before to 5s after ----
    const goal = findKeyEvent(ir, t, 'goal', 2.2, 5.4);
    if (goal) {
      if (t >= goal.t + 0.35 && goal.actor && ir.tracks[goal.actor]) {
        // scorer close-up: a slow arc around the celebration
        sampleTrack(ir.tracks[goal.actor], t, s);
        const ang = (t - goal.t) * 0.28 + (goal.t % 6.28);
        cutTo(`cele-${goal.t}`, 36);
        desiredPos.current.set(s.x + Math.sin(ang) * 6, 2.3, s.z + Math.cos(ang) * 6);
        clampBowl(desiredPos.current, 1.6); // corner celebrations: slide along the runoff, never into it
        lookTarget.current.set(s.x, 1.3, s.z);
        return;
      }
      // net-cam: low in the runoff behind the goal the ball is arriving at,
      // just inside the first row of seats
      const gx = (goal.location?.[0] ?? b.x) >= 0 ? 1 : -1;
      cutTo(`net-${goal.t}`, 48);
      desiredPos.current.set(
        gx * (len * 0.5 + pad * 0.75),
        1.15,
        THREE.MathUtils.clamp((goal.location?.[1] ?? b.z) * 0.35, -7, 7)
      );
      lookTarget.current.set(b.x, Math.max(b.y, 0.9), b.z);
      return;
    }

    // ---- big chances: anticipate shots/saves with a low dramatic angle ----
    const chance = findKeyEvent(ir, t, null, 1.6, 2.4);
    if (chance) {
      const ex = chance.location ? chance.location[0] : b.x;
      const ez = chance.location ? chance.location[1] : b.z;
      cutTo(`chance-${chance.t}`, 38);
      desiredPos.current.set(ex * 0.72, 2.4, ez + (ez >= 0 ? 9 : -9));
      clampBowl(desiredPos.current, 1.5);
      lookTarget.current.set(b.x + leadX * 0.5, 1.2, b.z + leadZ * 0.5);
      return;
    }

    // ---- standard coverage rotation, durations tuned per shot ----
    const ROTATION: { name: string; dur: number; fov: number }[] = [
      { name: 'wide', dur: 8, fov: 33 },
      { name: 'lowTouch', dur: 5.5, fov: 29 },
      { name: 'steadicam', dur: 4.5, fov: 42 },
      { name: 'crane', dur: 7, fov: 38 },
      { name: 'orbitBall', dur: 5.5, fov: 44 },
    ];
    const idx = Math.max(
      0,
      ROTATION.findIndex((r) => r.name === sh.name)
    );
    const cur = ROTATION[idx];
    const inRotation = ROTATION.some((r) => r.name === sh.name);
    if (!inRotation || t - sh.start > cur.dur || t < sh.start) {
      const next = inRotation ? ROTATION[(idx + 1) % ROTATION.length] : ROTATION[0];
      cutTo(next.name, next.fov);
    }

    switch (sh.name) {
      case 'lowTouch': // pitch-level long-lens dolly from the near runoff
        desiredPos.current.set(b.x * 0.8, 1.5, -(wid * 0.5 + pad * 0.8));
        lookTarget.current.set(b.x + leadX, 1.0, b.z + leadZ * 0.4);
        break;
      case 'steadicam': // tight, moving with the play
        desiredPos.current.set(b.x + 9, 2.3, b.z + 9);
        clampBowl(desiredPos.current, 1.6);
        lookTarget.current.set(b.x + leadX, 1.2, b.z + leadZ);
        break;
      case 'crane': {
        // high over the end runoff (a spidercam post), slowly descending
        const gx = b.x >= 0 ? 1 : -1;
        desiredPos.current.set(
          gx * (len * 0.5 + pad * 0.9),
          13.5 - Math.min(life * 0.3, 2.5),
          b.z * 0.5
        );
        lookTarget.current.set(b.x * 0.65 + leadX, 1.4, b.z * 0.65 + leadZ);
        break;
      }
      case 'orbitBall': {
        // slow orbital drift around the ball
        const ang = t * 0.14;
        desiredPos.current.set(b.x + Math.sin(ang) * 12, 4.2, b.z + Math.cos(ang) * 12);
        clampBowl(desiredPos.current, 2.2);
        lookTarget.current.set(b.x + leadX * 0.6, 1.1, b.z + leadZ * 0.6);
        break;
      }
      default: {
        // wide — the master gantry, above the stand tops with a slow push-in
        const push = Math.min(life * 0.35, 3);
        desiredPos.current.set(b.x * 0.45, len * 0.2 - push * 0.4, -(wid * 0.5 + len * 0.22) + push);
        lookTarget.current.set(b.x * 0.8 + leadX, 1.8, b.z * 0.35 + leadZ * 0.5);
      }
    }
    void delta;
  }

  return null;
}

/**
 * The most relevant high-importance event around `t`: `before` seconds of
 * anticipation, `after` seconds of aftermath. `type` narrows to one event
 * type; null accepts any event with importance ≥ 0.7.
 */
function findKeyEvent(
  ir: MatchIR,
  t: number,
  type: 'goal' | null,
  before: number,
  after: number
) {
  let best = null as null | (typeof ir.events)[number];
  for (const e of ir.events) {
    if (type ? e.type !== type : (e.importance ?? 0) < 0.7) continue;
    if (e.t >= t - after && e.t <= t + before) {
      if (!best || Math.abs(e.t - t) < Math.abs(best.t - t)) best = e;
    }
  }
  return best;
}

// --------------------------- fly / FPS --------------------------------------

// how far past the field edge (into the runoff, before the first row of
// seats) and how high (below the stand tops) free-fly may roam, per sport —
// keeps the camera anchored inside the bowl: no crowd, no outside, no
// underground. Pads mirror Stadium's CONFIG gap values.
const FLY_BOUNDS = {
  soccer: { pad: 5, maxY: 18 },
  basketball: { pad: 2, maxY: 10 },
  tennis: { pad: 3.5, maxY: 10 },
} as const;

function FlyMode() {
  const { camera, gl } = useThree();
  const { ir } = useMatch();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const locked = useRef(false);
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  useEffect(() => {
    // seed yaw/pitch from current camera orientation
    euler.current.setFromQuaternion(camera.quaternion);
    yaw.current = euler.current.y;
    pitch.current = euler.current.x;

    const dom = gl.domElement;
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const onClick = () => {
      dom.requestPointerLock();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === dom;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      yaw.current -= e.movementX * 0.0022;
      pitch.current -= e.movementY * 0.0022;
      pitch.current = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch.current));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === dom) document.exitPointerLock();
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    euler.current.set(pitch.current, yaw.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler.current);

    const k = keys.current;
    const boost = k['ShiftLeft'] || k['ShiftRight'] ? 3 : 1;
    const speed = 14 * boost * Math.min(delta, 0.05);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const move = new THREE.Vector3();
    if (k['KeyW'] || k['ArrowUp']) move.add(fwd);
    if (k['KeyS'] || k['ArrowDown']) move.sub(fwd);
    if (k['KeyD'] || k['ArrowRight']) move.add(right);
    if (k['KeyA'] || k['ArrowLeft']) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
    }
    if (k['KeyE'] || k['Space']) camera.position.y += speed;
    if (k['KeyQ'] || k['ControlLeft']) camera.position.y -= speed;

    // hard-anchor inside the arena bowl
    const b = FLY_BOUNDS[ir.sport] ?? FLY_BOUNDS.soccer;
    const maxX = ir.fieldSpec.length / 2 + b.pad;
    const maxZ = ir.fieldSpec.width / 2 + b.pad;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -maxX, maxX);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -maxZ, maxZ);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.6, b.maxY);
  });

  return null;
}
