'use client';

import { useMemo, useRef } from 'react';
import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import { scoreMoments } from '@/lib/stats';
import { broadcastClock } from '@/lib/format';
import styles from './hud.module.css';

// Cinematic-restraint palette: goals own the live red, other key moments take
// the per-match team accent, routine events stay neutral. No rainbow chrome.
const MARKER_COLOR: Record<string, string> = {
  goal: 'var(--live)',
  made_shot: 'var(--accent-team)',
  dunk: 'var(--accent-team)',
  save: 'var(--accent-team)',
  winner: 'var(--accent-team)',
  shot: 'var(--chalk-dim)',
};

export default function Timeline() {
  const { ir, keyEvents } = useMatch();
  const uiT = useClock((s) => s.uiT);
  const duration = useClock((s) => s.duration);
  const seek = useClock((s) => s.seek);
  const pause = useClock((s) => s.pause);
  const trackRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  // score moments become kit-colored "chapter" ticks — taller than routine
  // markers, colored by WHO scored, so the match's shape reads at a glance
  const chapters = useMemo(() => scoreMoments(ir), [ir]);

  const pct = duration > 0 ? (uiT / duration) * 100 : 0;

  const fracFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const seekFromEvent = (clientX: number) => seek(fracFromEvent(clientX) * duration);

  // hover time bubble — written straight to the DOM so pointermove never re-renders
  const moveBubble = (clientX: number) => {
    const el = trackRef.current;
    const bubble = bubbleRef.current;
    if (!el || !bubble) return;
    const rect = el.getBoundingClientRect();
    const f = fracFromEvent(clientX);
    bubble.style.left = `${f * rect.width}px`;
    bubble.textContent = broadcastClock(ir, f * duration);
  };

  return (
    <div className={styles.timeline}>
      <span className={styles.tlTime}>{broadcastClock(ir, uiT)}</span>
      <div
        className={styles.tlTrack}
        ref={trackRef}
        onPointerDown={(e) => {
          dragging.current = true;
          pause();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) seekFromEvent(e.clientX);
          moveBubble(e.clientX);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        }}
      >
        <div className={styles.tlRail}>
          <div className={styles.tlFill} style={{ width: `${pct}%` }} />
        </div>
        {keyEvents.map((ev, i) => (
          <div
            key={i}
            className={styles.tlMarker}
            style={{
              left: `${(ev.t / duration) * 100}%`,
              background: MARKER_COLOR[ev.type] ?? 'var(--chalk-faint)',
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              seek(ev.t);
            }}
          >
            <span className={styles.tlTip}>
              {broadcastClock(ir, ev.t)} · {ev.text ?? ev.type}
            </span>
          </div>
        ))}
        {chapters.map((m, i) => (
          <div
            key={`c${i}`}
            className={`${styles.tlMarker} ${styles.tlChapter}`}
            style={{
              left: `${(m.t / duration) * 100}%`,
              background: m.side === 'home' ? 'var(--home-legible)' : 'var(--away-legible)',
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              seek(Math.max(0, m.t - 2));
            }}
          >
            <span className={styles.tlTip}>
              {broadcastClock(ir, m.t)} · {m.label} — {m.home}:{m.away}
            </span>
          </div>
        ))}
        <div className={styles.tlHead} style={{ left: `${pct}%` }} />
        <span className={styles.tlBubble} ref={bubbleRef} aria-hidden />
      </div>
      <span className={styles.tlTime}>{broadcastClock(ir, duration)}</span>
    </div>
  );
}
