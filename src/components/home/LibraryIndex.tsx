'use client';

/**
 * LibraryIndex — the featured shelf as a broadcast programme guide, not a card
 * grid. Fixtures are full-width editorial rows; pointing at (or keyboard-
 * focusing) a row swaps the big sticky preview panel to that match's render
 * and metadata. Row hover is the page's second (and last) accent moment: the
 * row borrows that match's own kit colors. The complete archive lives in the
 * ArchiveBrowser below this shelf.
 */

import Link from 'next/link';
import type { CatalogEntry } from '@/catalog';
import { ensureLegible } from '@/components/theme';
import { fmtDate, posterFor } from './format';
import { useState } from 'react';
import styles from './home.module.css';

export default function LibraryIndex({ entries }: { entries: CatalogEntry[] }) {
  const [activeId, setActiveId] = useState(entries[0]?.id);

  const active = entries.find((e) => e.id === activeId) ?? entries[0];

  return (
    <section className={styles.library} id="library">
      <header className={styles.libHead}>
        <h2 className={styles.libTitle}>
          Main events
          <span className={styles.libCount}> · {String(entries.length).padStart(2, '0')}</span>
        </h2>
        <a href="#archive" className={styles.filter}>
          Browse the full archive ↓
        </a>
      </header>

      <div className={styles.libBody}>
        {/* fixture rows */}
        <div className={styles.rows} onMouseLeave={() => setActiveId(entries[0]?.id)}>
          {entries.map((e, i) => {
            const [a, b] = e.teams;
            const isActive = active?.id === e.id;
            return (
              <Link
                key={e.id}
                href={`/match/${e.id}`}
                className={styles.row}
                data-active={isActive || undefined}
                style={{
                  ['--i' as string]: i,
                  ['--row-accent' as string]: ensureLegible(e.accent),
                  ['--kit-a' as string]: ensureLegible(a.color, 2.2),
                  ['--kit-b' as string]: ensureLegible(b.color, 2.2),
                }}
                onMouseEnter={() => setActiveId(e.id)}
                onFocus={() => setActiveId(e.id)}
              >
                <span className={styles.rowThumb} aria-hidden>
                  <img src={posterFor(e.id)} alt="" loading="lazy" />
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowComp}>
                    <span className={styles.rowDots} aria-hidden>
                      <i style={{ background: 'var(--kit-a)' }} />
                      <i style={{ background: 'var(--kit-b)' }} />
                    </span>
                    {e.competition} {e.season}
                    {e.stage ? ` · ${e.stage}` : ''}
                  </span>
                  <span className={styles.rowTeams}>
                    {a.short}
                    <em>
                      {e.score[0]}–{e.score[1]}
                    </em>
                    {b.short}
                  </span>
                </span>
                <span className={styles.rowMeta}>
                  <span>{e.venue}</span>
                  <span className={styles.rowDate}>
                    {fmtDate(e.date)} · {e.mood}
                  </span>
                </span>
                <span className={styles.rowGo} aria-hidden>
                  Watch&nbsp;→
                </span>
              </Link>
            );
          })}
        </div>

        {/* sticky preview */}
        <aside className={styles.preview}>
          <div className={styles.previewFrame} aria-hidden>
            {entries.map((e) => (
              <img
                key={e.id}
                src={posterFor(e.id)}
                alt=""
                className={styles.previewImg}
                data-show={active?.id === e.id || undefined}
                loading="lazy"
              />
            ))}
            <span className={styles.previewTag}>{active?.competition}</span>
          </div>

          {active && (
            <div className={styles.previewMeta}>
              <div className={styles.previewChips} aria-hidden>
                {active.teams.map((t) => (
                  <span
                    key={t.short}
                    className={styles.previewChip}
                    style={{ ['--chip' as string]: ensureLegible(t.color, 2.2) }}
                  >
                    <i />
                    {t.name}
                  </span>
                ))}
              </div>
              <p className={styles.previewBlurb}>{active.blurb}</p>
              <dl className={styles.previewTable}>
                <div>
                  <dt>Venue</dt>
                  <dd>{active.venue ?? '—'}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{fmtDate(active.date) || '—'}</dd>
                </div>
                <div>
                  <dt>Final score</dt>
                  <dd>
                    {active.score[0]}–{active.score[1]}
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>Real event data</dd>
                </div>
              </dl>
              <Link href={`/match/${active.id}`} className={styles.previewGo}>
                Watch this match →
              </Link>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
