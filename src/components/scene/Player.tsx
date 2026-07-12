'use client';

/**
 * Procedurally-animated articulated player.
 *
 * No external rigs/GLBs: the figure is built from primitives and posed every
 * frame from a gait model. The crucial trick for believable, non-sliding motion:
 * the gait PHASE is advanced by distance travelled in *match time* (Δt from the
 * playhead), not wall-clock time. So footfalls track ground speed (no skating),
 * freeze when paused, reverse on rewind, and slow in slow-motion — automatically.
 *
 * The silhouette is intentionally stylized (clean sports-game look, not photoreal):
 * tapered limbs, rounded shoulder/knee/elbow joints, a hair cap, delineated
 * sleeves/shorts/socks/boots, and a shirt number on the back. Per-player skin &
 * hair are seeded deterministically from the entity id so they're stable across
 * frames. Materials are deliberately matte (no emissive / no additive) so they
 * don't flood the bloom pass to white at low camera angles.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { KitSpec, MatchEvent, Sample, Track } from '@/ir/types';
import { sampleTrack } from '@/ir/sampler';
import { playhead, povTarget } from '@/state/clock';

const STRIDE = 1.55; // metres per gait half-cycle
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

// Shared geometries (created once, reused across all players).
const geo = {
  head: new THREE.SphereGeometry(0.115, 20, 16),
  // hair skull-cap: top ~60% of a sphere, slightly larger than the head
  hair: new THREE.SphereGeometry(0.126, 20, 14, 0, TAU, 0, Math.PI * 0.62),
  ear: new THREE.SphereGeometry(0.03, 8, 6),
  neck: new THREE.CylinderGeometry(0.05, 0.064, 0.12, 12),
  collar: new THREE.CylinderGeometry(0.088, 0.098, 0.05, 14, 1, true),
  chest: new THREE.CapsuleGeometry(0.15, 0.2, 8, 16),
  abdomen: new THREE.CapsuleGeometry(0.128, 0.12, 6, 14),
  pelvis: new THREE.BoxGeometry(0.3, 0.17, 0.21),
  shoulder: new THREE.SphereGeometry(0.07, 14, 12),
  sleeve: new THREE.CapsuleGeometry(0.062, 0.085, 5, 12),
  upperArm: new THREE.CapsuleGeometry(0.05, 0.18, 5, 10),
  elbow: new THREE.SphereGeometry(0.052, 12, 10),
  lowerArm: new THREE.CapsuleGeometry(0.043, 0.2, 5, 10),
  hand: new THREE.SphereGeometry(0.052, 10, 8),
  glove: new THREE.SphereGeometry(0.064, 12, 10),
  shortsLeg: new THREE.CapsuleGeometry(0.09, 0.1, 5, 12),
  thigh: new THREE.CapsuleGeometry(0.077, 0.16, 5, 12),
  knee: new THREE.SphereGeometry(0.073, 12, 10),
  shin: new THREE.CapsuleGeometry(0.062, 0.24, 5, 12),
  sockCuff: new THREE.CylinderGeometry(0.067, 0.067, 0.035, 12),
  bootBody: new THREE.BoxGeometry(0.1, 0.06, 0.19),
  bootToe: new THREE.SphereGeometry(0.056, 12, 10),
  numberPlane: new THREE.PlaneGeometry(0.24, 0.28),
};

export interface PlayerHandle {
  group: THREE.Group;
}

interface PlayerProps {
  id: string;
  track: Track;
  kit: KitSpec;
  number: number;
  isGK?: boolean;
  events?: MatchEvent[]; // events where this player is the actor
  registerRef?: (id: string, group: THREE.Group) => void;
}

const tmpSample: Sample = { x: 0, y: 0, z: 0, speed: 0, heading: 0, action: 0 };

// Shared, app-lifetime number materials/textures (keyed by number+color so 22
// players share a handful of canvas textures — never per-player-heavy).
const numberMatCache = new Map<string, THREE.MeshStandardMaterial>();

function numberMaterial(n: number, color: string): THREE.MeshStandardMaterial {
  const key = `${n}|${color}`;
  const cached = numberMatCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = 'bold 92px system-ui, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.4,
    roughness: 0.85,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  numberMatCache.set(key, mat);
  return mat;
}

// --- deterministic per-player variation (seeded from id, stable per frame) ---

function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const HAIR_COLORS = ['#181310', '#0d0d10', '#2a1c12', '#3c2a19', '#5a3d22', '#7a5a34'];

function variedSkin(hex: string, r: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // nudge lightness ±, hue slightly warmer/cooler
  const l = clamp(hsl.l + (r - 0.5) * 0.14, 0.28, 0.82);
  const h = (hsl.h + (r - 0.5) * 0.015 + 1) % 1;
  const s = clamp(hsl.s + (r - 0.5) * 0.06, 0.15, 0.9);
  c.setHSL(h, s, l);
  return c;
}

export default function Player({
  id,
  track,
  kit,
  number,
  isGK,
  events,
  registerRef,
}: PlayerProps) {
  const root = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const chest = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const shinL = useRef<THREE.Group>(null!);
  const shinR = useRef<THREE.Group>(null!);
  const footL = useRef<THREE.Group>(null!);
  const footR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const foreL = useRef<THREE.Group>(null!);
  const foreR = useRef<THREE.Group>(null!);

  const phase = useRef(hash01(id, 7) * Math.PI * 2);
  const prevT = useRef(playhead.t);
  const smoothLean = useRef(0);

  const mats = useMemo(() => {
    const rough = hash01(id, 3);
    const jersey = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isGK ? mixHex(kit.primary, '#101014', 0.55) : kit.primary),
      roughness: 0.66 + (rough - 0.5) * 0.1,
      metalness: 0.02,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isGK ? mixHex(kit.secondary, '#101014', 0.35) : kit.secondary),
      roughness: 0.6,
      metalness: 0.02,
    });
    const shorts = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isGK ? mixHex(kit.shorts, '#101014', 0.4) : kit.shorts),
      roughness: 0.72,
    });
    const socks = new THREE.MeshStandardMaterial({
      color: new THREE.Color(kit.socks),
      roughness: 0.78,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: variedSkin(kit.skin, hash01(id, 11)),
      roughness: 0.62,
    });
    const hair = new THREE.MeshStandardMaterial({
      color: new THREE.Color(HAIR_COLORS[Math.floor(hash01(id, 23) * HAIR_COLORS.length)]),
      roughness: 0.85,
    });
    const boot = new THREE.MeshStandardMaterial({ color: '#0b0b10', roughness: 0.35 });
    const glove = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c9cdd4'),
      roughness: 0.7,
    });
    return { jersey, trim, shorts, socks, skin, hair, boot, glove };
  }, [kit, isGK, id]);

  const numberMat = useMemo(
    () => numberMaterial(number, kit.numberColor),
    [number, kit.numberColor]
  );

  const handMat = isGK ? mats.glove : mats.skin;
  const handGeo = isGK ? geo.glove : geo.hand;

  // dispose per-player materials on unmount (prop-assigned materials aren't
  // auto-disposed by R3F). numberMat is a shared, cached, app-lifetime material —
  // deliberately not disposed here.
  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  // events where importance triggers a pose, sorted
  const actorEvents = useMemo(
    () => (events ?? []).filter((e) => e.actor === id).sort((a, b) => a.t - b.t),
    [events, id]
  );

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    // the POV camera hides the body it's looking through
    g.visible = povTarget.id !== id;
    const t = playhead.t;
    let dtm = t - prevT.current;
    prevT.current = t;
    // guard against seeks producing wild deltas
    if (Math.abs(dtm) > 0.5) dtm = 0;

    const s = sampleTrack(track, t, tmpSample);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.heading;

    const speed = s.speed;
    // DISTANCE-PHASE gait: advance the stride by distance travelled in match time.
    phase.current += (speed * dtm) / STRIDE;
    const ph = phase.current;

    // locomotion amplitude scales with speed (walk→jog→sprint)
    const amp = clamp(speed / 7, 0, 1);
    const legAmp = 0.35 + amp * 0.62;
    const armAmp = 0.22 + amp * 0.78;

    const sinp = Math.sin(ph);
    const cosp = Math.cos(ph);

    const running = speed >= 0.35;

    // ---- legs: swing opposite; knees bend on the up/forward swing ----
    const lSwing = sinp * legAmp;
    const rSwing = -sinp * legAmp;
    const cL = legL.current;
    const cR = legR.current;
    const sL = shinL.current;
    const sR = shinR.current;
    const fL = footL.current;
    const fR = footR.current;
    cL.rotation.x = lSwing;
    cR.rotation.x = rSwing;
    const kneeBend = 0.5 + amp * 0.95;
    sL.rotation.x = Math.max(0, -sinp) * kneeBend + 0.12;
    sR.rotation.x = Math.max(0, sinp) * kneeBend + 0.12;
    // foot roll/plant: level under stance, toe lifts on the forward swing
    fL.rotation.x = clamp(-lSwing * 0.55 - sL.rotation.x * 0.28 + 0.08, -0.55, 0.55);
    fR.rotation.x = clamp(-rSwing * 0.55 - sR.rotation.x * 0.28 + 0.08, -0.55, 0.55);

    // ---- arms swing opposite to legs; elbows drive with speed ----
    const aL = armL.current;
    const aR = armR.current;
    aL.rotation.x = -sinp * armAmp;
    aR.rotation.x = sinp * armAmp;
    // arms tuck in more when sprinting (drive), out a touch when idling
    aL.rotation.z = 0.1 + amp * 0.05;
    aR.rotation.z = -0.1 - amp * 0.05;
    const elbow = 0.32 + amp * 0.55;
    foreL.current.rotation.x = elbow + Math.max(0, sinp) * 0.35;
    foreR.current.rotation.x = elbow + Math.max(0, -sinp) * 0.35;

    // ---- torso: forward lean, vertical bob, shoulder counter-rotation ----
    const targetLean = clamp(speed * 0.045, 0, 0.42);
    smoothLean.current += (targetLean - smoothLean.current) * 0.1;
    const cTorso = torso.current;
    const cChest = chest.current;
    const cHead = head.current;
    cTorso.rotation.x = smoothLean.current;
    cTorso.rotation.z = 0;
    const bob = Math.abs(cosp) * 0.03 * (0.4 + amp);
    cTorso.position.y = 0.92 + bob;
    // shoulders twist opposite the hips (counter-rotation), more at speed
    cChest.rotation.y = -sinp * 0.15 * (0.35 + amp);
    // head stays roughly upright & forward (stabilization)
    cHead.rotation.x = -smoothLean.current * 0.55 + Math.sin(ph * 2) * 0.01;
    cHead.rotation.y = -cChest.rotation.y * 0.6;
    cHead.rotation.z = 0;

    // ---- believable idle: breathing, weight shift, relaxed limbs ----
    if (!running) {
      const bt = t * 1.4 + phase.current;
      const breath = Math.sin(bt) * 0.017;
      cTorso.position.y = 0.92 + breath;
      cTorso.rotation.x = 0.03 + Math.sin(bt * 0.7) * 0.01;
      const shift = Math.sin(t * 0.55 + phase.current);
      cTorso.rotation.z = shift * 0.03;
      cChest.rotation.y = Math.sin(t * 0.5 + phase.current) * 0.04;
      cChest.scale.y = 1 + breath * 0.5;
      cL.rotation.x *= 0.08;
      cR.rotation.x *= 0.08;
      sL.rotation.x = 0.07;
      sR.rotation.x = 0.07;
      fL.rotation.x = 0.05;
      fR.rotation.x = 0.05;
      aL.rotation.x = 0.03 + Math.sin(bt) * 0.02;
      aR.rotation.x = 0.03 - Math.sin(bt) * 0.02;
      aL.rotation.z = 0.13;
      aR.rotation.z = -0.13;
      foreL.current.rotation.x = 0.22;
      foreR.current.rotation.x = 0.22;
      cHead.rotation.x = Math.sin(bt * 0.5) * 0.03;
      cHead.rotation.y = shift * 0.08;
    } else {
      cChest.scale.y = 1;
    }

    // ---- action poses (kick / celebrate / save / reach) ----
    const pose = activePose(actorEvents, t);
    if (pose) {
      applyPose(pose, {
        legL: cL,
        legR: cR,
        shinR: sR,
        armL: aL,
        armR: aR,
        torso: cTorso,
        chest: cChest,
        head: cHead,
      });
    }
  });

  return (
    <group
      ref={(o) => {
        if (o) {
          root.current = o;
          registerRef?.(id, o);
          o.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) c.castShadow = true;
          });
        }
      }}
    >
      {/* torso pivots around the pelvis */}
      <group ref={torso} position={[0, 0.92, 0]}>
        <mesh geometry={geo.pelvis} position={[0, 0.03, 0]} material={mats.shorts} castShadow />

        {/* chest carries the counter-rotating upper body */}
        <group ref={chest}>
          <mesh
            geometry={geo.abdomen}
            position={[0, 0.15, 0]}
            scale={[0.98, 1, 0.72]}
            material={mats.jersey}
          />
          <mesh
            geometry={geo.chest}
            position={[0, 0.33, 0]}
            scale={[1.06, 1, 0.74]}
            material={mats.jersey}
            castShadow
          />
          {/* back number */}
          <mesh
            geometry={geo.numberPlane}
            position={[0, 0.34, -0.128]}
            rotation={[0, Math.PI, 0]}
            material={numberMat}
          />
          {/* collar */}
          <mesh geometry={geo.collar} position={[0, 0.49, 0]} material={mats.trim} />
          <mesh geometry={geo.neck} position={[0, 0.5, 0]} material={mats.skin} />

          {/* head */}
          <group ref={head} position={[0, 0.6, 0]}>
            <mesh geometry={geo.head} scale={[1, 1.1, 1.02]} material={mats.skin} castShadow />
            <mesh geometry={geo.hair} position={[0, 0.012, -0.006]} material={mats.hair} />
            <mesh geometry={geo.ear} position={[0.108, 0, 0.008]} material={mats.skin} />
            <mesh geometry={geo.ear} position={[-0.108, 0, 0.008]} material={mats.skin} />
          </group>

          {/* arms attach at the shoulders */}
          <group ref={armL} position={[0.205, 0.5, 0]}>
            <mesh geometry={geo.shoulder} material={mats.jersey} />
            <mesh geometry={geo.sleeve} position={[0, -0.09, 0]} material={mats.jersey} />
            <mesh geometry={geo.upperArm} position={[0, -0.21, 0]} material={mats.skin} />
            <group ref={foreL} position={[0, -0.32, 0]}>
              <mesh geometry={geo.elbow} material={mats.skin} />
              <mesh geometry={geo.lowerArm} position={[0, -0.15, 0]} material={mats.skin} />
              <mesh
                geometry={handGeo}
                position={[0, -0.29, 0.01]}
                scale={[0.9, 1.25, 0.72]}
                material={handMat}
              />
            </group>
          </group>
          <group ref={armR} position={[-0.205, 0.5, 0]}>
            <mesh geometry={geo.shoulder} material={mats.jersey} />
            <mesh geometry={geo.sleeve} position={[0, -0.09, 0]} material={mats.jersey} />
            <mesh geometry={geo.upperArm} position={[0, -0.21, 0]} material={mats.skin} />
            <group ref={foreR} position={[0, -0.32, 0]}>
              <mesh geometry={geo.elbow} material={mats.skin} />
              <mesh geometry={geo.lowerArm} position={[0, -0.15, 0]} material={mats.skin} />
              <mesh
                geometry={handGeo}
                position={[0, -0.29, 0.01]}
                scale={[0.9, 1.25, 0.72]}
                material={handMat}
              />
            </group>
          </group>
        </group>
      </group>

      {/* legs attach at the hips (~0.86m) */}
      <group ref={legL} position={[0.11, 0.86, 0]}>
        <mesh geometry={geo.shortsLeg} position={[0, -0.07, 0]} material={mats.shorts} />
        <mesh geometry={geo.thigh} position={[0, -0.23, 0]} material={mats.skin} />
        <group ref={shinL} position={[0, -0.38, 0]}>
          <mesh geometry={geo.knee} material={mats.skin} />
          <mesh geometry={geo.shin} position={[0, -0.19, 0]} material={mats.socks} />
          <mesh geometry={geo.sockCuff} position={[0, -0.05, 0]} material={mats.trim} />
          <group ref={footL} position={[0, -0.4, 0]}>
            <mesh geometry={geo.bootBody} position={[0, -0.03, 0.04]} material={mats.boot} castShadow />
            <mesh
              geometry={geo.bootToe}
              position={[0, -0.035, 0.13]}
              scale={[0.9, 0.72, 1]}
              material={mats.boot}
            />
          </group>
        </group>
      </group>
      <group ref={legR} position={[-0.11, 0.86, 0]}>
        <mesh geometry={geo.shortsLeg} position={[0, -0.07, 0]} material={mats.shorts} />
        <mesh geometry={geo.thigh} position={[0, -0.23, 0]} material={mats.skin} />
        <group ref={shinR} position={[0, -0.38, 0]}>
          <mesh geometry={geo.knee} material={mats.skin} />
          <mesh geometry={geo.shin} position={[0, -0.19, 0]} material={mats.socks} />
          <mesh geometry={geo.sockCuff} position={[0, -0.05, 0]} material={mats.trim} />
          <group ref={footR} position={[0, -0.4, 0]}>
            <mesh geometry={geo.bootBody} position={[0, -0.03, 0.04]} material={mats.boot} castShadow />
            <mesh
              geometry={geo.bootToe}
              position={[0, -0.035, 0.13]}
              scale={[0.9, 0.72, 1]}
              material={mats.boot}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

