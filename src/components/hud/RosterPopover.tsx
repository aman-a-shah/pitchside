'use client';

/**
 * PlayerCamPopover — configures the player cam in one place: the view
 * (first person, through their eyes / third person, behind them) and the
 * target (auto = whoever is nearest the ball, or an exact player). Anchored
 * above the Player segment in the dock. Hovering a row previews the player
 * on the tactical radar (dashed ring via selectedId); clicking locks the
 * cam to them. Picking a target closes the popover; flipping the view
 * doesn't — you're expected to want both.
 */

import { useEffect, useRef } from 'react';
import { useMatch } from '@/state/match';
import { PovView, useClock } from '@/state/clock';
import { IconFollow, IconPov } from './Icons';
import styles from './hud.module.css';

const VIEWS: { view: PovView; label: string; hint: string; Icon: typeof IconPov }[] = [
  { view: 'third', label: 'Third person', hint: 'behind the player', Icon: IconFollow },
  { view: 'first', label: 'First person', hint: 'through their eyes', Icon: IconPov },
];

export default function PlayerCamPopover() {
  const { ir, players } = useMatch();
  const open = useClock((s) => s.rosterOpen);
  const followId = useClock((s) => s.followId);
  const povView = useClock((s) => s.povView);
  const setRosterOpen = useClock((s) => s.setRosterOpen);
  const setPovView = useClock((s) => s.setPovView);
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
              // clicking the locked player releases back to auto
              setFollow(followId === p.id ? null : p.id);
              setRosterOpen(false);
            }}
          >
            <i className={styles.rosterNum} style={{ color: kitVar }}>
              {p.number != null ? p.number : '—'}
            </i>
            <span className={styles.rosterName}>{p.name ?? p.id}</span>
            <span className={styles.rosterPos}>{p.position}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.roster} ref={rootRef} role="menu" aria-label="Player cam">
      <div className={styles.viewToggle} role="group" aria-label="View">
        {VIEWS.map(({ view, label, hint, Icon }) => (
          <button
            key={view}
            className={styles.viewOpt}
            data-on={povView === view || undefined}
            onClick={() => setPovView(view)}
            aria-pressed={povView === view}
          >
            <Icon size={15} />
            <span>
              {label}
              <em>{hint}</em>
            </span>
          </button>
        ))}
      </div>

      <button
        className={`${styles.rosterRow} ${styles.rosterAuto}`}
        data-on={!followId || undefined}
        onClick={() => {
          setFollow(null);
          setRosterOpen(false);
        }}
      >
        <i className={styles.rosterNum}>◉</i>
        <span className={styles.rosterName}>Auto</span>
        <span className={styles.rosterPos}>nearest the ball</span>
      </button>

      <div className={styles.rosterHead}>
        <span className={styles.rosterTeam}>
          <i style={{ background: 'var(--home-legible)' }} />
          {home.short}
        </span>
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
