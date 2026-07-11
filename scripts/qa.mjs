/**
 * Visual QA matrix — drives scripts/shoot.mjs across the home page (every
 * section, several widths, reduced-motion) and the match HUD (loading, play,
 * stats, roster, shortcuts, celebration banner, mobile).
 *
 *   node scripts/qa.mjs [outDir]      (dev server must be running on :3000)
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? 'qa-shots';
mkdirSync(OUT, { recursive: true });

const shoot = (name, url, extra = []) => {
  console.log(`▸ ${name}`);
  execFileSync('node', ['scripts/shoot.mjs', url, `${OUT}/${name}.png`, ...extra], {
    stdio: 'inherit',
  });
};

// ---- home: scroll fractions covering hero beats + every section ----
const HOME_STOPS = [
  ['home-hero-a', 0],
  ['home-hero-b', 0.12],
  ['home-hero-c', 0.2],
  ['home-wire-featured', 0.3],
  ['home-showcase-1', 0.42],
  ['home-showcase-3', 0.55],
  ['home-engine', 0.65],
  ['home-library', 0.8],
  ['home-footer', 1],
];
for (const [name, f] of HOME_STOPS) shoot(name, BASE, ['--scrollf', String(f)]);

// widths
for (const w of [1280, 768, 390]) {
  shoot(`home-w${w}-top`, BASE, ['--w', String(w), '--h', w < 500 ? '844' : '1000', '--scrollf', '0.3']);
  shoot(`home-w${w}-library`, BASE, ['--w', String(w), '--h', w < 500 ? '844' : '1000', '--scrollf', '0.8']);
}

// reduced motion
shoot('home-rm-hero', BASE, ['--rm', '--scrollf', '0']);
shoot('home-rm-mid', BASE, ['--rm', '--scrollf', '0.5']);

// ---- match HUD ----
const SOCCER = `${BASE}/match/sb-3869685`; // 2022 WC final (featured marquee)
const clock = (js) => ['--wait', '8000', '--exec', `const c=window.__pitchside.clock.getState();${js}`];

shoot('hud-loading', SOCCER, ['--wait', '500']);
shoot('hud-playing', SOCCER, ['--wait', '8000']);
shoot('hud-stats', SOCCER, clock('c.seek(150);c.setStatsOpen(true);'));
shoot('hud-roster', SOCCER, clock('c.pause();c.setRosterOpen(true);'));
shoot('hud-shortcuts', SOCCER, clock('c.setShortcutsOpen(true);'));
shoot(
  'hud-banner',
  SOCCER,
  [
    '--wait',
    '8000',
    '--exec',
    `const m=window.__pitchside.model;const g=m.ir.events.find(e=>e.type==='goal');
     const c=window.__pitchside.clock.getState();c.seek(g.t-0.6);c.play();`,
  ]
);
shoot('hud-no-minimap', SOCCER, clock('c.toggleTactical();'));
shoot('hud-mobile', SOCCER, ['--w', '390', '--h', '844', '--wait', '8000']);

// a second archive fixture (different era/kits) keeps the theme system honest
shoot('hud-euro', `${BASE}/match/sb-3943043`, clock('c.seek(150);c.setStatsOpen(true);'));

console.log(`\nDone → ${OUT}/`);
