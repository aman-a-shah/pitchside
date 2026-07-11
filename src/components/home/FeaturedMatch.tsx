'use client';

/**
 * FeaturedMatch — the marquee fixture as a broadcast billboard. This is the
 * first (of two) places the per-match theme colors the home page: the whole
 * section runs under deriveMatchTheme(entry), so the kicker and kit bars pick
 * up the match's own identity while the chrome stays ink/chalk.
 */

import { useRef } from 'react';
import Link from 'next/link';
import type { CatalogEntry } from '@/catalog';
import { deriveMatchTheme } from '@/components/theme';
import { fmtDate, posterFor } from './format';
import { useSectionFx } from './useSectionFx';
import styles from './sections.module.css';

export default function FeaturedMatch({ entry }: { entry: CatalogEntry }) {
  const artRef = useRef<HTMLImageElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useSectionFx((fx) => {
    fx.parallax(artRef.current, 5);
    fx.revealChildren(bodyRef.current);
  });

  const [a, b] = entry.teams;

  return (
    <section className={styles.featured} style={deriveMatchTheme(entry)} aria-label="Featured match">
      <div className={styles.featuredFrame}>
        <img
          ref={artRef}
          className={styles.featuredArt}
          src={posterFor(entry.id)}
          alt={`Engine render of ${entry.title}`}
        />
        <div className={styles.featuredScrim} aria-hidden />
        <div className={styles.featuredBody} ref={bodyRef}>
          <p className={styles.featuredKicker}>
            Main event · {entry.competition} · {entry.venue}
          </p>
          <h2 className={styles.featuredTeams}>
            {a.name}
            <span className={styles.featuredBars} aria-hidden>
              <i style={{ background: 'var(--home-legible)' }} />
              <i style={{ background: 'var(--away-legible)' }} />
            </span>
            {b.name}
          </h2>
          <p className={styles.featuredBlurb}>{entry.blurb}</p>
          <div className={styles.featuredCtas}>
            <Link href={`/match/${entry.id}`} className={styles.ctaPill}>
              Enter the match
            </Link>
            <span className={styles.featuredMeta}>
              {fmtDate(entry.date)} · {entry.mood} · engine render
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
