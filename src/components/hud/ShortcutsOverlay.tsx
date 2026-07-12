'use client';

/**
 * ShortcutsOverlay — the full keyboard legend, toggled by ? or the dock's ?
 * button. Replaces the old 9-second auto-dismissing HelpHint: discoverability
 * is now permanent. Doesn't pause playback — the match keeps running behind.
 */

import { useEffect, useRef } from 'react';
import { useClock } from '@/state/clock';
import { IconClose } from './Icons';
import styles from './hud.module.css';

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Playback',
    rows: [
      [['Space'], 'Play / pause'],
      [['←', '→'], 'Seek ±5 seconds'],
      [[',', '.'], 'Step one frame'],
      [['⌘', 'K'], 'Ask the match'],
      [['S'], 'Match stats'],
    ],
  },
  {
    title: 'Cameras',
    rows: [
      [['1'], 'Broadcast'],
      [['2'], 'Director (auto-cut TV)'],
      [['3'], 'Player cam (auto or pick a player)'],
      [['4'], 'Orbit'],
      [['5'], 'Fly'],
      [['V'], 'First ↔ third person'],
      [['F'], 'Follow next player'],
      [['T'], 'Tactical radar'],
    ],
  },
  {
    title: 'Fly mode',
    rows: [
      [['W', 'A', 'S', 'D'], 'Move'],
      [['Q', 'E'], 'Down / up'],
      [['Esc'], 'Release the camera'],
    ],
  },
  {
    title: 'View',
    rows: [
      [['⇧', 'F'], 'Fullscreen'],
      [['?'], 'This overlay'],
      [['Esc'], 'Close panels'],
    ],
  },
];

export default function ShortcutsOverlay() {
  const open = useClock((s) => s.shortcutsOpen);
  const setOpen = useClock((s) => s.setShortcutsOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  // move focus into the dialog when it opens
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.shortcutsBackdrop} onClick={() => setOpen(false)}>
      <div
        className={styles.shortcuts}
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.shortcutsHead}>
          <span className={styles.shortcutsTitle}>Controls</span>
          <button
            className={styles.panelClose}
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
          >
            <IconClose size={15} />
          </button>
        </div>
        <div className={styles.shortcutsGrid}>
          {GROUPS.map((g) => (
            <section key={g.title} className={styles.shortcutsGroup}>
              <h3 className={styles.shortcutsGroupTitle}>{g.title}</h3>
              {g.rows.map(([keys, label]) => (
                <div className={styles.shortcutsRow} key={label}>
                  <span className={styles.shortcutsKeys}>
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                  <span className={styles.shortcutsLabel}>{label}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
        <p className={styles.shortcutsFoot}>Drag the timeline to scrub · click a commentary line to replay it</p>
      </div>
    </div>
  );
}
