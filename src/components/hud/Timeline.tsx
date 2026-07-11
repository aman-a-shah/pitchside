'use client';

import { useRef } from 'react';
import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import { mmss } from '@/lib/format';
import styles from './hud.module.css';

const MARKER_COLOR: Record<string, string> = {
  goal: '#ff4d4d',
  made_shot: '#ffb020',
  dunk: '#ffb020',
  save: '#14e0a0',
  winner: '#ffb020',
  shot: '#7aa2ff',
};

export default function Timeline() {
  const { keyEvents } = useMatch();
  const uiT = useClock((s) => s.uiT);
  const duration = useClock((s) => s.duration);
  const seek = useClock((s) => s.seek);
  const pause = useClock((s) => s.pause);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct = duration > 0 ? (uiT / duration) * 100 : 0;

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(f * duration);
  };

  return (
    <div className={styles.timeline}>
      <span className={styles.tlTime}>{mmss(uiT)}</span>
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
              background: MARKER_COLOR[ev.type] ?? '#8a8f9a',
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              seek(ev.t);
            }}
          >
            <span className={styles.tlTip}>
              {mmss(ev.t)} · {ev.text ?? ev.type}
            </span>
          </div>
        ))}
        <div className={styles.tlHead} style={{ left: `${pct}%` }} />
      </div>
      <span className={styles.tlTime}>{mmss(duration)}</span>
    </div>
  );
}
