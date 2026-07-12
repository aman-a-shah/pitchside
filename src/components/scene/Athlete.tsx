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

// ---- goalkeeper glove prop (parented to the hand bones) ----

// shared module-lifetime material, like the racket's
const gloveMat = new THREE.MeshStandardMaterial({ color: '#e8eaee', roughness: 0.82 });

/** Ellipsoid stretched along the fingers (hand-local +Y), padded like a real
 * keeper glove — deliberately oversized so it reads at broadcast distance. */
function gloveGeometry(): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(0.048, 12, 10);
  g.scale(1.25, 1.7, 0.85);
  return g;
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
  kind: 'kick' | 'reach' | 'swing' | 'throw' | 'header';
  w: number;
  /** release/flick weight for two-beat moves (throw snap, header contact) */
  w2?: number;
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
    // stature varies player to player — identical clones read as clones
    const stature = 0.955 + hash01(id, 31) * 0.09;
    c.scale.multiplyScalar(stature);
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
            mat.color.set(
              isGK ? (kit.gk?.primary ?? mixHex(kit.primary, '#101014', 0.55)) : kit.primary
            );
            mat.roughness = 0.68;
            break;
          case 'Shorts':
            mat.color.set(
              isGK ? (kit.gk?.shorts ?? mixHex(kit.shorts, '#101014', 0.4)) : kit.shorts
            );
            mat.roughness = 0.72;
            break;
          case 'Socks':
            mat.color.set(isGK ? (kit.gk?.socks ?? kit.socks) : kit.socks);
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
  const numberColor = (isGK && kit.gk?.numberColor) || kit.numberColor;
  useEffect(() => {
    const spine = obj.getObjectByName('spine_03') ?? obj.getObjectByName('spine_02');
    if (!spine) return;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.3), numberMaterial(number, numberColor));
    plane.name = 'backnumber';
    plane.position.set(0, 0.08, -0.16);
    plane.rotation.y = Math.PI;
    spine.add(plane);
    return () => {
      spine.remove(plane);
      plane.geometry.dispose();
    };
  }, [obj, number, numberColor]);

  // goalkeeper gloves: chunky ellipsoids over each hand bone (the athlete mesh
  // has no separate hand material to tint, so the gloves are added geometry)
  useEffect(() => {
    if (!isGK) return;
    const added: { bone: THREE.Object3D; mesh: THREE.Mesh }[] = [];
    for (const name of ['hand_l', 'hand_r']) {
      const hand = obj.getObjectByName(name);
      if (!hand) continue;
      const mesh = new THREE.Mesh(gloveGeometry(), gloveMat);
      mesh.name = 'gkglove';
      mesh.position.set(0, 0.05, 0.005);
      mesh.castShadow = true;
      hand.add(mesh);
      added.push({ bone: hand, mesh });
    }
    return () => {
      for (const { bone, mesh } of added) {
        bone.remove(mesh);
        mesh.geometry.dispose();
      }
    };
  }, [obj, isGK]);

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
    /** additive bone rotations applied last frame, so they can be undone —
     * the mixer only rewrites bone transforms while clip time advances, so
     * on paused frames an un-undone additive accumulates without bound */
    overlayApplied: [] as [string, 'x' | 'y' | 'z', number][],
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
      lowerarmL: obj.getObjectByName('lowerarm_l') as THREE.Object3D | null,
      lowerarmR: obj.getObjectByName('lowerarm_r') as THREE.Object3D | null,
      spine: obj.getObjectByName('spine_02') as THREE.Object3D | null,
      neck: obj.getObjectByName('neck_01') as THREE.Object3D | null,
      head: obj.getObjectByName('Head') as THREE.Object3D | null,
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

    // undo last frame's additive overlay BEFORE the mixer runs: while playing
    // the mixer overwrites this anyway; while paused it does not, and the
    // overlay would otherwise compound every frame
    for (const [k, axis, v] of state.current.overlayApplied) {
      const b = bones[k as keyof typeof bones];
      if (b) b.rotation[axis] -= v;
    }
    state.current.overlayApplied.length = 0;

    mixer.update(dtm);

    // ---- procedural overlays (post-mixer additive bone rotations) ----
    let overlay: OverlayState | null = null;
    for (const e of actorEvents) {
      const dt = t - e.t;
      // kick only for genuinely footed strikes — throw-ins and headers are
      // pass events too, but they carry their own intents
      if ((e.animIntent === 'shot_finish' || e.animIntent === 'pass') && dt >= -0.12 && dt < 0.42) {
        overlay = { kind: 'kick', w: smoothPulse(dt + 0.12, 0.08, 0.22, 0.54) };
      } else if (e.animIntent === 'throw' && dt >= -0.7 && dt < 0.5) {
        // long windup: ball raised behind the head, held, then snapped through
        overlay = {
          kind: 'throw',
          w: smoothPulse(dt + 0.7, 0.25, 0.95, 1.2),
          w2: dt >= -0.08 ? smoothPulse(dt + 0.08, 0.07, 0.18, 0.45) : 0,
        };
      } else if (e.animIntent === 'header' && dt >= -0.3 && dt < 0.55) {
        // rise, arch back, flick the head through the ball at contact
        overlay = {
          kind: 'header',
          w: smoothPulse(dt + 0.3, 0.16, 0.4, 0.85),
          w2: dt >= -0.06 ? smoothPulse(dt + 0.06, 0.05, 0.15, 0.36) : 0,
        };
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
      // every additive is recorded so next frame can undo it (see above)
      const addRot = (key: keyof typeof bones, d: number, axis: 'x' | 'y' | 'z' = 'x') => {
        const b = bones[key];
        if (!b) return;
        b.rotation[axis] += d;
        state.current.overlayApplied.push([key, axis, d]);
      };
      if (overlay.kind === 'kick') {
        addRot('thighR', -w * 1.15); // leg whips forward
        addRot('calfR', w * 0.35);
        addRot('upperarmL', -w * 0.5); // balance arm
        addRot('spine', w * 0.18);
      } else if (overlay.kind === 'throw') {
        // this rig: upperarm x+ raises the arm, lowerarm x- curls the fist
        // up; trunk pitch is z (z- arches back, z+ snaps forward)
        // — both hands overhead, back arched, then the trunk whips the ball
        // out while the arms stay high (dropping them reads as flapping)
        const rel = overlay.w2 ?? 0;
        addRot('upperarmL', w * (2.45 - rel * 0.35));
        addRot('upperarmR', w * (2.45 - rel * 0.35));
        addRot('lowerarmL', -w * (0.85 - rel * 0.5));
        addRot('lowerarmR', -w * (0.85 - rel * 0.5));
        addRot('spine', -w * 0.25 + rel * 0.5, 'z');
        addRot('neck', -w * 0.15 + rel * 0.25, 'z');
      } else if (overlay.kind === 'header') {
        // leave the ground, arch back, then snap head and shoulders through
        // the ball — the flick lives mostly in the neck
        const flick = overlay.w2 ?? 0;
        g.position.y += w * 0.25;
        addRot('spine', -w * 0.28 + flick * 0.5, 'z');
        addRot('neck', -w * 0.38 + flick * 0.85, 'z');
        addRot('head', -w * 0.18 + flick * 0.5, 'z');
        addRot('upperarmL', w * 0.9); // arms brace wide for balance
        addRot('upperarmR', w * 0.9);
      } else if (overlay.kind === 'reach' || overlay.kind === 'swing') {
        addRot('upperarmR', -w * (overlay.kind === 'reach' ? 2.2 : 1.4));
        addRot('upperarmR', -w * 0.3, 'z');
        addRot('spine', -w * 0.12);
      }
    }
  });

  return (
    <group ref={root}>
      <primitive object={obj} />
    </group>
  );
}
