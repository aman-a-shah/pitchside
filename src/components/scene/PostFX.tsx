'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  EffectComposer,
  Bloom,
  Vignette,
  SMAA,
  DepthOfField,
  HueSaturation,
  BrightnessContrast,
  ChromaticAberration,
  Noise,
  N8AO,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Mood } from '@/ir/types';
import { useClock } from '@/state/clock';

/**
 * Cinematic post stack (order matters).
 *
 *  1. N8AO   — screen-space ambient occlusion grounds players/props into the
 *              pitch and darkens creases; the single biggest "AAA vs greybox" win.
 *  2. Bloom  — mipmap bloom with a HIGH luminance threshold, so only genuine
 *              emissives (floodlights, jumbotron, ball trail) glow — never the
 *              whole lit grass field (which used to flood the frame white).
 *  3. DoF    — engages only in slow-motion for the hero-replay look.
 *  4. Grade  — hue/sat + brightness/contrast tuned per mood.
 *  5. Chroma — a whisper of lens fringing at the edges.
 *  6. Vignette + film grain — the cinematic frame.
 *  7. SMAA   — clean edges last.
 *
 * ACES tone mapping is applied by the renderer (see Scene/ExposureSetter).
 */
export default function PostFX({ mood }: { mood: Mood }) {
  const speed = useClock((s) => s.speed);
  const playing = useClock((s) => s.playing);
  const slowmo = playing && speed <= 0.4;
  const bright = mood === 'day';
  const indoor = mood === 'indoor';

  const caOffset = useMemo(() => new THREE.Vector2(0.0006, 0.0006), []);
  const aoColor = useMemo(() => new THREE.Color(bright ? '#20304a' : '#060a14'), [bright]);

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        aoRadius={indoor ? 1.4 : 2.2}
        distanceFalloff={1.0}
        intensity={bright ? 2.4 : 3.0}
        aoSamples={16}
        denoiseSamples={4}
        denoiseRadius={12}
        color={aoColor}
        halfRes
      />
      <Bloom
        mipmapBlur
        intensity={bright ? 0.4 : 0.6}
        luminanceThreshold={bright ? 1.25 : 1.2}
        luminanceSmoothing={0.08}
        radius={0.34}
      />
      {slowmo ? (
        <DepthOfField focusDistance={0.012} focalLength={0.03} bokehScale={4.5} height={520} />
      ) : (
        <></>
      )}
      {/* Grade ≈ the reference game's AstralHorizon profile, web-restrained:
          lifted contrast, small saturation push, cool-neutral tilt. */}
      <HueSaturation saturation={bright ? 0.1 : 0.15} hue={-0.015} />
      <BrightnessContrast brightness={bright ? -0.005 : 0.012} contrast={bright ? 0.14 : 0.17} />
      <ChromaticAberration
        offset={caOffset}
        radialModulation
        modulationOffset={0.35}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette offset={0.24} darkness={bright ? 0.38 : 0.55} eskil={false} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={bright ? 0.035 : 0.06} />
      <SMAA />
    </EffectComposer>
  );
}
