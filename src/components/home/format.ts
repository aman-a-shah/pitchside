/** Shared display helpers for the home surface. */

import type { Sport } from '@/ir/types';

export const SPORT_LABEL: Record<Sport, string> = {
  soccer: 'Football',
  basketball: 'Basketball',
  tennis: 'Tennis',
};

// Real engine captures. Featured matches map to their own art; the long tail
// of the archive cycles the generic pitch renders deterministically.
const POSTER_ALIAS: Record<string, string> = {
  'sb-3869685': 'wc-final-arg-fra', // the poster IS Argentina v France at Lusail
  'sb-3943043': 'euro-final-eng-esp',
  'sb-8658': 'classic-bra-ger',
};
const GENERIC_POSTERS = ['wc-final-arg-fra', 'classic-bra-ger', 'euro-final-eng-esp'];

export function posterFor(id: string): string {
  const alias = POSTER_ALIAS[id];
  if (alias) return `/thumbs/${alias}.jpg`;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `/thumbs/${GENERIC_POSTERS[h % GENERIC_POSTERS.length]}.jpg`;
}

export function fmtDate(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(+dt)) return d;
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
