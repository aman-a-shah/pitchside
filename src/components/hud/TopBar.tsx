'use client';

import Link from 'next/link';
import { CatalogEntry } from '@/catalog';
import { useMatch } from '@/state/match';
import { eraChip } from '@/lib/era';
import { IconArrowLeft } from './Icons';
import styles from './hud.module.css';

export default function TopBar({ entry }: { entry: CatalogEntry }) {
  const { ir } = useMatch();
  const era = eraChip(ir.meta.era ?? 'modern', ir.meta.date);
  return (
    <div className={styles.topbar}>
      <Link href="/" className={styles.back}>
        <IconArrowLeft size={16} />
        <span>All matches</span>
      </Link>
      <div className={styles.titleWrap}>
        <div className={styles.matchName}>{entry.title}</div>
        <div className={styles.matchMetaRow}>
          <span className={styles.matchSub}>
            {entry.competition}
            {entry.venue ? ` · ${entry.venue}` : ''}
          </span>
          <span className={styles.fidChip} title={ir.meta.attribution}>
            <span className={styles.fidDot} />
            {ir.fidelity === 'synth' ? 'Simulation' : 'Real data · StatsBomb'}
          </span>
          {era && (
            <span
              className={styles.fidChip}
              title="Reconstructed from the historical event record — presented on the film stock of its decade"
            >
              {era}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
