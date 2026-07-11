'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SceneTheme } from '../theme';

// A dense field of curved blades. Density is high near the ground plane so the
// field reads as a continuous fluffy carpet rather than scattered spikes.
const COUNT = 210000;
const BLADE_H = 0.15;
const BLADE_W = 0.075;
const SEGMENTS = 3;
// Tight fade: blades only exist near the camera (fly/cinematic close-ups);
// beyond ~40m the pitch texture carries all detail. A wide fade zone used to
// leave half-collapsed blades reading as dark flecks in broadcast framing.
const FADE_NEAR = 18; // blades full height within this radius of the camera
const FADE_FAR = 40; // …collapsed into the pitch shader beyond this
const STRIPE_W = 5.5; // must match SoccerPitch mow-stripe width

/**
 * GPU-instanced grass, rebuilt as a soft wind-swept carpet.
 *
 * Each blade is a tapered, softly pre-curved ribbon (SEGMENTS quads) rather than
 * a flat spike. All motion is in the vertex shader: a low-frequency *flow field*
 * (scrolling value-noise sampled by world position) makes whole patches lean
 * together so gusts visibly roll across the pitch, with a fast per-blade flutter
 * layered on top. Blades bend as a cantilever (the tip drops as it leans) so they
 * keep their length instead of stretching. Colour is a baked base→tip gradient
 * multiplied by a per-instance tint that is matched to the mow stripe the blade
 * sits on, so the blades melt into the pitch instead of speckling over it.
 * One draw call for the whole field.
 */
