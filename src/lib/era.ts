/**
 * Era — the film-stock a match is "shot on".
 *
 * PitchSide's story is a time machine: most of its catalog predates wall-to-wall
 * television coverage, and the oldest matches have no surviving full footage at
 * all. The reconstruction is the only way to watch them. Each era gets the look
 * of its recording medium so the date reads instantly on screen:
 *
 *   archive      < 1965   silver newsreel — near-monochrome, heavy grain
 *   technicolor  1965–79  faded 16mm color — warm, lifted blacks
 *   vhs          1980–99  broadcast tape — soft, slightly washed, scanlines
 *   modern       2000+    the untouched cinematic grade
 */

export type Era = 'archive' | 'technicolor' | 'vhs' | 'modern';

export function eraOf(date?: string | null): Era {
  const year = date ? parseInt(date.slice(0, 4), 10) : NaN;
  if (!Number.isFinite(year)) return 'modern';
  if (year < 1965) return 'archive';
  if (year < 1980) return 'technicolor';
  if (year < 2000) return 'vhs';
  return 'modern';
}

/** Short HUD chip label, e.g. "Archive '58 · newsreel". */
export function eraChip(era: Era, date?: string | null): string | null {
  if (era === 'modern') return null;
  const yy = date ? `'${date.slice(2, 4)}` : '';
  if (era === 'archive') return `Archive ${yy} · newsreel`;
  if (era === 'technicolor') return `Archive ${yy} · 16mm film`;
  return `Archive ${yy} · broadcast tape`;
}
