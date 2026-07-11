'use client';

/**
 * StatsPanel — live team statistics derived from the event stream, occupying
 * the right-edge panel slot (mutually exclusive with VideoPanel; the store
 * enforces it). Mirrored center-out bars in the legibility-guarded kit
 * colors; values tick up live as the match plays.
 */

import { useMemo } from 'react';
import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import { buildStatsTable } from '@/lib/stats';
import { IconClose, IconStats } from './Icons';
import styles from './hud.module.css';

export default function StatsPanel() {
  const { ir } = useMatch();
  const open = useClock((s) => s.statsOpen);
  const uiT = useClock((s) => s.uiT);
  const setStatsOpen = useClock((s) => s.setStatsOpen);

  const statsAt = useMemo(() => buildStatsTable(ir), [ir]);
  const [home, away] = ir.meta.teams;

  if (!open) return null;
  const rows = statsAt(uiT);
  const detail = ir.sport === 'tennis' ? snapshotDetail(ir, uiT) : null;

  return (
    <aside className={styles.stats} aria-label="Match statistics">
      <div className={styles.statsHead}>
        <span className={styles.statsTitle}>
          <IconStats size={14} />
          Match stats
        </span>
        <button
          className={styles.panelClose}
          onClick={() => setStatsOpen(false)}
          aria-label="Close stats"
          title="Close (S)"
        >
          <IconClose size={15} />
        </button>
      </div>

      <div className={styles.statsTeams}>
        <span className={styles.statsTeam}>
          <i style={{ background: 'var(--home-legible)' }} />
          {home.short}
        </span>
        {detail && <span className={styles.statsDetail}>{detail}</span>}
        <span className={styles.statsTeam}>
          {away.short}
          <i style={{ background: 'var(--away-legible)' }} />
        </span>
      </div>

      <div className={styles.statsRows}>
        {rows.map((r) => (
          <div className={styles.statRow} key={r.label}>
            <div className={styles.statNums}>
              <span className={styles.statVal}>{r.homeText}</span>
              <span className={styles.statLabel}>{r.label}</span>
              <span className={styles.statVal}>{r.awayText}</span>
            </div>
            <div className={styles.statBars} aria-hidden>
              <span className={styles.statTrack}>
                <i
                  className={styles.statFillHome}
                  style={{ transform: `scaleX(${r.homeShare})` }}
                />
              </span>
              <span className={styles.statTrack}>
                <i
                  className={styles.statFillAway}
                  style={{ transform: `scaleX(${1 - r.homeShare})` }}
                />
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className={styles.statsFoot}>Derived live from the real event stream · StatsBomb</p>
    </aside>
  );
}

function snapshotDetail(ir: ReturnType<typeof useMatch>['ir'], t: number): string | null {
  let detail: string | null = null;
  for (const s of ir.scoreboard) {
    if (s.t > t) break;
    detail = s.detail ?? detail;
  }
  return detail;
}
