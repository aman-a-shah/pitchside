'use client';

/**
 * LoadingOverlay — real progress, not a timer. MatchView passes the actual
 * readiness stage: 0 downloading the real event stream → 1 IR reconstructed
 * → 2 WebGL context up → 3 first frame flushed. While the (multi-MB) event
 * download runs, the bar tracks actual bytes; `done` fades the overlay out
 * over the live scene.
 */

import Link from 'next/link';
import { CatalogEntry } from '@/catalog';
import { posterFor } from '@/components/home/format';
import styles from './match.module.css';

const STAGES: { label: string; pct: number }[] = [
  { label: 'Downloading the real event stream', pct: 50 },
  { label: 'Reconstructing player trajectories', pct: 72 },
  { label: 'Lighting the pitch', pct: 90 },
  { label: 'Ready', pct: 100 },
];

export default function LoadingOverlay({
  entry,
  stage,
  done,
  loadedBytes,
  error,
}: {
  entry?: CatalogEntry | null;
  stage: number;
  done?: boolean;
  /** bytes of event data received so far (stage 0) */
  loadedBytes?: number;
  error?: string | null;
}) {
  const s = STAGES[Math.max(0, Math.min(stage, STAGES.length - 1))];
  const [home, away] = entry?.teams ?? [];
  const poster = entry ? posterFor(entry.id) : undefined;

  // stage 0 fills 0→50% as real bytes arrive (event files run ~2–6MB)
  const pct =
    stage === 0 && loadedBytes != null
      ? Math.min(48, (loadedBytes / 5_000_000) * 50)
      : s.pct;

  const label =
    stage === 0 && loadedBytes != null
      ? `${s.label} — ${(loadedBytes / 1_000_000).toFixed(1)} MB`
      : s.label;

  return (
    <div className={styles.loading} data-out={done || undefined}>
      {poster && (
        <div className={styles.loadingArt} style={{ backgroundImage: `url(${poster})` }} />
      )}
      <div className={styles.loadingScrim} />

      <div className={styles.loadingInner}>
        <div className={styles.loadingTag}>{error ? 'Reconstruction failed' : 'Reconstructing'}</div>

        {home && away && (
          <div className={styles.loadingVs}>
            <span className={styles.loadingSide}>
              <i className={styles.loadingDot} style={{ background: home.color }} />
              {home.short}
            </span>
            <span className={styles.loadingSep}>v</span>
            <span className={styles.loadingSide}>
              {away.short}
              <i className={styles.loadingDot} style={{ background: away.color }} />
            </span>
          </div>
        )}

        <div className={styles.loadingTitle}>{entry?.title ?? 'Loading match'}</div>
        <div className={styles.loadingSub}>
          {entry?.competition}
          {entry?.season ? ` ${entry.season}` : ''}
          {entry?.venue ? ` · ${entry.venue}` : ''}
        </div>

        {error ? (
          <div className={styles.loadingSteps}>
            {error.includes('Unknown match')
              ? 'This match is not in the archive.'
              : 'Could not reach the open-data archive — check your connection and retry.'}{' '}
            <Link href="/" style={{ color: 'inherit', textDecoration: 'underline' }}>
              Back to all matches
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.loadingBarWrap}>
              <div className={styles.loadingBar} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles.loadingSteps}>{label}…</div>
          </>
        )}
      </div>
    </div>
  );
}
