import { Mood } from '@/ir/types';

export interface SceneTheme {
  skyTop: string;
  skyBottom: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  sunPos: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  exposure: number;
  floodlights: boolean;
  stars: boolean;
  clouds: boolean;
  grassBase: string;
  grassTip: string;
}

export type { Mood };

/**
 * Mood palettes, retuned against the reference game's authored values
 * (AstralHorizon scene RenderSettings + COZY sky + AN grass gradient):
 *  - day     ≈ lps golden-hour: warm sun #ffdfac ~1.3-1.9, cool blue ambient,
 *              procedural sky #98c0d4, cool shadows.
 *  - night   = floodlit broadcast: deep navy sky, cool fill, BRIGHT even key
 *              (floodlights flatten shadows on real pitches).
 *  - dusk    ≈ COZY sunset flare (warm horizon, violet-blue zenith).
 *  - Grass   = desaturated broadcast green derived from the AN 3-stop gradient
 *              (deep green base → warm-tipped mid green), NOT neon.
 */
export const THEMES: Record<Mood, SceneTheme> = {
  night: {
    skyTop: '#050912',
    skyBottom: '#101f3e',
    fog: '#0b1426',
    fogNear: 140,
    fogFar: 520,
    sunPos: [70, 95, 55],
    sunColor: '#e9f0ff',
    sunIntensity: 3.1,
    ambientColor: '#42507e',
    ambientIntensity: 0.62,
    hemiSky: '#40639c',
    hemiGround: '#14301e',
    hemiIntensity: 0.8,
    exposure: 1.12,
    floodlights: true,
    stars: true,
    clouds: false,
    grassBase: '#2c6e41',
    grassTip: '#4c9c5c',
  },
  day: {
    skyTop: '#3178c2',
    skyBottom: '#b8d9f2',
    fog: '#c4dcf0',
    fogNear: 170,
    fogFar: 640,
    sunPos: [80, 120, 65],
    sunColor: '#ffdfac',
    sunIntensity: 3.0,
    ambientColor: '#a7c2e2',
    ambientIntensity: 0.62,
    hemiSky: '#8fb6e0',
    hemiGround: '#3c5a34',
    hemiIntensity: 0.95,
    exposure: 1.02,
    floodlights: false,
    stars: false,
    clouds: true,
    grassBase: '#2f7a40',
    grassTip: '#549e58',
  },
  dusk: {
    skyTop: '#232752',
    skyBottom: '#e07a44',
    fog: '#6d5064',
    fogNear: 150,
    fogFar: 560,
    sunPos: [-60, 38, -30],
    sunColor: '#ffb066',
    sunIntensity: 2.7,
    ambientColor: '#6f5d80',
    ambientIntensity: 0.56,
    hemiSky: '#bd7a68',
    hemiGround: '#26201a',
    hemiIntensity: 0.66,
    exposure: 1.05,
    floodlights: true,
    stars: false,
    clouds: true,
    grassBase: '#286038',
    grassTip: '#468a4c',
  },
  indoor: {
    skyTop: '#080a10',
    skyBottom: '#12151d',
    fog: '#0c0e14',
    fogNear: 80,
    fogFar: 300,
    sunPos: [20, 60, 20],
    sunColor: '#fff0d8',
    sunIntensity: 1.8,
    ambientColor: '#3f4450',
    ambientIntensity: 0.75,
    hemiSky: '#4a4f5c',
    hemiGround: '#14100c',
    hemiIntensity: 0.62,
    exposure: 1.02,
    floodlights: true,
    stars: false,
    clouds: false,
    grassBase: '#8a5a2c',
    grassTip: '#a9743a',
  },
};

export function themeFor(mood: Mood | undefined): SceneTheme {
  return THEMES[mood ?? 'night'];
}
