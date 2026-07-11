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

  useFrame(() => {
    const m = roller.current;
    if (!m) return;
    const t = playhead.t;
    const s = sampleTrack(track, t, tmp);
    m.position.set(s.x, Math.max(radius, s.y), s.z);

    // scrub-safe rolling: rotate by ground distance / radius about the travel-perp axis
    const dtm = t - prev.current.t;
    const dx = s.x - prev.current.x;
    const dz = s.z - prev.current.z;
    const wasInit = prev.current.init;
    prev.current.t = t;
    prev.current.x = s.x;
    prev.current.z = s.z;
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
      width={radius * 16}
      length={4}
      color={new THREE.Color(trailColor)}
      attenuation={(w) => w * w * w}
      decay={1.8}
    >
      <group ref={roller}>
        <Suspense fallback={<SphereBall radius={radius} mat={fallbackMat} />}>{visual}</Suspense>
      </group>
    </Trail>
  );
}
