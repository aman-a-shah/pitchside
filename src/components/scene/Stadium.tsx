'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Sport } from '@/ir/types';
import { playhead } from '@/state/clock';
import { SceneTheme } from './theme';

interface BowlConfig {
  gap: number; // runoff from field edge to first row
  rows: number;
  rowDepth: number;
  rowRise: number;
  seatSpacing: number;
  roof: boolean;
  towers: boolean;
}

const CONFIG: Record<Sport, BowlConfig> = {
  soccer: { gap: 6, rows: 32, rowDepth: 0.8, rowRise: 0.52, seatSpacing: 0.62, roof: false, towers: true },
  basketball: { gap: 2.5, rows: 26, rowDepth: 0.72, rowRise: 0.5, seatSpacing: 0.6, roof: true, towers: false },
  tennis: { gap: 4, rows: 20, rowDepth: 0.78, rowRise: 0.5, seatSpacing: 0.66, roof: false, towers: false },
};

// Muted, realistic spectator-clothing tones — mostly darks/neutrals with a few
// team-colour pops. A real crowd reads as a mottled dark mass with sparse bright
// bits, NOT a saturated rainbow. Skin tones for heads are separate.
const CROWD_PALETTE = [
  '#2b3038', '#3a4048', '#1f242b', '#4a4f57', '#5a5048', '#6b6259',
  '#8a8f98', '#b7bcc4', '#2f4260', '#7a2f38', '#3f5a44', '#5b4a63',
  '#912f2f', '#2f5a91', '#c9c2b4', '#403842', '#26303a', '#655a4a',
];
const SKIN_TONES = ['#e6b58f', '#d29a6e', '#b57a4e', '#8c5a34', '#6b4226', '#f0c6a0'];

/** Procedural stadium bowl: four raked stands of instanced seats + crowd. */
export default function Stadium({ sport, theme, fieldLength, fieldWidth }: {
  sport: Sport;
  theme: SceneTheme;
  fieldLength: number;
  fieldWidth: number;
}) {
  const cfg = CONFIG[sport];
  const bodyRef = useRef<THREE.InstancedMesh>(null!);
  const headRef = useRef<THREE.InstancedMesh>(null!);
  const timeRef = useRef({ value: 0 });

  const data = useMemo(
    () => buildBowl(fieldLength, fieldWidth, cfg),
    [fieldLength, fieldWidth, cfg]
  );

  // crowd materials with a shared sway injected in the vertex shader
  const bodyMat = useMemo(() => makeSwayMaterial(timeRef.current, false), []);
  const headMat = useMemo(() => makeSwayMaterial(timeRef.current, true), []);
  const seatMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#191c24', roughness: 0.7 }),
    []
  );
  const concreteMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        // daylight shows real concrete; floodlit moods keep the dark shell
        color: theme.floodlights ? '#3b3f48' : '#878b92',
        roughness: 0.95,
      }),
    [theme.floodlights]
  );

  const geo = useMemo(() => {
    return {
      seat: new THREE.BoxGeometry(0.46, 0.4, 0.46),
      body: new THREE.CapsuleGeometry(0.2, 0.42, 3, 6),
      head: new THREE.SphereGeometry(0.13, 8, 6),
    };
  }, []);

  const fillInstances = () => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head || body.userData.filled) return;
    const col = new THREE.Color();
    for (let i = 0; i < data.count; i++) {
      body.setMatrixAt(i, data.bodyMatrices[i]);
      head.setMatrixAt(i, data.headMatrices[i]);
      col.set(data.colors[i]);
      body.setColorAt(i, col);
      col.set(data.headColors[i]);
      head.setColorAt(i, col);
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (head.instanceColor) head.instanceColor.needsUpdate = true;
    body.userData.filled = true;
  };

  // sway follows MATCH time (not wall clock): pause freezes the crowd with the
  // play, and stepped headless captures see the exact same pose per frame
  useFrame(() => {
    timeRef.current.value = playhead.t;
  });

  const hl = fieldLength / 2;
  const hw = fieldWidth / 2;
  const standDepth = cfg.rows * cfg.rowDepth;
  const standHeight = cfg.rows * cfg.rowRise;

  return (
    <group>
      {/* seats (every seat, occupied or not) */}
      <instancedMesh
        args={[geo.seat, seatMat, data.seatMatrices.length]}
        ref={(m) => {
          if (m && !m.userData.seated) {
            for (let i = 0; i < data.seatMatrices.length; i++)
              m.setMatrixAt(i, data.seatMatrices[i]);
            m.instanceMatrix.needsUpdate = true;
            m.userData.seated = true;
          }
        }}
        castShadow={false}
        receiveShadow
      />
      {/* crowd bodies + heads */}
      <instancedMesh ref={(m) => { if (m) { bodyRef.current = m; fillInstances(); } }} args={[geo.body, bodyMat, data.count]} />
      <instancedMesh ref={(m) => { if (m) { headRef.current = m; fillInstances(); } }} args={[geo.head, headMat, data.count]} />

      {/* concrete backing walls behind each stand */}
      {[
        { pos: [0, standHeight / 2, hw + cfg.gap + standDepth + 1], size: [fieldLength + 60, standHeight + 4, 2] },
        { pos: [0, standHeight / 2, -(hw + cfg.gap + standDepth + 1)], size: [fieldLength + 60, standHeight + 4, 2] },
        { pos: [hl + cfg.gap + standDepth + 1, standHeight / 2, 0], size: [2, standHeight + 4, fieldWidth + 60] },
        { pos: [-(hl + cfg.gap + standDepth + 1), standHeight / 2, 0], size: [2, standHeight + 4, fieldWidth + 60] },
      ].map((w, i) => (
        <mesh key={i} position={w.pos as [number, number, number]} material={concreteMat} receiveShadow>
          <boxGeometry args={w.size as [number, number, number]} />
        </mesh>
      ))}

      {cfg.towers && (
        <Floodlights hl={hl} hw={hw} gap={cfg.gap} depth={standDepth} height={standHeight} />
      )}
      {cfg.roof && (
        <Roof
          hl={hl + cfg.gap + standDepth}
          hw={hw + cfg.gap + standDepth}
          height={standHeight + 6}
          color={theme.hemiGround}
        />
      )}
    </group>
  );
}

