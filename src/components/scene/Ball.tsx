'use client';

import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Trail, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Sample, Sport, Track } from '@/ir/types';
import { sampleTrack } from '@/ir/sampler';
import { playhead } from '@/state/clock';

const tmp: Sample = { x: 0, y: 0, z: 0, speed: 0, heading: 0, action: 0 };
const RADII: Record<Sport, number> = { soccer: 0.11, basketball: 0.12, tennis: 0.034 };

useGLTF.preload('/models/soccerball.glb');
useGLTF.preload('/models/basketball.glb');

/** A Blender-authored GLB ball (unit radius), scaled + shadowed for the scene. */
function GltfBall({ url, radius }: { url: string; radius: number }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
      }
    });
    return c;
  }, [scene]);
  return <primitive object={obj} scale={radius} />;
}

/** Fallback / tennis: a simple shaded sphere. */
function SphereBall({ radius, mat }: { radius: number; mat: THREE.Material }) {
  const geo = useMemo(() => new THREE.SphereGeometry(radius, 24, 18), [radius]);
  return <mesh geometry={geo} material={mat} castShadow />;
}

export default function Ball({ track, sport }: { track: Track; sport: Sport }) {
  const roller = useRef<THREE.Group>(null!);
  const prev = useRef({ t: playhead.t, x: 0, z: 0, init: false });
  const smooth = useRef({ pos: new THREE.Vector3(), init: false });
  const radius = RADII[sport];

  const fallbackMat = useMemo(() => {
    if (sport === 'basketball') {
      return new THREE.MeshStandardMaterial({ color: '#a5461b', roughness: 0.8 });
    }
    if (sport === 'tennis') {
      return new THREE.MeshStandardMaterial({
        color: '#d3e64a',
        roughness: 0.85,
        emissive: '#20320a',
        emissiveIntensity: 0.1,
      });
    }
    return new THREE.MeshStandardMaterial({ color: '#f4f6fa', roughness: 0.45 });
  }, [sport]);

  useFrame((_, delta) => {
    const m = roller.current;
    if (!m) return;
    const t = playhead.t;
    const s = sampleTrack(track, t, tmp);
    const target = new THREE.Vector3(s.x, Math.max(radius, s.y), s.z);

    // Low-pass the sampled position: tracks are stored at 25Hz and linear
    // interpolation between samples leaves visible velocity kinks / jitter at
    // 60–120fps render rates. A short (~70ms) exponential smoothing rides out
    // the kinks without noticeably lagging fast shots. Snap on seeks or
    // genuine teleports so the ball never "lasers" across the field.
    const sm = smooth.current;
    const dtm = t - prev.current.t;
    if (!sm.init || Math.abs(dtm) > 0.5 || sm.pos.distanceTo(target) > 12) {
      sm.pos.copy(target);
      sm.init = true;
    } else {
      sm.pos.lerp(target, 1 - Math.exp(-Math.min(delta, 0.1) * 14));
    }
    m.position.copy(sm.pos);

    // scrub-safe rolling: rotate by ground distance / radius about the travel-perp axis
    const dx = sm.pos.x - prev.current.x;
    const dz = sm.pos.z - prev.current.z;
    const wasInit = prev.current.init;
    prev.current.t = t;
    prev.current.x = sm.pos.x;
    prev.current.z = sm.pos.z;
    prev.current.init = true;
    if (wasInit && Math.abs(dtm) < 0.5) {
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        const ax = -dz / d;
        const az = dx / d;
        const angle = d / radius;
        m.rotateOnWorldAxis(new THREE.Vector3(ax, 0, az), angle);
      }
    }
  });

  const trailColor = sport === 'basketball' ? '#ff9a4d' : sport === 'tennis' ? '#e8ff6a' : '#eaf1ff';

  const visual =
    sport === 'soccer' ? (
      <GltfBall url="/models/soccerball.glb" radius={radius} />
    ) : sport === 'basketball' ? (
      <GltfBall url="/models/basketball.glb" radius={radius} />
    ) : (
      <SphereBall radius={radius} mat={fallbackMat} />
    );

  return (
    <Trail
      width={radius * 9}
      length={2.6}
      color={new THREE.Color(trailColor)}
      attenuation={(w) => w * w * w}
      decay={2.4}
    >
      <group ref={roller}>
        <Suspense fallback={<SphereBall radius={radius} mat={fallbackMat} />}>{visual}</Suspense>
      </group>
    </Trail>
  );
}
