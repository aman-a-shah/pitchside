'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { FieldSpec } from '@/ir/types';

/**
 * Basketball court: a glossy parquet floor (procedural plank grain + all court
 * lines drawn as SDFs in the fragment shader) with a low roughness so the IBL
 * environment gives it that reflective, freshly-waxed sheen. Hoops at each end.
 */
export default function BasketballCourt({ field }: { field: FieldSpec }) {
  const hl = field.length / 2;
  const hw = field.width / 2;
  const rimX = hl - 1.6;

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.05 });
    const uniforms = {
      uHl: { value: hl },
      uHw: { value: hw },
      uRimX: { value: rimX },
      uWoodA: { value: new THREE.Color('#c58a4e') },
      uWoodB: { value: new THREE.Color('#b3733a') },
      uLine: { value: new THREE.Color('#f3ede1') },
      uPaint: { value: new THREE.Color('#a4402f') },
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
         uniform float uHl; uniform float uHw; uniform float uRimX;
         uniform vec3 uWoodA; uniform vec3 uWoodB; uniform vec3 uLine; uniform vec3 uPaint;
         float ro(vec2 p, vec2 he, float t){ vec2 d=abs(p)-he; float o=length(max(d,0.0)); float i=min(max(d.x,d.y),0.0); float s=abs(o+i); float fw=fwidth(s)+0.001; return 1.0-smoothstep(t,t+fw,s);}
         float rf(vec2 p, vec2 he){ vec2 d=abs(p)-he; return (max(d.x,d.y)<0.0)?1.0:0.0; }
         float rg(vec2 p, float r, float t){ float d=abs(length(p)-r); float fw=fwidth(d)+0.001; return 1.0-smoothstep(t,t+fw,d);}
         float sg(vec2 p, vec2 a, vec2 b, float t){ vec2 pa=p-a; vec2 ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); float d=length(pa-ba*h); float fw=fwidth(d)+0.001; return 1.0-smoothstep(t,t+fw,d);}
         float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9,78.2)))*43758.5); }
         vec3 courtColor(vec2 p){
           // plank grain: bands along x with subtle per-plank tint + streaks
           float plank = floor(p.y/0.9);
           float tint = hash(vec2(plank, floor(p.x/6.0)));
           vec3 wood = mix(uWoodA, uWoodB, 0.4 + tint*0.6);
           float grain = sin(p.x*7.0 + tint*10.0)*0.03;
           wood *= 1.0 + grain;
           // seams between planks
           float seam = smoothstep(0.02, 0.0, abs(fract(p.y/0.9)-0.5)-0.48);
           wood *= 1.0 - seam*0.25;

           float t = 0.05; float m = 0.0; float paint = 0.0;
           m = max(m, ro(p, vec2(uHl,uHw), t));
           m = max(m, sg(p, vec2(0.0,-uHw), vec2(0.0,uHw), t));
           m = max(m, rg(p, 1.8, t));
           for(float s=-1.0; s<=1.0; s+=2.0){
             vec2 hoop = vec2(s*uRimX, 0.0);
             // key / painted lane
             vec2 keyC = vec2(s*(uHl-2.9), 0.0);
             paint = max(paint, rf(p-keyC, vec2(2.9,2.45)));
             m = max(m, ro(p-keyC, vec2(2.9,2.45), t));
             // free-throw circle
             m = max(m, rg(p-vec2(s*(uHl-5.8),0.0), 1.8, t));
             // three-point arc + corners
             if(abs(p.y) < 6.7 && s*p.x > 0.0){
               m = max(m, rg(p-hoop, 7.15, t));
             }
             m = max(m, sg(p, vec2(s*uHl, 6.7), vec2(s*(uHl-4.3), 6.7), t));
             m = max(m, sg(p, vec2(s*uHl, -6.7), vec2(s*(uHl-4.3), -6.7), t));
           }
           vec3 col = mix(wood, uPaint, paint*0.5);
           col = mix(col, uLine, clamp(m,0.0,1.0));
           return col;
         }
        ` +
        shader.fragmentShader.replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( courtColor(vXZ), opacity );'
        );
    };
    mat.customProgramCacheKey = () => 'bball-court';
    return mat;
  }, [hl, hw, rimX]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[field.length + 8, field.width + 6, 1, 1]} />
        <primitive object={material} attach="material" />
      </mesh>
      <Hoop x={rimX} />
      <Hoop x={-rimX} />
    </group>
  );
}

function Hoop({ x }: { x: number }) {
  const sign = Math.sign(x);
  return (
    <group position={[x, 0, 0]}>
      {/* stanchion */}
      <mesh position={[sign * 0.9, 1.6, 0]} castShadow>
        <boxGeometry args={[0.2, 3.2, 0.2]} />
        <meshStandardMaterial color="#20242c" roughness={0.5} />
      </mesh>
      {/* backboard */}
      <mesh position={[sign * 0.3, 3.05, 0]}>
        <boxGeometry args={[0.05, 1.05, 1.8]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.4}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>
      {/* rim */}
      <mesh position={[-sign * 0.15, 3.05, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.23, 0.02, 8, 20]} />
        <meshStandardMaterial color="#e2762b" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* net */}
      <mesh position={[-sign * 0.15, 2.83, 0]}>
        <cylinderGeometry args={[0.23, 0.12, 0.4, 12, 1, true]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
