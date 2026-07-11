'use client';

import * as THREE from 'three';
import { useMemo } from 'react';

/** Two soccer goals (posts, crossbar, and a translucent net) at either end. */
export default function Goals({ halfLength }: { halfLength: number }) {
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#f4f6fa', roughness: 0.4, metalness: 0.1 }),
    []
  );
  const netMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.12,
        roughness: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    []
  );

  const GOAL_HW = 3.66;
  const GOAL_H = 2.44;
  const R = 0.06;

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
          {/* net: back + top + sides */}
          <mesh position={[sign * 0.9, GOAL_H / 2, 0]} material={netMat}>
            <boxGeometry args={[1.8, GOAL_H, GOAL_HW * 2]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
