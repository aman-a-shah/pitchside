/**
 * Per-match re-skin. Broadcast graphics adopt the two teams' colors; PitchSide
 * does the same. `deriveMatchTheme` returns the CSS custom properties set on the
 * match root so the whole HUD themes itself from one place — with a luminance
 * contrast guard so dark navy kits or near-white kits stay legible as accents.
 */
import type { CSSProperties } from 'react';
import type { CatalogEntry } from '@/catalog';

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (0–1). */
function relLuminance(hex: string): number {
  const lin = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.4126 * lin[2];
}

function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Move a color toward white until it clears the target contrast on near-black. */
export function ensureLegible(hex: string, minRatio = 3.2): string {
  const inkLum = relLuminance('#0b0a0a');
  let [r, g, b] = toRgb(hex);
  for (let i = 0; i < 14; i++) {
    const cur = `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
    if (contrastRatio(relLuminance(cur), inkLum) >= minRatio) return cur;
    r += (255 - r) * 0.16;
    g += (255 - g) * 0.16;
    b += (255 - b) * 0.16;
  }
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
}

/** Text color that sits legibly on top of a solid `hex` fill. */
function inkOn(hex: string): string {
  return relLuminance(hex) > 0.42 ? '#1a1103' : '#f6f3ec';
}

export function deriveMatchTheme(entry: CatalogEntry): CSSProperties {
  const [a, b] = entry.teams;
  const home = a?.color ?? '#f6f3ec';
  const away = b?.color ?? '#f6f3ec';

  // Accent = the more luminous kit, lifted until legible on the dark HUD.
  const brighter = relLuminance(home) >= relLuminance(away) ? home : away;
  const accent = ensureLegible(brighter);

  return {
    ['--home' as string]: home,
    ['--away' as string]: away,
    ['--home-legible' as string]: ensureLegible(home, 2.6),
    ['--away-legible' as string]: ensureLegible(away, 2.6),
    ['--accent-team' as string]: accent,
    ['--accent-team-ink' as string]: inkOn(accent),
    ['--accent-team-soft' as string]: `color-mix(in srgb, ${accent} 14%, transparent)`,
    // no glow — the cinematic-restraint language avoids decorative glows
    ['--accent-team-glow' as string]: 'transparent',
  } as CSSProperties;
}
