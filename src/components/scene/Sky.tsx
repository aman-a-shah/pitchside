'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Stars } from '@react-three/drei';
import { SceneTheme } from './theme';

/**
 * A cheap gradient sky dome (single inverted sphere, vertex-colored via shader).
 * Avoids any remote HDRI fetch so the scene is fully self-contained.
 */
export default function Sky({ theme }: { theme: SceneTheme }) {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(theme.skyTop) },
        bottom: { value: new THREE.Color(theme.skyBottom) },
        offset: { value: 0.12 },
        exponent: { value: 0.85 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldPos;
        uniform vec3 top;
        uniform vec3 bottom;
        uniform float offset;
        uniform float exponent;
        void main() {
          float h = normalize(vWorldPos).y;
          float f = pow(max(h + offset, 0.0), exponent);
          vec3 col = mix(bottom, top, clamp(f, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, [theme.skyTop, theme.skyBottom]);

  return (
    <>
      <mesh scale={[900, 900, 900]} material={material} frustumCulled={false}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      {theme.stars && (
        <Stars radius={400} depth={80} count={2600} factor={5} saturation={0} fade speed={0.4} />
      )}
    </>
  );
}
