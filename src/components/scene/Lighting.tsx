'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { Environment, Lightformer } from '@react-three/drei';
import { SceneTheme } from './theme';

/**
 * Lighting rig: a key/sun directional light with a field-sized shadow frustum,
 * ambient + hemisphere fill, and an image-based-lighting environment authored
 * from Lightformers (procedural — no remote HDRI). Floodlit moods add bright
 * overhead formers for crisp reflections/highlights.
 */
export default function Lighting({
  theme,
  fieldLength,
  fieldWidth,
}: {
  theme: SceneTheme;
  fieldLength: number;
  fieldWidth: number;
}) {
  const sun = useRef<THREE.DirectionalLight>(null!);
  const shadowSpan = Math.max(fieldLength, fieldWidth) * 0.62;

  return (
    <>
      <ambientLight color={theme.ambientColor} intensity={theme.ambientIntensity} />
      <hemisphereLight
        color={theme.hemiSky}
        groundColor={theme.hemiGround}
        intensity={theme.hemiIntensity}
      />

      <directionalLight
        ref={sun}
        position={theme.sunPos}
        color={theme.sunColor}
        intensity={theme.sunIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-shadowSpan, shadowSpan, shadowSpan, -shadowSpan, 1, 400]}
        />
      </directionalLight>

      <Environment resolution={256} frames={1}>
        {/* soft sky fill */}
        <Lightformer
          intensity={theme.floodlights ? 0.6 : 1.4}
          color={theme.hemiSky}
          position={[0, 60, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[300, 300, 1]}
        />
        {theme.floodlights ? (
          <>
            {/* four corner floodlight banks */}
            {[
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ].map(([sx, sz], i) => (
              <Lightformer
                key={i}
                form="rect"
                intensity={3.2}
                color="#ffffff"
                position={[sx * fieldLength * 0.5, 45, sz * fieldWidth * 0.6]}
                rotation={[Math.PI / 2.4, 0, 0]}
                scale={[26, 26, 1]}
              />
            ))}
          </>
        ) : (
          <Lightformer
            intensity={2.2}
            color={theme.sunColor}
            position={theme.sunPos}
            scale={[40, 40, 1]}
          />
        )}
      </Environment>
    </>
  );
}
