'use client';

/**
 * Skeletal athlete — the real-character replacement for the primitive rig.
 *
 * Source: /models/characters/athlete.glb (CC0 Quaternius base character with
 * 13 retargeted clips — see public/models/CREDITS.md). Each player is a
 * SkeletonUtils.clone with per-kit CLONED materials tinted by material name
 * (Jersey/Shorts/Socks/Boots/Skin/Hair — names authored by the build script).
 *
 * Animation is driven by MATCH TIME, not wall clock: the mixer advances by the
 * playhead delta each frame, so pause freezes mid-stride, rewind plays
 * backwards, and slow-mo is automatically slow. A speed-driven state machine
 * crossfades idle/walk/jog/sprint and scales clip timeScale by ground speed so
 * feet track the ground (no skating). Match events blend full-body clips
 * (celebrate / dive) or additive bone overlays (kick — authored in code, the
 * pack has no kick clip) on top of locomotion.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { KitSpec, MatchEvent, Sample, Sport, Track } from '@/ir/types';
import { sampleTrack } from '@/ir/sampler';
import { playhead, povTarget } from '@/state/clock';

useGLTF.preload('/models/characters/athlete.glb');

const tmpSample: Sample = { x: 0, y: 0, z: 0, speed: 0, heading: 0, action: 0 };

// the exported character faces +Z in glTF, which matches the sim's heading
// convention (heading 0 = +Z) — no yaw correction needed. (A PI offset here
// made every athlete run backwards.)
const YAW_OFFSET = 0;

// locomotion states, thresholds and the ground speed each clip was authored at
const LOCO = [
  { name: 'idle', maxSpeed: 0.35, ref: 1 },
  { name: 'walk', maxSpeed: 1.9, ref: 1.35 },
  { name: 'jog', maxSpeed: 4.4, ref: 3.1 },
  { name: 'sprint', maxSpeed: Infinity, ref: 6.6 },
] as const;

const HAIR_COLORS = ['#181310', '#0d0d10', '#2a1c12', '#3c2a19', '#5a3d22', '#7a5a34'];

function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function variedSkin(hex: string, r: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const l = THREE.MathUtils.clamp(hsl.l + (r - 0.5) * 0.14, 0.28, 0.82);
  const h = (hsl.h + (r - 0.5) * 0.015 + 1) % 1;
  const s = THREE.MathUtils.clamp(hsl.s + (r - 0.5) * 0.06, 0.15, 0.9);
  c.setHSL(h, s, l);
  return c;
}

function mixHex(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, t).getHexString();
}

// shared canvas number textures (from the old renderer — cached app-lifetime)
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
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  numberMatCache.set(key, mat);
  return mat;
}

interface AthleteProps {
  id: string;
  track: Track;
  kit: KitSpec;
  number: number;
  isGK?: boolean;
  events?: MatchEvent[];
  sport?: Sport;
}

// ---- tennis racket prop (procedural, parented to the right hand bone) ----

const racketMats = {
  frame: new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.35, metalness: 0.5 }),
  grip: new THREE.MeshStandardMaterial({ color: '#2e3138', roughness: 0.9 }),
  strings: new THREE.MeshStandardMaterial({
    color: '#dfe3ea',
    roughness: 0.6,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
};

/** Racket built along +Y (grip at the hand, head at the tip). */
function buildRacket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'racket';
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.2, 10), racketMats.grip);
  grip.position.y = 0.08;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.14, 8), racketMats.frame);
  shaft.position.y = 0.24;
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.013, 10, 28), racketMats.frame);
  head.position.y = 0.46;
  head.scale.set(1, 1.22, 1);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.128, 24), racketMats.strings);
  strings.position.y = 0.46;
  strings.scale.set(1, 1.22, 1);
  g.add(grip, shaft, head, strings);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}

interface OverlayState {
  kind: 'kick' | 'reach' | 'swing';
  w: number;
}

function smoothPulse(x: number, up: number, holdEnd: number, end: number): number {
  if (x < up) return THREE.MathUtils.smoothstep(x, 0, up);
  if (x < holdEnd) return 1;
  return 1 - THREE.MathUtils.smoothstep(x, holdEnd, end);
}

