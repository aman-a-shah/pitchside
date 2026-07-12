'use client';

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { MatchModel } from '@/state/match';
import Scene from './Scene';

export default function SceneCanvas({
  model,
  onReady,
}: {
  model: MatchModel;
  onReady?: () => void;
}) {
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
      onCreated={(state) => {
        // automation hook (same channel as clock/model) — headless QA reads
        // camera pose to verify shot grammar and the first-person body feel
        if (typeof window !== 'undefined') {
          const w = window as unknown as { __pitchside?: Record<string, unknown> };
          w.__pitchside = { ...(w.__pitchside ?? {}), camera: state.camera };
        }
        onReady?.();
      }}
    >
      <Scene model={model} />
    </Canvas>
  );
}