// ------------------------------- pose system ---------------------------------

interface PoseState {
  kind: 'kick' | 'celebrate' | 'save' | 'reach';
  w: number; // 0..1 blend weight
}

interface PoseRefs {
  legL: THREE.Group;
  legR: THREE.Group;
  shinR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  torso: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
}

function activePose(events: MatchEvent[], t: number): PoseState | null {
  // find the most relevant recent/upcoming actor event
  for (const e of events) {
    const dt = t - e.t;
    if (e.animIntent === 'celebration') {
      // celebration lasts a few seconds after a goal
      if (dt >= 0 && dt < 4.2) return { kind: 'celebrate', w: smoothPulse(dt, 0.3, 3.6, 4.2) };
    } else if (e.animIntent === 'shot_finish' || e.type === 'pass') {
      if (dt >= -0.12 && dt < 0.4) return { kind: 'kick', w: smoothPulse(dt + 0.12, 0.08, 0.2, 0.52) };
    } else if (e.animIntent === 'save') {
      if (dt >= -0.1 && dt < 0.6) return { kind: 'save', w: smoothPulse(dt + 0.1, 0.1, 0.35, 0.7) };
    } else if (e.animIntent === 'dunk' || e.animIntent === 'jumpshot') {
      if (dt >= -0.1 && dt < 0.5) return { kind: 'reach', w: smoothPulse(dt + 0.1, 0.08, 0.3, 0.6) };
    }
  }
  return null;
}