// --------------------------- bowl geometry builder ---------------------------

function buildBowl(fieldLength: number, fieldWidth: number, cfg: BowlConfig) {
  const hl = fieldLength / 2;
  const hw = fieldWidth / 2;
  const seatMatrices: THREE.Matrix4[] = [];
  const bodyMatrices: THREE.Matrix4[] = [];
  const headMatrices: THREE.Matrix4[] = [];
  const colors: string[] = [];
  const headColors: string[] = [];
  const d = new THREE.Object3D();
  const bodyCol = new THREE.Color();

  const addSeat = (x: number, y: number, z: number, rotY: number, occupied: boolean) => {
    d.position.set(x, y, z);
    d.rotation.set(0, rotY, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    seatMatrices.push(d.matrix.clone());
    if (occupied) {
      // break the grid: jitter position, height and girth so the crowd reads as a
      // mottled organic mass instead of a regular lattice of identical pins
      const jx = x + (Math.random() - 0.5) * 0.22;
      const jz = z + (Math.random() - 0.5) * 0.18;
      const ry = rotY + (Math.random() - 0.5) * 0.5;
      const bh = 0.86 + Math.random() * 0.26; // body height factor
      const bw = 0.9 + Math.random() * 0.22; // girth factor
      const lean = (Math.random() - 0.5) * 0.12;
      d.position.set(jx, y + 0.5, jz);
      d.rotation.set(lean, ry, 0);
      d.scale.set(bw, bh, bw);
      d.updateMatrix();
      bodyMatrices.push(d.matrix.clone());
      d.position.set(jx, y + 0.42 + 0.5 * bh, jz);
      d.rotation.set(lean, ry, 0);
      d.scale.set(0.92 + Math.random() * 0.14, 0.92 + Math.random() * 0.14, 0.92 + Math.random() * 0.14);
      d.updateMatrix();
      headMatrices.push(d.matrix.clone());
      // per-instance brightness variation so same base colour still varies
      bodyCol.set(CROWD_PALETTE[(Math.random() * CROWD_PALETTE.length) | 0]);
      bodyCol.multiplyScalar(0.72 + Math.random() * 0.5);
      colors.push('#' + bodyCol.getHexString());
      headColors.push(SKIN_TONES[(Math.random() * SKIN_TONES.length) | 0]);
    }
  };

  const standLenX = fieldLength + 44;
  const standLenZ = fieldWidth + 44;

  for (let r = 0; r < cfg.rows; r++) {
    const y = 0.4 + r * cfg.rowRise;
    const out = r * cfg.rowDepth;
    // long side stands (run along x, at ±z), facing inward
    const zSide = hw + cfg.gap + out;
    const colsX = Math.floor(standLenX / cfg.seatSpacing);
    for (let c = 0; c < colsX; c++) {
      const x = -standLenX / 2 + c * cfg.seatSpacing + cfg.seatSpacing / 2;
      const occ = Math.random() > 0.14;
      addSeat(x, y, zSide, Math.PI, occ);
      addSeat(x, y, -zSide, 0, Math.random() > 0.14);
    }
    // end stands (run along z, at ±x)
    const xEnd = hl + cfg.gap + out;
    const colsZ = Math.floor(standLenZ / cfg.seatSpacing);
    for (let c = 0; c < colsZ; c++) {
      const z = -standLenZ / 2 + c * cfg.seatSpacing + cfg.seatSpacing / 2;
      // skip the corners already covered by the side stands
      if (Math.abs(z) > hw + cfg.gap - 1) continue;
      addSeat(xEnd, y, z, -Math.PI / 2, Math.random() > 0.14);
      addSeat(-xEnd, y, z, Math.PI / 2, Math.random() > 0.14);
    }
  }

  return {
    count: bodyMatrices.length,
    seatMatrices,
    bodyMatrices,
    headMatrices,
    colors,
    headColors,
  };
}

// --------------------------- sway material -----------------------------------

function makeSwayMaterial(time: { value: number }, isHead: boolean) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff', // real tint comes from per-instance colours
    roughness: isHead ? 0.72 : 0.92,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float wx = instanceMatrix[3][0];
         float wz = instanceMatrix[3][2];
         float ph = wx * 0.7 + wz * 0.5;
         transformed.y += sin(uTime * 1.8 + ph) * 0.03;
         transformed.x += cos(uTime * 1.3 + ph) * 0.015;`
      );
  };
  mat.customProgramCacheKey = () => (isHead ? 'crowd-head' : 'crowd-body');
  return mat;
}

// --------------------------- extras ------------------------------------------

let glowTex: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(240,246,255,0.5)');
  g.addColorStop(0.55, 'rgba(225,236,255,0.12)');
  g.addColorStop(1, 'rgba(225,236,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function Floodlights({ hl, hw, gap, depth, height }: { hl: number; hw: number; gap: number; depth: number; height: number }) {
  const towerH = height + 22;
  const positions: [number, number][] = [
    [hl + gap + depth, hw + gap + depth],
    [hl + gap + depth, -(hw + gap + depth)],
    [-(hl + gap + depth), hw + gap + depth],
    [-(hl + gap + depth), -(hw + gap + depth)],
  ];

  // additive volumetric shaft: bright at the lamp, fading to nothing at the pitch,
  // soft at the cone edge — the "beam cutting through the night air" look.
  const beamMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color('#dfeaff') } },
      vertexShader: /* glsl */ `
        varying float vY; varying vec2 vXz;
        void main(){
          vY = uv.y;                       // 1 at lamp (top), 0 at pitch (bottom)
          vXz = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vY; varying vec2 vXz;
        uniform vec3 uColor;
        void main(){
          float along = pow(vY, 2.0);                 // brightest near the lamp, gone by the pitch
          float edge = 1.0 - smoothstep(0.0, 1.0, length(vXz));
          float a = along * edge * 0.045;             // very faint — additive beams stack fast
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
  }, []);

  // soft radial glow around the lamp bank. A SpriteMaterial with no map draws
  // a SOLID QUAD (a visible glowing box), so the gradient texture is required.
  const haloMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: '#eaf1ff',
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  return (
    <group>
      {positions.map(([x, z], i) => {
        // aim the beam from the lamp toward the pitch centre
        const len = Math.hypot(x, z, towerH);
        const dir = new THREE.Vector3(-x, -towerH, -z).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, -1, 0),
          dir
        );
        return (
          <group key={i} position={[x, 0, z]}>
            {/* lattice tower */}
            <mesh position={[0, towerH / 2, 0]} castShadow>
              <cylinderGeometry args={[0.5, 0.9, towerH, 10]} />
              <meshStandardMaterial color="#22262e" roughness={0.55} metalness={0.4} />
            </mesh>
            {/* lamp housing */}
            <mesh position={[0, towerH, 0]}>
              <boxGeometry args={[7, 3.4, 1.2]} />
              <meshStandardMaterial color="#0c0e12" roughness={0.5} metalness={0.5} />
            </mesh>
            {/* bank of individual bright lamps */}
            {[-2.3, -0.75, 0.75, 2.3].map((lx) =>
              [-0.8, 0.8].map((ly, k) => (
                <mesh key={`${lx}-${k}`} position={[lx, towerH + ly, 0.65]}>
                  <boxGeometry args={[1.2, 1.2, 0.25]} />
                  <meshStandardMaterial
                    color="#ffffff"
                    emissive="#fff7e0"
                    emissiveIntensity={2.2}
                    toneMapped={false}
                  />
                </mesh>
              ))
            )}
            {/* additive glow halo around the whole bank */}
            <sprite position={[0, towerH, 1]} scale={[10, 7, 1]} material={haloMat} />
            {/* volumetric beam toward the pitch */}
            <group position={[0, towerH, 0]} quaternion={quat}>
              <mesh position={[0, -len * 0.5, 0]} material={beamMat}>
                <coneGeometry args={[len * 0.28, len, 24, 1, true]} />
              </mesh>
            </group>
            <pointLight
              position={[0, towerH, 0]}
              intensity={38}
              distance={240}
              decay={1.5}
              color="#eaf1ff"
            />
          </group>
        );
      })}
    </group>
  );
}

function Roof({ hl, hw, height, color }: { hl: number; hw: number; height: number; color: string }) {
  return (
    <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[Math.min(hl, hw) * 0.7, Math.max(hl, hw) * 1.3, 4, 1]} />
      <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}
