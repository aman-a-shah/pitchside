'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  EffectComposer,
  Bloom,
  Vignette,
  SMAA,
  HueSaturation,
  BrightnessContrast,
  ChromaticAberration,
  Noise,
  N8AO,
  Sepia,
  Scanline,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Mood } from '@/ir/types';
import { Era } from '@/lib/era';

/**
 * Cinematic post stack (order matters).
 *
 *  1. N8AO   — screen-space ambient occlusion grounds players/props into the
 *              pitch and darkens creases; the single biggest "AAA vs greybox" win.
 *  2. Bloom  — mipmap bloom with a HIGH luminance threshold, so only genuine
 *              emissives (floodlights, jumbotron, ball trail) glow — never the
 *              whole lit grass field (which used to flood the frame white).
 *  3. Grade  — hue/sat + brightness/contrast tuned per mood, then re-graded per
 *              ERA: matches are presented on the film stock of their decade
 *              (silver newsreel, faded 16mm, broadcast tape — see lib/era.ts).
 *  4. Chroma — a whisper of lens fringing at the edges (more on VHS tape).
 *  5. Vignette + film grain — the cinematic frame (much heavier on newsreel).
 *  6. SMAA   — clean edges last.
 *
 * ACES tone mapping is applied by the renderer (see Scene/ExposureSetter).
 */
export default function PostFX({ mood, era = 'modern' }: { mood: Mood; era?: Era }) {
  const bright = mood === 'day';
  const indoor = mood === 'indoor';

  // era re-grade over the base cinematic look
  const g = useMemo(() => {
    const base = {
      saturation: bright ? 0.1 : 0.15,
      hue: -0.015,
      brightness: bright ? -0.005 : 0.012,
      contrast: bright ? 0.14 : 0.17,
      sepia: 0,
      grain: bright ? 0.035 : 0.06,
      vignette: bright ? 0.38 : 0.55,
      ca: 0.0006,
      scanline: 0,
    };
    if (era === 'archive')
      // silver newsreel: the color drains away, the grain crawls
      return { ...base, saturation: -0.88, hue: 0, sepia: 0.22, brightness: 0.02, contrast: 0.24, grain: 0.3, vignette: 0.62, ca: 0.0003 };
    if (era === 'technicolor')
      // faded 16mm print: warm cast, lifted blacks, soft color
      return { ...base, saturation: -0.06, hue: 0.01, sepia: 0.15, brightness: 0.035, contrast: 0.07, grain: 0.14, vignette: 0.5, ca: 0.0004 };
    if (era === 'vhs')
      // broadcast tape: washed, low-contrast, fringing, a breath of scanline
      return { ...base, saturation: -0.16, sepia: 0.04, brightness: 0.012, contrast: 0.04, grain: 0.1, vignette: 0.46, ca: 0.0014, scanline: 0.05 };
    return base;
  }, [era, bright]);

  const caOffset = useMemo(() => new THREE.Vector2(g.ca, g.ca), [g.ca]);
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
      <HueSaturation saturation={g.saturation} hue={g.hue} />
      <BrightnessContrast brightness={g.brightness} contrast={g.contrast} />
      {g.sepia > 0 ? <Sepia intensity={g.sepia} /> : <></>}
      <ChromaticAberration
        offset={caOffset}
        radialModulation
        modulationOffset={0.35}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette offset={0.24} darkness={g.vignette} eskil={false} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={g.grain} />
      {g.scanline > 0 ? (
        <Scanline blendFunction={BlendFunction.OVERLAY} density={1.2} opacity={g.scanline} />
      ) : (
        <></>
      )}
      <SMAA />
    </EffectComposer>
  );
}