// ramp up then hold then down, within [0,end]
function smoothPulse(x: number, up: number, holdEnd: number, end: number): number {
  if (x < up) return THREE.MathUtils.smoothstep(x, 0, up);
  if (x < holdEnd) return 1;
  return 1 - THREE.MathUtils.smoothstep(x, holdEnd, end);
}

function applyPose(p: PoseState, r: PoseRefs) {
  const w = p.w;
  const lerp = (o: THREE.Object3D, prop: 'x' | 'y' | 'z', target: number) => {
    (o.rotation as any)[prop] = THREE.MathUtils.lerp((o.rotation as any)[prop], target, w);
  };
  if (p.kind === 'kick') {
    lerp(r.legR, 'x', -1.25);
    r.shinR.rotation.x = THREE.MathUtils.lerp(r.shinR.rotation.x, 0.15, w);
    lerp(r.armL, 'x', 0.8);
    lerp(r.chest, 'y', -0.25);
    lerp(r.torso, 'x', 0.12);
  } else if (p.kind === 'celebrate') {
    lerp(r.armL, 'x', -2.6);
    lerp(r.armR, 'x', -2.6);
    lerp(r.armL, 'z', 0.5);
    lerp(r.armR, 'z', -0.5);
    lerp(r.torso, 'x', -0.16);
    lerp(r.head, 'x', -0.2);
  } else if (p.kind === 'save') {
    lerp(r.armL, 'x', -2.2);
    lerp(r.armR, 'x', -2.2);
    lerp(r.armL, 'z', 0.35);
    lerp(r.armR, 'z', -0.35);
    lerp(r.torso, 'x', -0.3);
  } else if (p.kind === 'reach') {
    lerp(r.armR, 'x', -2.8);
    lerp(r.armL, 'x', -1.0);
    lerp(r.torso, 'x', -0.12);
    lerp(r.head, 'x', -0.15);
  }
}

// ------------------------------- color util ----------------------------------

function mixHex(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, t).getHexString();
}
