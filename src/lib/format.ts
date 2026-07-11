import type { MatchIR } from '@/ir/types';

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Broadcast match clock. Real-data matches carry `ir.periods`, so the display
 * follows convention: the running minute within the half ("23'"), stoppage as
 * "45+2'", extra time continuing to 120', "PENS" for a shoot-out. Matches
 * without period data fall back to raw mm:ss.
 */
export function broadcastClock(ir: MatchIR, t: number): string {
  const ps = ir.periods;
  if (!ps?.length) return mmss(t);
  let cur = ps[0];
  for (const p of ps) if (t >= p.t0) cur = p;
  if (cur.label === 'Penalties') return 'PENS';
  const halfLen = cur.label === 'Extra time' ? 15 : 45;
  const minute = Math.floor((t - cur.t0) / 60) + 1; // a match starts in the 1st minute
  const cap = cur.startMinute + halfLen;
  const abs = cur.startMinute + minute;
  return abs > cap ? `${cap}+${abs - cap}'` : `${abs}'`;
}
