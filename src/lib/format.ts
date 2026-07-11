export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Map clip time to a plausible football match minute for flavor. */
export function matchMinute(t: number, duration: number): string {
  const minute = Math.floor((t / Math.max(duration, 1)) * 90);
  return `${minute}'`;
}
