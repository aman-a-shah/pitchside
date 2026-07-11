'use client';

import { useMemo } from 'react';
import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import { EventType } from '@/ir/types';
import { mmss } from '@/lib/format';
import styles from './hud.module.css';

const TYPE_COLOR: Partial<Record<EventType, string>> = {
  goal: '#ff4d4d',
  made_shot: '#ffb020',
  dunk: '#ffb020',
  save: '#14e0a0',
  winner: '#ffb020',
  point: '#14e0a0',
  shot: '#7aa2ff',
  serve: '#7aa2ff',
  tackle: '#7aa2ff',
  rebound: '#7aa2ff',
  kickoff: '#8a95a8',
  restart: '#8a95a8',
  out: '#8a95a8',
};

export default function Commentary() {
  const { ir } = useMatch();
  const uiT = useClock((s) => s.uiT);

  const withText = useMemo(
    () => ir.events.filter((e) => e.text).sort((a, b) => a.t - b.t),
    [ir.events]
  );

  // most recent 3 events before now
  const shown = useMemo(() => {
    const past = withText.filter((e) => e.t <= uiT + 0.05);
    return past.slice(-3).reverse();
  }, [withText, uiT]);

  if (!shown.length) return null;

  return (
    <div className={styles.commentary} aria-live="polite">
      <div className={styles.commentHead}>
        <span className={styles.commentPulse} />
        Live commentary
      </div>
      {shown.map((e, i) => (
        <div
          className={styles.commentItem}
          key={`${e.t}-${e.type}-${i}`}
          style={{
            opacity: 1 - i * 0.26,
            ['--tick' as string]: TYPE_COLOR[e.type] ?? '#8a95a8',
          }}
        >
          <span className={styles.commentTick} />
          <span className={styles.commentText}>{e.text}</span>
          <span className={styles.commentTime}>{mmss(e.t)}</span>
        </div>
      ))}
    </div>
  );
}