export default function Athlete({ id, track, kit, number, isGK, events, sport }: AthleteProps) {
  const root = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/models/characters/athlete.glb');

  // one skeleton clone per player, with per-player tinted materials
  const obj = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Group;
    const skinColor = variedSkin(kit.skin, hash01(id, 11));
    const hair = HAIR_COLORS[Math.floor(hash01(id, 23) * HAIR_COLORS.length)];
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false; // skinned bounds lag the pose; avoid pop-out
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const tinted = mats.map((src) => {
        const mat = (src as THREE.MeshStandardMaterial).clone();
        switch (mat.name.split('.')[0]) {
          case 'Jersey':
            mat.color.set(isGK ? mixHex(kit.primary, '#101014', 0.55) : kit.primary);
            mat.roughness = 0.68;
            break;
          case 'Shorts':
            mat.color.set(isGK ? mixHex(kit.shorts, '#101014', 0.4) : kit.shorts);
            mat.roughness = 0.72;
            break;
          case 'Socks':
            mat.color.set(kit.socks);
            mat.roughness = 0.78;
            break;
          case 'Boots':
            mat.color.set('#0b0b10');
            mat.roughness = 0.4;
            break;
          case 'Skin':
            mat.color.copy(skinColor);
            mat.roughness = 0.62;
            break;
          case 'Hair':
            mat.color.set(hair);
            mat.roughness = 0.85;
            break;
        }
        return mat;
      });
      m.material = tinted.length === 1 ? tinted[0] : tinted;
    });
    return c;
  }, [scene, kit, isGK, id]);

  // back number: small decal plane parented to the upper spine bone
  useEffect(() => {
    const spine = obj.getObjectByName('spine_03') ?? obj.getObjectByName('spine_02');
    if (!spine) return;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.3), numberMaterial(number, kit.numberColor));
    plane.name = 'backnumber';
    plane.position.set(0, 0.08, -0.16);
    plane.rotation.y = Math.PI;
    spine.add(plane);
    return () => {
      spine.remove(plane);
      plane.geometry.dispose();
    };
  }, [obj, number, kit.numberColor]);

  // tennis: racket in the right hand (geometry disposed on unmount; materials
  // are shared module-lifetime)
  useEffect(() => {
    if (sport !== 'tennis') return;
    const hand = obj.getObjectByName('hand_r');
    if (!hand) return;
    const racket = buildRacket();
    // align the racket with the fingers, blade angled like a natural grip
    racket.rotation.set(0.35, 0, 0.15);
    racket.position.set(0, 0.04, 0.01);
    hand.add(racket);
    return () => {
      hand.remove(racket);
      racket.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    };
  }, [obj, sport]);

  // dispose cloned materials on unmount
  useEffect(() => {
    return () => {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((x) => x && (x as THREE.Material).dispose());
        }
      });
    };
  }, [obj]);

  const mixer = useMemo(() => new THREE.AnimationMixer(obj), [obj]);
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>();
    for (const clip of animations) {
      const a = mixer.clipAction(clip);
      a.enabled = false;
      map.set(clip.name, a);
    }
    return map;
  }, [animations, mixer]);

  const state = useRef({
    loco: '',
    fullBody: '' as '' | 'celebrate' | 'dive' | 'hit',
    prevT: playhead.t,
    phase: hash01(id, 7) * 2, // desync loop starts between players
  });

  const actorEvents = useMemo(
    () => (events ?? []).filter((e) => e.actor === id).sort((a, b) => a.t - b.t),
    [events, id]
  );

  // bones for procedural overlays
  const bones = useMemo(() => {
    return {
      thighR: obj.getObjectByName('thigh_r') as THREE.Object3D | null,
      calfR: obj.getObjectByName('calf_r') as THREE.Object3D | null,
      upperarmL: obj.getObjectByName('upperarm_l') as THREE.Object3D | null,
      upperarmR: obj.getObjectByName('upperarm_r') as THREE.Object3D | null,
      spine: obj.getObjectByName('spine_02') as THREE.Object3D | null,
    };
  }, [obj]);

  function setLoco(name: string, fade: number) {
    if (state.current.loco === name) return;
    const prev = actions.get(state.current.loco);
    const next = actions.get(name);
    if (next) {
      next.enabled = true;
      next.reset();
      next.time = state.current.phase % (next.getClip().duration || 1);
      next.play();
      if (prev && prev.enabled) {
        prev.crossFadeTo(next, fade, false);
      } else {
        next.setEffectiveWeight(1);
      }
    }
    state.current.loco = name;
  }

  function setFullBody(name: '' | 'celebrate' | 'dive' | 'hit') {
    if (state.current.fullBody === name) return;
    const prevName = state.current.fullBody;
    const prev = prevName ? actions.get(prevName) : undefined;
    if (prev) prev.fadeOut(0.18);
    if (name) {
      const a = actions.get(name);
      if (a) {
        a.enabled = true;
        a.reset();
        a.setLoop(name === 'celebrate' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = true;
        a.fadeIn(0.15);
        a.play();
      }
    }
    state.current.fullBody = name;
  }

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    // the POV camera hides the body it's looking through
    g.visible = povTarget.id !== id;
    const t = playhead.t;
    let dtm = t - state.current.prevT;
    state.current.prevT = t;
    if (Math.abs(dtm) > 0.5) dtm = 0; // seek guard

    const s = sampleTrack(track, t, tmpSample);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.heading + YAW_OFFSET;

    // ---- full-body event clips (celebrate / dive / tackle-hit) ----
    let fullBody: '' | 'celebrate' | 'dive' | 'hit' = '';
    for (const e of actorEvents) {
      const dt = t - e.t;
      if (e.animIntent === 'celebration' && dt >= 0 && dt < 4.2) fullBody = 'celebrate';
      else if (e.animIntent === 'save' && dt >= -0.15 && dt < 1.0) fullBody = 'dive';
      else if (e.type === 'tackle' && dt >= -0.05 && dt < 0.55) fullBody = 'hit';
    }
    setFullBody(fullBody);

    // ---- locomotion state machine ----
    if (!fullBody) {
      const speed = s.speed;
      let pick: (typeof LOCO)[number] = LOCO[LOCO.length - 1];
      for (const l of LOCO) {
        if (speed <= l.maxSpeed) {
          pick = l;
          break;
        }
      }
      const name = pick.name === 'idle' && isGK ? 'ready' : pick.name;
      setLoco(name, 0.22);
      const a = actions.get(name);
      if (a) {
        // stride-rate matching: play the cycle at the ratio of actual ground
        // speed to the clip's authored speed → feet grip the ground
        const ts = pick.name === 'idle' ? 1 : THREE.MathUtils.clamp(speed / pick.ref, 0.55, 1.7);
        a.setEffectiveTimeScale(ts);
      }
    }

    mixer.update(dtm);

    // ---- procedural overlays (post-mixer additive bone rotations) ----
    let overlay: OverlayState | null = null;
    for (const e of actorEvents) {
      const dt = t - e.t;
      if ((e.animIntent === 'shot_finish' || e.type === 'pass') && dt >= -0.12 && dt < 0.42) {
        overlay = { kind: 'kick', w: smoothPulse(dt + 0.12, 0.08, 0.22, 0.54) };
      } else if ((e.animIntent === 'dunk' || e.animIntent === 'jumpshot') && dt >= -0.1 && dt < 0.5) {
        overlay = { kind: 'reach', w: smoothPulse(dt + 0.1, 0.08, 0.3, 0.6) };
      } else if (
        (e.animIntent === 'serve' || e.animIntent === 'forehand' || e.animIntent === 'backhand') &&
        dt >= -0.1 &&
        dt < 0.4
      ) {
        overlay = { kind: 'swing', w: smoothPulse(dt + 0.1, 0.06, 0.2, 0.5) };
      }
    }
    if (overlay && overlay.w > 0.001) {
      const w = overlay.w;
      if (overlay.kind === 'kick') {
        if (bones.thighR) bones.thighR.rotation.x -= w * 1.15; // leg whips forward
        if (bones.calfR) bones.calfR.rotation.x += w * 0.35;
        if (bones.upperarmL) bones.upperarmL.rotation.x -= w * 0.5; // balance arm
        if (bones.spine) bones.spine.rotation.x += w * 0.18;
      } else if (overlay.kind === 'reach' || overlay.kind === 'swing') {
        if (bones.upperarmR) {
          bones.upperarmR.rotation.x -= w * (overlay.kind === 'reach' ? 2.2 : 1.4);
          bones.upperarmR.rotation.z -= w * 0.3;
        }
        if (bones.spine) bones.spine.rotation.x -= w * 0.12;
      }
    }
  });

  return (
    <group ref={root}>
      <primitive object={obj} />
    </group>
  );
}
