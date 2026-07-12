'use client';

/**
 * ActionTicker — the "happening right now" line, bottom-center above the dock.
 * Unlike the EventFeed (the saved commentary scrollback, `text` events only),
 * this reads the dense `live` stream — every pass, carry, throw-in, clearance —
 * and simply shows the latest line at the playhead. Nothing accumulates; the
 * text just changes as the play changes.
 */

import { useMemo } from 'react';
import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import styles from './hud.module.css';

/** seconds a line stays up with nothing new to say (dead ball, VAR, …) */
const LINGER = 8;

export default function ActionTicker() {
  const { events } = useMatch();
  const uiT = useClock((s) => s.uiT);

  const lines = useMemo(() => events.filter((e) => e.live ?? e.text), [events]);

  // latest line at or before the playhead — binary search, this runs ~15Hz
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= uiT + 0.05) lo = mid + 1;
    else hi = mid;
  }
  const e = lines[lo - 1];
  if (!e || uiT - e.t > LINGER) return null;

  return (
    <div className={styles.ticker} aria-live="off">
      <span className={styles.tickerDot} />
      {/* keyed so each new line re-runs the entry animation */}
      <span className={styles.tickerText} key={`${e.t}-${e.type}`}>
        {e.live ?? e.text}
      </span>
    </div>
  );
}
