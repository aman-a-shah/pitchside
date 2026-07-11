/**
 * Hero-film renderer — captures the in-engine cinematic for the homepage
 * scroll-scrub hero, straight from the real match reconstruction.
 *
 *   node scripts/film.mjs [matchId] [--frames N] [--fps N] [--lead s] [--tail s]
 *
 * Flow: load /match/<id>?film=1 (clean scene + FilmMode camera, a pure
 * function of playhead.t), find the first goal in the real event stream, film
 * a window ending just after it: step the clock frame-by-frame, snapshot each
 * step, then ffmpeg-encode ALL-KEYFRAME H.264 (every frame seekable — required
 * for scrubbing) into public/video/hero-stadium.mp4 + poster jpg.
 *
 * Dev server must be running on :3000. Requires ffmpeg on PATH.
 */

import puppeteer from 'puppeteer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const matchId = args.find((a) => !a.startsWith('--')) ?? 'sb-3869685';
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const FPS = opt('--fps', 30);
const FRAMES = opt('--frames', 300);
const LEAD = opt('--lead', (FRAMES / FPS) * 0.82); // seconds of build-up before the goal
const TAIL = opt('--tail', (FRAMES / FPS) * 0.18); // seconds of celebration after it

const BASE = 'http://localhost:3000';
const OUT_MP4 = 'public/video/hero-stadium.mp4';
const OUT_POSTER = 'public/video/hero-stadium-poster.jpg';
const W = 1920;
const H = 1080;

const framesDir = join(tmpdir(), `pitchside-film-${process.pid}`);
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--enable-gpu', '--use-angle=metal', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

// pass 1: load once just to read the real event stream for the goal time
console.log(`▸ finding the first goal in ${matchId}`);
await page.goto(`${BASE}/match/${matchId}?film=1`, { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('!!(window.__pitchside && window.__pitchside.model)', { timeout: 90000 });
const goalT = await page.evaluate(() => {
  const m = window.__pitchside.model;
  const goals = m.ir.events.filter((e) => e.type === 'goal');
  // open-play goals film best — penalties and shoot-outs are sparse scenes
  const open = goals.find((g) => g.text && !/\(pen\)|shoot-out/i.test(g.text));
  const g = open ?? goals[0];
  return g ? g.t : 60;
});
const t0 = Math.max(0, goalT - LEAD);
const t1 = goalT + TAIL;
console.log(`▸ goal at t=${goalT.toFixed(1)}s — filming ${t0.toFixed(1)}s → ${t1.toFixed(1)}s`);

// pass 2: reload with the film window baked into the camera path
await page.goto(
  `${BASE}/match/${matchId}?film=1&filmStart=${t0.toFixed(2)}&filmEnd=${t1.toFixed(2)}`,
  { waitUntil: 'domcontentloaded', timeout: 90000 }
);
await page.waitForFunction('!!(window.__pitchside && window.__pitchside.model)', { timeout: 90000 });
// let the GL pipeline compile shaders / stream the GLBs before frame 0
await page.evaluate((t) => {
  const c = window.__pitchside.clock.getState();
  c.pause();
  c.seek(t);
}, t0);
await new Promise((r) => setTimeout(r, 9000));

const dt = (t1 - t0) / (FRAMES - 1);
for (let i = 0; i < FRAMES; i++) {
  const t = t0 + i * dt;
  await page.evaluate((tt) => {
    window.__pitchside.clock.getState().seek(tt);
  }, t);
  // two rAFs: one for the scene to render the new time, one to flush
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  await page.screenshot({
    path: join(framesDir, `frame_${String(i).padStart(4, '0')}.jpg`),
    type: 'jpeg',
    quality: 95,
  });
  if (i % 30 === 0) console.log(`  frame ${i}/${FRAMES}`);
}
await browser.close();

console.log('▸ encoding (all-keyframe H.264)');
// capture at 1080p, ship at 900p: the downscale hides jpeg noise, and
// all-keyframe H.264 is expensive enough that 1600w is the size sweet spot
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-framerate', String(FPS),
    '-i', join(framesDir, 'frame_%04d.jpg'),
    '-vf', 'scale=1600:900',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '25',
    '-g', '1', // every frame an I-frame → any currentTime seeks instantly
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    OUT_MP4,
  ],
  { stdio: 'inherit' }
);
// poster = frame 0 (what the hero shows before the video is seekable)
execFileSync('ffmpeg', [
  '-y', '-v', 'error',
  '-i', join(framesDir, 'frame_0000.jpg'),
  '-vf', 'scale=1600:900',
  '-q:v', '5',
  OUT_POSTER,
]);
rmSync(framesDir, { recursive: true, force: true });
console.log(`done → ${OUT_MP4} + ${OUT_POSTER}`);
