'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { FieldSpec } from '@/ir/types';

const SURFACE: Record<string, { court: string; surround: string }> = {
  clay: { court: '#c1622f', surround: '#8f4a24' },
  grass: { court: '#2f7d3a', surround: '#245f2c' },
  hard: { court: '#2f6db0', surround: '#1f4f84' },
};

/** Tennis court: surface-tinted floor with all singles/doubles line markings and a net. */
export default function TennisCourt({ field }: { field: FieldSpec }) {
  const hl = field.length / 2; // 11.885
  const singleHW = field.width / 2; // 4.115
  const doubleHW = 5.485;
  const serviceX = 6.4;
  const surface = SURFACE[field.surface ?? 'clay'] ?? SURFACE.clay;

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const uniforms = {
      uHl: { value: hl },
      uSHW: { value: singleHW },
      uDHW: { value: doubleHW },
      uSvc: { value: serviceX },
      uCourt: { value: new THREE.Color(surface.court) },
      uSurround: { value: new THREE.Color(surface.surround) },
      uLine: { value: new THREE.Color('#f4f0e6') },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        'varying vec2 vXZ;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vXZ = (modelMatrix * vec4(position,1.0)).xz;'
        );
      shader.fragmentShader =
        `varying vec2 vXZ;
         uniform float uHl; uniform float uSHW; uniform float uDHW; uniform float uSvc;
         uniform vec3 uCourt; uniform vec3 uSurround; uniform vec3 uLine;
         float sg(vec2 p, vec2 a, vec2 b, float t){ vec2 pa=p-a; vec2 ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); float d=length(pa-ba*h); float fw=fwidth(d)+0.001; return 1.0-smoothstep(t,t+fw,d);}
         vec3 courtColor(vec2 p){
           bool inCourt = abs(p.x) <= uHl+0.05 && abs(p.y) <= uDHW+0.05;
           vec3 baseC = inCourt ? uCourt : uSurround;
           float t = 0.04; float m = 0.0;
           // baselines
           m = max(m, sg(p, vec2(-uHl,-uDHW), vec2(-uHl,uDHW), t));
           m = max(m, sg(p, vec2(uHl,-uDHW), vec2(uHl,uDHW), t));
           // singles sidelines
           m = max(m, sg(p, vec2(-uHl,-uSHW), vec2(uHl,-uSHW), t));
           m = max(m, sg(p, vec2(-uHl,uSHW), vec2(uHl,uSHW), t));
           // doubles sidelines
           m = max(m, sg(p, vec2(-uHl,-uDHW), vec2(uHl,-uDHW), t));
           m = max(m, sg(p, vec2(-uHl,uDHW), vec2(uHl,uDHW), t));
           // service lines
           m = max(m, sg(p, vec2(-uSvc,-uSHW), vec2(-uSvc,uSHW), t));
           m = max(m, sg(p, vec2(uSvc,-uSHW), vec2(uSvc,uSHW), t));
           // centre service line
           m = max(m, sg(p, vec2(-uSvc,0.0), vec2(uSvc,0.0), t));
           // centre marks on baselines
           m = max(m, sg(p, vec2(-uHl,0.0), vec2(-uHl+0.3,0.0), t));
           m = max(m, sg(p, vec2(uHl,0.0), vec2(uHl-0.3,0.0), t));
           return mix(baseC, uLine, clamp(m,0.0,1.0));
         }
        ` +
        shader.fragmentShader.replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( courtColor(vXZ), opacity );'
        );
    };
    mat.customProgramCacheKey = () => 'tennis-court';
    return mat;
  }, [hl, singleHW, doubleHW, serviceX, surface.court, surface.surround]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[field.length + 16, field.width + 20, 1, 1]} />
        <primitive object={material} attach="material" />
      </mesh>
      <Net doubleHW={doubleHW} />
    </group>
  );
}

function Net({ doubleHW }: { doubleHW: number }) {
  const netMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#20242c',
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        roughness: 1,
        depthWrite: false,
      }),
    []
  );
  const postMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#12141a' }), []);
  const bandMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f0e6' }), []);
  const netH = 1.07;
  const span = doubleHW + 0.5;
  return (
    <group>
      {/* the net: a vertical strip across the full width at x=0 */}
      <mesh position={[0, netH / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={netMat}>
        <planeGeometry args={[span * 2, netH]} />
      </mesh>
      {/* top band */}
      <mesh position={[0, netH, 0]} material={bandMat}>
        <boxGeometry args={[0.06, 0.06, span * 2]} />
      </mesh>
      {/* posts */}
      {[-span, span].map((z) => (
        <mesh key={z} position={[0, netH / 2, z]} material={postMat} castShadow>
          <cylinderGeometry args={[0.05, 0.05, netH + 0.1, 8]} />
        </mesh>
      ))}
    </group>
  );
}
