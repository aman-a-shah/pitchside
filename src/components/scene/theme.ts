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
  grassBase: string;
  grassTip: string;
}

export type { Mood };

export const THEMES: Record<Mood, SceneTheme> = {
  night: {
    skyTop: '#04060e',
    skyBottom: '#0b1730',
    fog: '#0a1224',
    fogNear: 120,
    fogFar: 460,
    sunPos: [70, 95, 55],
    sunColor: '#eaf1ff',
    sunIntensity: 2.7,
    ambientColor: '#3a4568',
    ambientIntensity: 0.5,
    hemiSky: '#3a5c8f',
    hemiGround: '#123a22',
    hemiIntensity: 0.75,
    exposure: 1.16,
    floodlights: true,
    stars: true,
    grassBase: '#2c9346',
    grassTip: '#54c46a',
  },
  day: {
    skyTop: '#2f74c9',
    skyBottom: '#bfe1ff',
    fog: '#cfe4f7',
    fogNear: 160,
    fogFar: 620,
    sunPos: [80, 140, 60],
    sunColor: '#fff5e2',
    sunIntensity: 2.8,
    ambientColor: '#bcd4ef',
    ambientIntensity: 0.6,
    hemiSky: '#9cc4f0',
    hemiGround: '#2c4a2c',
    hemiIntensity: 0.9,
    exposure: 1.0,
    floodlights: false,
    stars: false,
    grassBase: '#2b8a3e',
    grassTip: '#54c263',
  },
  dusk: {
    skyTop: '#1a2145',
    skyBottom: '#e8794a',
    fog: '#7a5568',
    fogNear: 140,
    fogFar: 520,
    sunPos: [-60, 40, -30],
    sunColor: '#ffb066',
    sunIntensity: 2.4,
    ambientColor: '#6a5a7a',
    ambientIntensity: 0.5,
    hemiSky: '#c07a6a',
    hemiGround: '#2a2018',
    hemiIntensity: 0.6,
    exposure: 1.05,
    floodlights: true,
    stars: false,
    grassBase: '#256b32',
    grassTip: '#4a9a4e',
  },
  indoor: {
    skyTop: '#080a10',
    skyBottom: '#12151d',
    fog: '#0c0e14',
    fogNear: 80,
    fogFar: 300,
    sunPos: [20, 60, 20],
    sunColor: '#fff0d8',
    sunIntensity: 1.6,
    ambientColor: '#3a3f4a',
    ambientIntensity: 0.7,
    hemiSky: '#4a4f5c',
    hemiGround: '#14100c',
    hemiIntensity: 0.6,
    exposure: 1.02,
    floodlights: true,
    stars: false,
    grassBase: '#8a5a2c',
    grassTip: '#a9743a',
  },
};

export function themeFor(mood: Mood | undefined): SceneTheme {
  return THEMES[mood ?? 'night'];
}
