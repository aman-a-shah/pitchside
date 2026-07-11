'use client';

import Link from 'next/link';
import { CatalogEntry } from '@/catalog';
import { useMatch } from '@/state/match';
import { IconArrowLeft } from './Icons';
import styles from './hud.module.css';

export default function TopBar({ entry }: { entry: CatalogEntry }) {
  const { ir } = useMatch();
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
        </div>
      </div>
    </div>
  );
}
