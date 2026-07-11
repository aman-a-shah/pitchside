'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useMatch } from '@/state/match';
import { useClock, playhead } from '@/state/clock';
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
  const { ir } = useMatch();
  const { camera } = useThree();
  const mode = useClock((st) => st.cameraMode);
  const followId = useClock((st) => st.followId);

  const ball = useRef(new THREE.Vector3());
  const ent = useRef(new THREE.Vector3());
  const desiredPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const smoothLook = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  const len = ir.fieldSpec.length;
  const wid = ir.fieldSpec.width;

  // cinematic director state
  const shotRef = useRef({ index: 0, start: 0, cut: true });

  useEffect(() => {
    initialized.current = false;
  }, [mode, followId]);

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
    } else if (mode === 'player' && followId && ir.tracks[followId]) {
      const tr = ir.tracks[followId];
      sampleTrack(tr, t, s);
      ent.current.set(s.x, s.y, s.z);
      const back = new THREE.Vector3(-Math.sin(s.heading), 0, -Math.cos(s.heading));
      desiredPos.current
        .copy(ent.current)
        .addScaledVector(back, 6)
        .add(new THREE.Vector3(0, 3.1, 0));
      // look a little ahead of the player toward where they face
      const fwd = new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
      lookTarget.current.copy(ent.current).addScaledVector(fwd, 6).setY(1.4);
      lerpPos = 0.12;
      lerpLook = 0.14;
    } else {
      // cinematic director
      directorShot(t, delta);
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
  });

  function directorShot(t: number, delta: number) {
    const sh = shotRef.current;
    const elapsed = t - sh.start;
    // find an imminent key event to cut to
    const upcoming = findKeyEvent(ir, t);
    const nearGoal = upcoming && upcoming.t - t < 0.4 && upcoming.t - t > -2.5;

    if (elapsed > 6 || sh.start === 0 || (nearGoal && sh.index !== 99)) {
      sh.index = nearGoal ? 99 : (sh.index + 1) % 4;
      sh.start = t;
      sh.cut = true;
    }

    const b = ball.current;
    if (sh.index === 99 && upcoming) {
      // dramatic low angle on the event location
      const ex = upcoming.location ? upcoming.location[0] : b.x;
      const ez = upcoming.location ? upcoming.location[1] : b.z;
      desiredPos.current.set(ex * 0.7, 3.4, ez + (ez >= 0 ? 10 : -10));
      lookTarget.current.set(ex, 1.5, ez);
    } else if (sh.index === 0) {
      desiredPos.current.set(b.x * 0.5, len * 0.22, -(wid * 0.5 + len * 0.26));
      lookTarget.current.set(b.x * 0.8, 2, b.z * 0.4);
    } else if (sh.index === 1) {
      desiredPos.current.set(len * 0.52, 8, b.z * 0.6 + 14);
      lookTarget.current.set(b.x, 1.5, b.z);
    } else if (sh.index === 2) {
      desiredPos.current.set(b.x + 12, 2.4, b.z + 12);
      lookTarget.current.set(b.x, 1.2, b.z);
    } else {
      desiredPos.current.set(-len * 0.5, len * 0.18, -(wid * 0.4));
      lookTarget.current.set(b.x * 0.7, 2, b.z);
    }

    if (sh.cut) {
      initialized.current = false;
      sh.cut = false;
    }
    void delta;
  }

  return null;
}

function findKeyEvent(ir: MatchIR, t: number) {
  let best = null as null | (typeof ir.events)[number];
  for (const e of ir.events) {
    if ((e.importance ?? 0) < 0.7) continue;
    if (e.t >= t - 2.5 && e.t <= t + 3) {
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
