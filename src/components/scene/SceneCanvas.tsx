'use client';

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { MatchModel } from '@/state/match';
import Scene from './Scene';

export default function SceneCanvas({ model }: { model: MatchModel }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      camera={{ fov: 40, near: 0.5, far: 2200, position: [0, 34, 96] }}
    >
      <Scene model={model} />
    </Canvas>
  );
}
