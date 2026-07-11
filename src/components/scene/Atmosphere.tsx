'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Sparkles } from '@react-three/drei';
import { Mood, Sport } from '@/ir/types';
import { playhead } from '@/state/clock';

/**
 * Volumetric atmosphere: the airborne life of the scene.
 *
 *  - Night  → fireflies drifting low over the pitch + fine cool dust catching the
 *             floodlights, plus warm embers rising near the stands.
 *  - Dusk   → heavier golden pollen/dust in the low sun.
 *  - Day    → bright dust motes floating in the sunlight.
 *  - Indoor → warm arena dust hanging in the still air.
 *
 * A thin band of low-lying ground mist adds depth and softens the pitch-to-stand
 * transition. All of it is additive/soft so it reads as light, not geometry.
 */
export default function Atmosphere({
  mood,
  sport,
  fieldLength,
  fieldWidth,
}: {
  mood: Mood;
  sport: Sport;
  fieldLength: number;
  fieldWidth: number;
}) {
  const areaX = fieldLength * 1.05;
  const areaZ = fieldWidth * 1.05;

  const night = mood === 'night';
  const dusk = mood === 'dusk';
  const indoor = mood === 'indoor';
  const day = mood === 'day';

  return (
    <group>
      {night && (
        <>
          {/* fireflies — slow, warm-green, low over the grass. Kept sparse & dim:
              drei Sparkles are additive, so a dense volume viewed edge-on from a
              low camera stacks into a bloom-white flood. */}
          <Sparkles
            count={55}
            scale={[areaX * 0.6, 3.5, areaZ * 0.6]}
            position={[0, 2.0, 0]}
            size={5}
            speed={0.22}
            opacity={0.16}
            color="#bdff9a"
            noise={1.2}
          />
          {/* warm embers drifting a little higher */}
          <Sparkles
            count={28}
            scale={[areaX * 0.7, 7, areaZ * 0.7]}
            position={[0, 5, 0]}
            size={3}
            speed={0.36}
            opacity={0.1}
            color="#ffcf8a"
          />
        </>
      )}

      {dusk && (
        <>
          <Sparkles
            count={110}
            scale={[areaX, 12, areaZ]}
            position={[0, 7, 0]}
            size={4}
            speed={0.18}
            opacity={0.32}
            color="#ffcf9a"
            noise={0.8}
          />
          <Sparkles
            count={70}
            scale={[areaX * 0.9, 4, areaZ * 0.9]}
            position={[0, 2.2, 0]}
            size={5.5}
            speed={0.3}
            opacity={0.4}
            color="#ffe6b0"
          />
        </>
      )}

      {day && (
        <Sparkles
          count={110}
          scale={[areaX, 16, areaZ]}
          position={[0, 8, 0]}
          size={2.6}
          speed={0.14}
          opacity={0.22}
          color="#ffffff"
          noise={0.6}
        />
      )}

      {indoor && (
        <Sparkles
          count={90}
          scale={[areaX * 1.1, 12, areaZ * 1.1]}
          position={[0, 6, 0]}
          size={2.4}
          speed={0.1}
          opacity={0.24}
          color="#ffe9c8"
        />
      )}

      <GroundMist areaX={areaX} areaZ={areaZ} mood={mood} sport={sport} />
    </group>
  );
}

/** A thin, slowly-scrolling band of low ground mist hugging the pitch. */
function GroundMist({
  areaX,
  areaZ,
  mood,
  sport,
}: {
  areaX: number;
  areaZ: number;
  mood: Mood;
  sport: Sport;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const tint = useMemo(() => {
    switch (mood) {
      case 'night':
        return new THREE.Color('#5f7fb0');
      case 'dusk':
        return new THREE.Color('#c98f74');
      case 'indoor':
        return new THREE.Color('#6a6270');
      default:
        return new THREE.Color('#cfe0f0');
    }
  }, [mood]);

  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // NORMAL (alpha-over) blending, NOT additive: a horizontal plane viewed at a
      // grazing angle from a low camera composites once per pixel, so it can never
      // accumulate to white the way an additive plane does.
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uTint: { value: tint },
        uStrength: { value: mood === 'day' ? 0.12 : 0.3 },
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
        uniform float uTime; uniform vec3 uTint; uniform float uStrength;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){
          vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y);
        }
        void main(){
          vec2 p = vUv * 6.0;
          float m = n(p + uTime*0.03) * 0.6 + n(p*2.3 - uTime*0.05) * 0.4;
          m = smoothstep(0.35, 0.9, m);
          // fade toward the pitch centre so mist rings the field
          float edge = smoothstep(0.15, 0.5, distance(vUv, vec2(0.5)));
          gl_FragColor = vec4(uTint, m * edge * uStrength);
        }
      `,
    });
    return m;
  }, [tint, mood]);

  // mist drifts with MATCH time so pause/slow-mo/headless capture all agree
  useFrame(() => {
    material.uniforms.uTime.value = playhead.t;
  });

  // basketball is indoors on a tight court — skip the sprawling mist plane
  if (sport === 'basketball') return null;

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]} material={material}>
      <planeGeometry args={[areaX * 1.4, areaZ * 1.5, 1, 1]} />
    </mesh>
  );
}
