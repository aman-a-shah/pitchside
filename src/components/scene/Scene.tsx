'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MatchModel, MatchProvider } from '@/state/match';
import { themeFor } from './theme';
import ClockDriver from './ClockDriver';
import Sky from './Sky';
import Lighting from './Lighting';
import Field from './Field';
import Stadium from './Stadium';
import Atmosphere from './Atmosphere';
import Entities from './Entities';
import CameraRig from './CameraRig';
import PostFX from './PostFX';

export default function Scene({ model }: { model: MatchModel }) {
  const theme = themeFor(model.ir.meta.mood);
  const { length, width } = model.ir.fieldSpec;

  return (
    <MatchProvider model={model}>
      <ExposureSetter exposure={theme.exposure} />
      <color attach="background" args={[theme.skyBottom]} />
      <fog attach="fog" args={[theme.fog, theme.fogNear, theme.fogFar]} />

      <ClockDriver />
      <Sky theme={theme} />
      <Lighting theme={theme} fieldLength={length} fieldWidth={width} />

      {/* large ground beneath everything to hide the void past the stands */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={theme.hemiGround} roughness={1} />
      </mesh>

      <Field theme={theme} />
      <Stadium sport={model.ir.sport} theme={theme} fieldLength={length} fieldWidth={width} />
      <Atmosphere
        mood={model.ir.meta.mood ?? 'night'}
        sport={model.ir.sport}
        fieldLength={length}
        fieldWidth={width}
      />
      <Entities />
      <CameraRig />
      <PostFX mood={model.ir.meta.mood ?? 'night'} era={model.ir.meta.era ?? 'modern'} />
    </MatchProvider>
  );
}

function ExposureSetter({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}
