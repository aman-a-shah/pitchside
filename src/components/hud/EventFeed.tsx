'use client';

/**
 * EventFeed — the play-by-play (replaces the old read-only Commentary).
 * Collapsed: the latest three lines, newest on top. Expanded: the full
 * scrollback, chronological, pinned to the newest line unless the user has
 * scrolled up. Every row is a button that seeks to just before the moment.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import { EventType, MatchEvent } from '@/ir/types';
import { broadcastClock } from '@/lib/format';
import { IconChevronDown, IconChevronUp } from './Icons';
import styles from './hud.module.css';

// Same restraint as the timeline: red for goals, the per-match accent for key
// moments, neutrals for the routine play-by-play.
const TYPE_COLOR: Partial<Record<EventType, string>> = {
  goal: 'var(--live)',
  made_shot: 'var(--accent-team)',
  dunk: 'var(--accent-team)',
  save: 'var(--accent-team)',
  winner: 'var(--accent-team)',
  point: 'var(--accent-team)',
  shot: 'var(--chalk-2)',
  serve: 'var(--chalk-2)',
  tackle: 'var(--chalk-2)',
  rebound: 'var(--chalk-2)',
  kickoff: 'var(--chalk-faint)',
  restart: 'var(--chalk-faint)',
  out: 'var(--chalk-faint)',
};

const BIG: Partial<Record<EventType, true>> = { goal: true };

export default function EventFeed() {
  const { ir } = useMatch();
  const uiT = useClock((s) => s.uiT);
  const seek = useClock((s) => s.seek);
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const withText = useMemo(
    () => ir.events.filter((e) => e.text).sort((a, b) => a.t - b.t),
    [ir.events]
  );

  const past = useMemo(() => withText.filter((e) => e.t <= uiT + 0.05), [withText, uiT]);
  const collapsed = useMemo(() => past.slice(-3).reverse(), [past]);

  // keep the expanded scrollback pinned to the newest line unless the user
  // has deliberately scrolled up into history
  useEffect(() => {
    const el = listRef.current;
    if (!expanded || !el || !nearBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [expanded, past.length]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  if (!past.length) return null;

  const jump = (e: MatchEvent) => seek(Math.max(0, e.t - 2));

  const row = (e: MatchEvent, i: number, fade: boolean) => (
    <button
      className={styles.feedItem}
      data-big={BIG[e.type] || undefined}
      key={`${e.t}-${e.type}-${i}`}
      onClick={() => jump(e)}
      title={`Replay from ${broadcastClock(ir, Math.max(0, e.t - 2))}`}
      style={{
        opacity: fade ? 1 - i * 0.24 : undefined,
        ['--tick' as string]: TYPE_COLOR[e.type] ?? 'var(--chalk-faint)',
      }}
    >
      <span className={styles.feedTick} />
      <span className={styles.feedText}>{e.text}</span>
      <span className={styles.feedTime}>{broadcastClock(ir, e.t)}</span>
      <span className={styles.feedReplay} aria-hidden>
        ↩
      </span>
    </button>
  );

  return (
    <div className={styles.feed} data-expanded={expanded || undefined}>
      <button
        className={styles.feedHead}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        title={expanded ? 'Collapse commentary' : 'Show full play-by-play'}
      >
        <span className={styles.feedPulse} />
        Live commentary
        <span className={styles.feedCount}>· {past.length}</span>
        {expanded ? <IconChevronDown size={13} /> : <IconChevronUp size={13} />}
      </button>

      {expanded ? (
        <div
          className={styles.feedScroll}
          ref={listRef}
          onScroll={() => {
            const el = listRef.current;
            if (!el) return;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
        >
          {past.map((e, i) => row(e, i, false))}
        </div>
      ) : (
        <div aria-live="polite" className={styles.feedLatest}>
          {collapsed.map((e, i) => row(e, i, true))}
        </div>
      )}
    </div>
  );
}
