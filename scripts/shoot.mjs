/**
 * Screenshot harness — captures pages/states for visual QA.
 *
 *   node scripts/shoot.mjs <url> <out.png> [--wait ms] [--scroll px] [--scrollf 0..1]
 *                          [--w W] [--h H] [--rm] [--exec "<js>"]
 *
 * Waits for the page to settle (network idle + optional extra delay for the
 * WebGL scene to compile/warm), optionally scrolls (absolute px or a fraction
 * of scrollHeight), optionally runs a JS snippet (e.g. to drive the match
 * clock via window.__pitchside), then captures. --rm emulates
 * prefers-reduced-motion: reduce.
 */

import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const strOpt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const wait = opt('--wait', 2600);
const scroll = opt('--scroll', 0);
const scrollf = opt('--scrollf', -1);
const width = opt('--w', 1600);
const height = opt('--h', 1000);
const reducedMotion = args.includes('--rm');
const exec = strOpt('--exec');

if (!url || !out) {
  console.error('usage: node scripts/shoot.mjs <url> <out.png> [--wait ms] [--scroll px] [--scrollf f] [--rm] [--exec js]');
  process.exit(1);
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--enable-gpu', '--use-angle=metal', `--window-size=${width},${height}`],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1.5 });
if (reducedMotion) {
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
}
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, wait));
if (scrollf >= 0) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max * f, behavior: 'instant' });
  }, scrollf);
  await new Promise((r) => setTimeout(r, 900));
} else if (scroll) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scroll);
  await new Promise((r) => setTimeout(r, 900));
}
if (exec) {
  await page.evaluate(exec);
  await new Promise((r) => setTimeout(r, 700));
}
await page.screenshot({ path: out });
await browser.close();
console.log('shot', out);
