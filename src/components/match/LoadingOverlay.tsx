'use client';

import { useEffect, useState } from 'react';
import { CatalogEntry } from '@/catalog';
import styles from './match.module.css';

const STEPS = [
  'Ingesting match data…',
  'Synthesizing player trajectories…',
  'Resolving ball physics…',
  'Dressing the stadium…',
  'Lighting the pitch…',
];

export default function LoadingOverlay({ entry }: { entry?: CatalogEntry }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 700);
    return () => clearInterval(id);
  }, []);

  const grad = entry
    ? `linear-gradient(135deg, ${entry.teams[0].color}, ${entry.teams[1].color})`
    : '#0a0e17';

  return (
    <div className={styles.loading}>
      <div className={styles.loadingArt} style={{ background: grad }} />
      <div className={styles.loadingInner}>
        <div className={styles.spinner} />
        <div className={styles.loadingTitle}>{entry?.title ?? 'Loading match'}</div>
        <div className={styles.loadingSub}>
          {entry?.competition}
          {entry?.venue ? ` · ${entry.venue}` : ''}
        </div>
        <div className={styles.loadingSteps}>{STEPS[step]}</div>
      </div>
    </div>
  );
}
