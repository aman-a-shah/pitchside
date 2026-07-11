'use client';

/**
 * SportShowcase — "three shelves of history": one full-width editorial row per
 * marquee competition, alternating art/text sides. Deliberately not a card
 * grid; the engine renders carry the color while the chrome stays monochrome.
 * Each row's link filters the archive below to that competition.
 */

import { useRef } from 'react';
import type { CatalogEntry } from '@/catalog';
import { posterFor } from './format';
import { useSectionFx } from './useSectionFx';
import styles from './sections.module.css';

const SHELVES: { competition: string; art: string; copy: string }[] = [
  {
    competition: 'FIFA World Cup',
    art: 'sb-3869685',
    copy: 'Every World Cup final back to Pelé in 1958, plus the full 2018 and 2022 tournaments — each one rebuilt from its real event record.',
  },
  {
    competition: 'Champions League',
    art: 'sb-8658',
    copy: 'Two decades of European finals — Istanbul 2005, Wembley 2011, Madrid’s three-peat — point by real point.',
  },
  {
    competition: 'La Liga',
    art: 'sb-3943043',
    copy: 'The entire Messi era at Barcelona: over 800 league matches, including every Clásico from Ronaldinho to the 5–0 Manita.',
  },
];

interface Props {
  /** the full archive, null while its index loads */
  archive: CatalogEntry[] | null;
  onBrowse: (competition: string) => void;
}

export default function SportShowcase({ archive, onBrowse }: Props) {
  const rootRef = useRef<HTMLElement>(null);

  useSectionFx((fx) => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('[data-show-art] img').forEach((img) => fx.parallax(img, 5));
    root.querySelectorAll('[data-show-body]').forEach((body) => fx.revealChildren(body));
  });

  return (
    <section className={styles.showcase} ref={rootRef} aria-label="Marquee competitions">
      {SHELVES.map((w, i) => {
        const count = archive?.filter((e) => e.competition === w.competition).length;
        return (
          <div className={styles.showRow} key={w.competition} data-flip={i % 2 === 1 || undefined}>
            <div className={styles.showArt} data-show-art>
              <img src={posterFor(w.art)} alt={`${w.competition} engine render`} loading="lazy" />
              <span className={styles.showArtTag}>Engine render</span>
            </div>
            <div className={styles.showBody} data-show-body>
              <h3 className={styles.showSport}>{w.competition}</h3>
              <p className={styles.showCopy}>{w.copy}</p>
              <p className={styles.showCount}>
                {count != null
                  ? `${count.toLocaleString('en-US')} real ${count === 1 ? 'match' : 'matches'} in the archive`
                  : 'Loading the archive…'}
              </p>
              <a href="#archive" className={styles.showLink} onClick={() => onBrowse(w.competition)}>
                Browse {w.competition} →
              </a>
            </div>
          </div>
        );
      })}
    </section>
  );
}
