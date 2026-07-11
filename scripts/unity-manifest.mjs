/**
 * Write public/unity/manifest.json after a Unity WebGL build. The exact file
 * names/extensions in Build/ depend on Unity's compression settings
 * (.unityweb with decompression fallback, .gz/.br without, bare otherwise),
 * so the web embed reads this manifest instead of hardcoding them.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'public/unity/Build');

const files = readdirSync(buildDir);
const find = (marker) => {
  const f = files.find((f) => f.includes(marker));
  if (!f) throw new Error(`no "${marker}" file in public/unity/Build (have: ${files.join(', ')})`);
  return `/unity/Build/${f}`;
};

const manifest = {
  loaderUrl: find('.loader.js'),
  dataUrl: find('.data'),
  frameworkUrl: find('.framework.js'),
  codeUrl: find('.wasm'),
};

writeFileSync(join(root, 'public/unity/manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Wrote public/unity/manifest.json:', manifest);