export default function GrassField({
  length,
  width,
  theme,
}: {
  length: number;
  width: number;
  theme: SceneTheme;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const timeRef = useRef({ value: 0 });

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(BLADE_W, BLADE_H, 1, SEGMENTS);
    g.translate(0, BLADE_H / 2, 0);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    // The gradient is a GRAYSCALE brightness multiplier only (root shaded → tip
    // sunlit). Hue is carried entirely by the per-instance tint, so roots read as
    // "darker green" rather than crushing to black when the two colours multiply.
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / BLADE_H; // 0 root → 1 tip
      // taper the blade to a soft point and pre-curve it gently forward
      const taper = 1 - h * 0.72;
      pos.setX(i, pos.getX(i) * taper);
      pos.setZ(i, pos.getZ(i) + h * h * 0.03);
      // Keep albedo low: near-vertical blades face the floodlights head-on and
      // would otherwise integrate more light than the flat pitch and read as bright
      // confetti flecks. Low albedo + a tight ceiling makes lit blades sit at the
      // pitch tone, so the field reads as one cohesive carpet.
      const v = 0.26 + Math.pow(h, 0.9) * 0.36; // 0.26 root → ~0.62 tip
      colors[i * 3] = v;
      colors[i * 3 + 1] = v;
      colors[i * 3 + 2] = v;
    }
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) phase[i] = Math.random() * Math.PI * 2;
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    return g;
  }, [theme.grassBase, theme.grassTip]);

  // Clamp band derived from the ACTIVE theme so blades always sit inside the
  // pitch's own tonal range (hardcoded bands used to mismatch the pitch and
  // read as bright/dark confetti at grazing angles).
  const clampLo = useMemo(
    () => new THREE.Color(theme.grassBase).multiplyScalar(0.92),
    [theme.grassBase]
  );
  const clampHi = useMemo(
    () => new THREE.Color(theme.grassTip).multiplyScalar(1.06),
    [theme.grassTip]
  );

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.96,
      metalness: 0,
    });
    const time = timeRef.current;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.uniforms.uClampLo = { value: clampLo };
      shader.uniforms.uClampHi = { value: clampHi };
      shader.vertexShader =
        `attribute float aPhase;
         uniform float uTime;
         // cheap value noise for the wind flow field
         float vhash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
         float vnoise(vec2 p){
           vec2 i = floor(p); vec2 f = fract(p);
           vec2 u = f*f*(3.0-2.0*f);
           float a = vhash(i);
           float b = vhash(i+vec2(1.0,0.0));
           float c = vhash(i+vec2(0.0,1.0));
           float d = vhash(i+vec2(1.0,1.0));
           return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
         }
         varying float vTipGlow;
        ` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float bh = clamp(position.y / ${BLADE_H.toFixed(3)}, 0.0, 1.0);
           float wx = instanceMatrix[3][0];
           float wz = instanceMatrix[3][2];
           // --- distance fade: collapse blades into the pitch shader far from the
           //     camera so the far field reads as clean mown turf, not aliasing noise
           float camDist = distance(cameraPosition.xz, vec2(wx, wz));
           float fade = 1.0 - smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, camDist);
           transformed.y *= fade;
           transformed.x *= mix(0.6, 1.0, fade);
           // --- wind flow field: low-freq gusts scrolling across the pitch ---
           vec2 fp = vec2(wx, wz) * 0.05 - uTime * vec2(0.10, 0.06);
           float gust = vnoise(fp) * 0.7 + vnoise(fp * 2.3 + 5.0) * 0.3; // 0..1
           gust = smoothstep(0.15, 0.95, gust);
           // primary wind direction (blows toward +x/+z), bent as a cantilever
           float bend = pow(bh, 1.35);
           float strength = 0.14 + 0.30 * gust;
           float flutter = sin(uTime * 3.4 + aPhase) * 0.028 * bh;
           transformed.x += (strength * 0.85 + flutter) * bend;
           transformed.z += (strength * 0.35) * bend + sin(uTime*2.1 + aPhase)*0.02*bh;
           // drop the tip so the blade keeps its length as it leans
           transformed.y -= bend * bend * strength * 0.55;
           vTipGlow = bh * (0.5 + 0.5 * gust);`
        );
      shader.fragmentShader =
        'varying float vTipGlow;\nuniform vec3 uClampLo;\nuniform vec3 uClampHi;\n' +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           // fake subsurface + the AN pack's "waving tint": gusted, sunlit tips
           // pick up a warm yellow-green shimmer so wind waves read as light
           gl_FragColor.rgb += vTipGlow * vTipGlow * vec3(0.026, 0.03, 0.012);
           // Clamp blade output into the ACTIVE THEME's turf band: a ceiling so
           // floodlights can't blow blades white, AND a floor so shaded blade
           // backs / inter-blade AO can't crush to dark specks. Result reads as
           // one cohesive carpet at every camera height instead of confetti.
           gl_FragColor.rgb = clamp(gl_FragColor.rgb, uClampLo, uClampHi);`
        );
    };
    mat.customProgramCacheKey = () => 'grass-v3';
    return mat;
  }, [clampLo, clampHi]);

  const onMesh = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh || mesh.userData.filled) return;
    meshRef.current = mesh;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    // Match the pitch mow-stripe colours so blades blend into the ground, not
    // speckle over it. Light band ≈ grassTip*0.88, dark band ≈ grassBase*0.95.
    const stripeHi = new THREE.Color(theme.grassTip).multiplyScalar(0.9);
    const stripeLo = new THREE.Color(theme.grassBase).multiplyScalar(1.0);
    const hl = length / 2 + 1.5;
    const hw = width / 2 + 1.5;
    for (let i = 0; i < COUNT; i++) {
      const x = (Math.random() * 2 - 1) * hl;
      const z = (Math.random() * 2 - 1) * hw;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.1,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.14
      );
      const s = 0.72 + Math.random() * 0.7;
      dummy.scale.set(0.85 + Math.random() * 0.5, s, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // tint to match the mow stripe this blade sits on + subtle per-blade variation
      const band = Math.floor((x + length / 2) / STRIPE_W);
      const onLight = band % 2 === 0;
      col.copy(onLight ? stripeHi : stripeLo);
      col.multiplyScalar(0.9 + Math.random() * 0.2);
      // occasional yellow-green dry patch for natural variation
      if (Math.random() < 0.04) col.offsetHSL(0.02, -0.15, 0.05);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.filled = true;
  };

  useFrame((_, delta) => {
    timeRef.current.value += Math.min(delta, 0.05);
  });

  return (
    <instancedMesh
      ref={onMesh}
      args={[geometry, material, COUNT]}
      frustumCulled={false}
      receiveShadow
      castShadow={false}
    />
  );
}
