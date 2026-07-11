'use client';

/**
 * RosterPopover — pick exactly who to follow instead of blind-cycling with F.
 * Two kit-headed team columns anchored above the Follow button. Hovering a
 * row previews the player on the tactical radar (dashed ring via selectedId);
 * clicking locks the follow camera to them.
 */

import { useEffect, useRef } from 'react';
import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import styles from './hud.module.css';

export default function RosterPopover() {
  const { ir, players } = useMatch();
  const open = useClock((s) => s.rosterOpen);
  const followId = useClock((s) => s.followId);
  const setRosterOpen = useClock((s) => s.setRosterOpen);
  const setFollow = useClock((s) => s.setFollow);
  const select = useClock((s) => s.select);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setRosterOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open, setRosterOpen]);

  // clear the radar preview whenever the popover closes
  useEffect(() => {
    if (!open) select(null);
  }, [open, select]);

  if (!open) return null;

  const [home, away] = ir.meta.teams;

  const column = (teamId: string, kitVar: string) => {
    const squad = players.filter((p) => p.team === teamId);
    return (
      <div className={styles.rosterCol}>
        {squad.map((p) => (
          <button
            key={p.id}
            className={styles.rosterRow}
            data-on={followId === p.id || undefined}
            onMouseEnter={() => select(p.id)}
            onMouseLeave={() => select(null)}
            onFocus={() => select(p.id)}
            onClick={() => {
              setFollow(followId === p.id ? null : p.id);
              setRosterOpen(false);
            }}
          >
            <i className={styles.rosterNum} style={{ color: kitVar }}>
              {p.number != null ? `#${p.number}` : '—'}
            </i>
            <span className={styles.rosterName}>{p.name ?? p.id}</span>
            <span className={styles.rosterPos}>{p.position}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.roster} ref={rootRef} role="menu" aria-label="Follow a player">
      <div className={styles.rosterHead}>
        <span className={styles.rosterTeam}>
          <i style={{ background: 'var(--home-legible)' }} />
          {home.short}
        </span>
        <span className={styles.rosterTitle}>Follow</span>
        <span className={styles.rosterTeam}>
          {away.short}
          <i style={{ background: 'var(--away-legible)' }} />
        </span>
      </div>
      <div className={styles.rosterCols}>
        {column(home.id, 'var(--home-legible)')}
        {column(away.id, 'var(--away-legible)')}
      </div>
    </div>
  );
}
