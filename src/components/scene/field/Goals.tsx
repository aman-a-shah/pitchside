'use client';

import * as THREE from 'three';
import { useMemo } from 'react';

/**
 * Two soccer goals (posts, crossbar, raked box net) at either end.
 *
 * The net is real geometry — a top panel raked back from the crossbar and a
 * back panel dropping to the ground, closed by side panels — carrying a tiled
 * canvas grid texture so it reads as cord, not fog. Every panel floats
 * NET_LIFT above the turf: a net face coplanar with the pitch plane z-fights
 * (visible jitter), so nothing of the net ever touches y=0.
 */

const GOAL_HW = 3.66;
const GOAL_H = 2.44;
const R = 0.06;
const NET_LIFT = 0.04;
const TOP_BACK = { d: 0.9, y: 2.02 }; // where the raked top panel ends
const BOT_BACK = { d: 1.75, y: NET_LIFT }; // where the back panel meets the ground
const CELL = 0.13; // net mesh size in metres

let netTex: THREE.Texture | null = null;
function getNetTexture(): THREE.Texture {
  if (netTex) return netTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(64, 2);
  ctx.moveTo(2, 0);
  ctx.lineTo(2, 64);
  ctx.stroke();
  netTex = new THREE.CanvasTexture(c);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.anisotropy = 8;
  return netTex;
}

/** All four net panels as one indexed geometry, UVs in net-cell units. */
function buildNetGeometry(hw: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];

  const quad = (
    verts: [number, number, number][],
    uv: [number, number][]
  ) => {
    const base = positions.length / 3;
    verts.forEach((v) => positions.push(...v));
    uv.forEach((t) => uvs.push(...t));
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const t = TOP_BACK;
  const b = BOT_BACK;
  const topLen = Math.hypot(t.d, GOAL_H - t.y);
  const backLen = Math.hypot(b.d - t.d, t.y - b.y);
  const w = (2 * hw) / CELL;

  // top panel: crossbar → top-back edge
  quad(
    [
      [0, GOAL_H, -hw],
      [0, GOAL_H, hw],
      [t.d, t.y, hw],
      [t.d, t.y, -hw],
    ],
    [
      [0, 0],
      [w, 0],
      [w, topLen / CELL],
      [0, topLen / CELL],
    ]
  );
  // back panel: top-back edge → ground
  quad(
    [
      [t.d, t.y, -hw],
      [t.d, t.y, hw],
      [b.d, b.y, hw],
      [b.d, b.y, -hw],
    ],
    [
      [0, 0],
      [w, 0],
      [w, backLen / CELL],
      [0, backLen / CELL],
    ]
  );
  // side panels (planar 4-gons in the d/y plane)
  for (const z of [-hw, hw]) {
    quad(
      [
        [0, NET_LIFT, z],
        [0, GOAL_H, z],
        [t.d, t.y, z],
        [b.d, b.y, z],
      ],
      [
        [0, NET_LIFT / CELL],
        [0, GOAL_H / CELL],
        [t.d / CELL, t.y / CELL],
        [b.d / CELL, b.y / CELL],
      ]
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

export default function Goals({ halfLength }: { halfLength: number }) {
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#f4f6fa', roughness: 0.4, metalness: 0.1 }),
    []
  );
  const netMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: getNetTexture(),
        color: '#e8ecf2',
        roughness: 0.9,
        transparent: true,
        opacity: 0.9,
        alphaTest: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    []
  );
  const netGeo = useMemo(() => buildNetGeometry(GOAL_HW), []);

  // slanted support tube along the crossbar → top-back edge
  const stanchion = useMemo(() => {
    const dir = new THREE.Vector3(TOP_BACK.d, TOP_BACK.y - GOAL_H, 0).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const len = Math.hypot(TOP_BACK.d, GOAL_H - TOP_BACK.y);
    return { quat, len, mid: [TOP_BACK.d / 2, (GOAL_H + TOP_BACK.y) / 2] as const };
  }, []);

  return (
    <group>
      {[1, -1].map((sign) => (
        <group key={sign} position={[sign * halfLength, 0, 0]}>
          {/* posts */}
          {[-GOAL_HW, GOAL_HW].map((z) => (
            <mesh key={z} position={[0, GOAL_H / 2, z]} material={postMat} castShadow>
              <cylinderGeometry args={[R, R, GOAL_H, 10]} />
            </mesh>
          ))}
          {/* crossbar */}
          <mesh
            position={[0, GOAL_H, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            material={postMat}
            castShadow
          >
            <cylinderGeometry args={[R, R, GOAL_HW * 2, 10]} />
          </mesh>
          {/* net + stanchions, mirrored to extend behind the goal */}
          <group scale={[sign, 1, 1]}>
            <mesh geometry={netGeo} material={netMat} />
            {[-GOAL_HW, GOAL_HW].map((z) => (
              <mesh
                key={z}
                position={[stanchion.mid[0], stanchion.mid[1], z]}
                quaternion={stanchion.quat}
                material={postMat}
              >
                <cylinderGeometry args={[0.03, 0.03, stanchion.len, 8]} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}
