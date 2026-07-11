'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
      {theme.clouds && <CloudLayer />}
    </>
  );
}

/**
 * Drifting stylized clouds: a huge horizontal plane high above the stadium,
 * sampling the game's cloud-noise texture twice and thresholding into soft
 * puffs (COZY-style). Normal alpha blending, so it can never bloom to white.
 */
function CloudLayer() {
  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const material = useMemo(() => {
    const tex = new THREE.TextureLoader().load('/textures/noise_clouds.jpg');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uNoise: { value: tex },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime; uniform sampler2D uNoise;
        void main(){
          vec2 p = vUv * 3.0;
          float a = texture2D(uNoise, p * 0.55 + vec2(uTime*0.0035, 0.0)).r;
          float b = texture2D(uNoise, p * 1.4 - vec2(uTime*0.0022, uTime*0.0012)).r;
          float m = smoothstep(0.52, 0.78, a * 0.65 + b * 0.35);
          // fade toward the horizon edge of the plane
          float edge = 1.0 - smoothstep(0.28, 0.5, distance(vUv, vec2(0.5)));
          gl_FragColor = vec4(vec3(1.0), m * edge * 0.5);
        }
      `,
    });
  }, []);
  matRef.current = material;

  useFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.05);
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 210, 0]} material={material}>
      <planeGeometry args={[1600, 1600, 1, 1]} />
    </mesh>
  );
}
