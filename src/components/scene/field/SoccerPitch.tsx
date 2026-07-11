'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { FieldSpec } from '@/ir/types';
import { SceneTheme } from '../theme';
import GrassField from './GrassField';
import Goals from './Goals';

/**
 * The pitch surface. It uses a MeshStandardMaterial (so it is fully lit and
 * RECEIVES player shadows) with an onBeforeCompile injection that paints mow
 * stripes and every line marking as an anti-aliased SDF — resolution independent,
 * zero textures. A wind-driven instanced grass layer sits on top.
 */
export default function SoccerPitch({ field, theme }: { field: FieldSpec; theme: SceneTheme }) {
  const hl = field.length / 2;
  const hw = field.width / 2;

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const uniforms = {
      uHl: { value: hl },
      uHw: { value: hw },
      uBase: { value: new THREE.Color(theme.grassBase) },
      uStripe: { value: new THREE.Color(theme.grassTip).multiplyScalar(0.8) },
      uLine: { value: new THREE.Color('#eef3ee') },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        'varying vec2 vWorldXZ;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;'
        );
      shader.fragmentShader =
        `varying vec2 vWorldXZ;
         uniform float uHl; uniform float uHw;
         uniform vec3 uBase; uniform vec3 uStripe; uniform vec3 uLine;
         float rectOutline(vec2 p, vec2 he, float t){
           vec2 d = abs(p) - he; float o = length(max(d,0.0));
           float i = min(max(d.x,d.y),0.0); float s = abs(o+i);
           float fw = fwidth(s)+0.0008; return 1.0 - smoothstep(t, t+fw, s);
         }
         float ring(vec2 p, float r, float t){
           float d = abs(length(p)-r); float fw = fwidth(d)+0.0008;
           return 1.0 - smoothstep(t, t+fw, d);
         }
         float disc(vec2 p, float r){
           float d = length(p)-r; float fw = fwidth(d)+0.0008;
           return 1.0 - smoothstep(0.0, fw, d);
         }
         float seg(vec2 p, float x0, float hlen, float t){
           float dx = abs(p.x-x0); float dz = max(abs(p.y)-hlen,0.0);
           float d = sqrt(dx*dx+dz*dz); float fw = fwidth(d)+0.0008;
           return 1.0 - smoothstep(t, t+fw, d);
         }
         float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
         float snoise(vec2 p){
           vec2 i = floor(p); vec2 f = fract(p);
           vec2 u = f*f*(3.0-2.0*f);
           float a = hash(i);
           float b = hash(i+vec2(1.0,0.0));
           float c = hash(i+vec2(0.0,1.0));
           float d = hash(i+vec2(1.0,1.0));
           return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
         }
         vec3 pitchColor(vec2 p){
           bool inField = abs(p.x) <= uHl+0.15 && abs(p.y) <= uHw+0.15;
           // soft mow stripes with a faint mower-roller sheen line between bands
           float bandf = (p.x + uHl)/5.5;
           float band = floor(bandf);
           float sm = mod(band, 2.0);
           vec3 g = mix(uBase, uStripe, sm > 0.5 ? 1.0 : 0.0);
           g = mix(uBase*0.9, g, 1.0); // keep richness
           g *= sm > 0.5 ? 1.10 : 0.9;
           // organic mottling: two octaves of smooth noise (no blocky cells)
           float n = snoise(p*1.3)*0.6 + snoise(p*4.7)*0.4;
           g *= 0.9 + n*0.2;
           // faint diagonal cross-cut pattern for a manicured look
           g *= 1.0 + 0.03*sin((p.x+p.y)*0.9);
           // gentle wear: darker, slightly desaturated toward the touchlines
           float edge = smoothstep(uHl*0.55, uHl*1.0, abs(p.x)) + smoothstep(uHw*0.55, uHw*1.0, abs(p.y));
           g *= 1.0 - clamp(edge,0.0,1.0)*0.10;
           float t = 0.06; float m = 0.0;
           if(inField){
             m = max(m, rectOutline(p, vec2(uHl,uHw), t));
             m = max(m, seg(p, 0.0, uHw, t));
             m = max(m, ring(p, 9.15, t));
             m = max(m, disc(p, 0.16));
             m = max(m, rectOutline(p - vec2(uHl-8.25,0.0), vec2(8.25,20.15), t));
             m = max(m, rectOutline(p - vec2(-(uHl-8.25),0.0), vec2(8.25,20.15), t));
             m = max(m, rectOutline(p - vec2(uHl-2.75,0.0), vec2(2.75,9.16), t));
             m = max(m, rectOutline(p - vec2(-(uHl-2.75),0.0), vec2(2.75,9.16), t));
             m = max(m, disc(p - vec2(uHl-11.0,0.0), 0.16));
             m = max(m, disc(p - vec2(-(uHl-11.0),0.0), 0.16));
             if(abs(p.x) < uHl-16.5){
               m = max(m, ring(p - vec2(uHl-11.0,0.0), 9.15, t));
               m = max(m, ring(p - vec2(-(uHl-11.0),0.0), 9.15, t));
             }
           }
           return mix(g, uLine, clamp(m,0.0,1.0));
         }
        ` +
        shader.fragmentShader.replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( pitchColor(vWorldXZ), opacity );'
        );
    };
    mat.customProgramCacheKey = () => 'soccer-pitch';
    return mat;
  }, [theme.grassBase, theme.grassTip, hl, hw]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[field.length + 22, field.width + 22, 1, 1]} />
        <primitive object={material} attach="material" />
      </mesh>
      <GrassField length={field.length} width={field.width} theme={theme} />
      <Goals halfLength={hl} />
    </group>
  );
}
