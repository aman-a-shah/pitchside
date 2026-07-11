'use client';

/**
 * ArchiveBrowser — the full open-data archive (~4,000 real matches) as a
 * programme guide: a search field, one quiet competition rail, and compact
 * fixture rows. Deliberately monochrome; the featured shelf above carries the
 * color. Rendering is capped with a "show more" step so the DOM stays light.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { CatalogEntry } from '@/catalog';
import { ensureLegible } from '@/components/theme';
import { fmtDate } from './format';
import styles from './home.module.css';

const PAGE = 60;

interface Props {
  /** full catalog, null while the index loads */
  entries: CatalogEntry[] | null;
  filter: string; // competition name or 'all'
  onFilter: (c: string) => void;
}

export default function ArchiveBrowser({ entries, filter, onFilter }: Props) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const competitions = useMemo(() => {
    if (!entries) return [];
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.competition, (counts.get(e.competition) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const shown = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && e.competition !== filter) return false;
      if (!q) return true;
      return (
        e.teams[0].name.toLowerCase().includes(q) ||
        e.teams[1].name.toLowerCase().includes(q) ||
        e.competition.toLowerCase().includes(q) ||
        e.season.toLowerCase().includes(q) ||
        (e.stage?.toLowerCase().includes(q) ?? false) ||
        (e.venue?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [entries, filter, query]);

  const visible = shown.slice(0, limit);

  return (
    <section className={styles.archive} id="archive" aria-label="Full match archive">
      <header className={styles.libHead}>
        <h2 className={styles.libTitle}>
          The archive
          <span className={styles.libCount}>
            {' '}
            · {entries ? shown.length.toLocaleString('en-US') : '…'}
          </span>
        </h2>
        <input
          type="search"
          className={styles.archSearch}
          placeholder="Search teams, competitions, venues…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          aria-label="Search the match archive"
        />
      </header>

      <div className={styles.archRail} role="tablist" aria-label="Filter by competition">
        <button
          role="tab"
          aria-selected={filter === 'all'}
          className={styles.filter}
          data-on={filter === 'all' || undefined}
          onClick={() => onFilter('all')}
        >
          All
        </button>
        {competitions.map(([name, count]) => (
          <button
            key={name}
            role="tab"
            aria-selected={filter === name}
            className={styles.filter}
            data-on={filter === name || undefined}
            onClick={() => {
              onFilter(filter === name ? 'all' : name);
              setLimit(PAGE);
            }}
          >
            {name}
            <span className={styles.archChipCount}>{count}</span>
          </button>
        ))}
      </div>

      <div className={styles.archList}>
        {!entries && <p className={styles.archEmpty}>Loading the archive…</p>}
        {entries && shown.length === 0 && (
          <p className={styles.archEmpty}>No matches found — try a different search.</p>
        )}
        {visible.map((e) => {
          const [a, b] = e.teams;
          return (
            <Link
              key={e.id}
              href={`/match/${e.id}`}
              className={styles.archRow}
              style={{
                ['--kit-a' as string]: ensureLegible(a.color, 2.2),
                ['--kit-b' as string]: ensureLegible(b.color, 2.2),
              }}
            >
              <span className={styles.archDate}>{fmtDate(e.date)}</span>
              <span className={styles.archFixture}>
                <span className={styles.archTeam} data-side="h">
                  {a.name}
                  <i style={{ background: 'var(--kit-a)' }} aria-hidden />
                </span>
                <span className={styles.archScore}>
                  {e.score[0]}–{e.score[1]}
                </span>
                <span className={styles.archTeam} data-side="a">
                  <i style={{ background: 'var(--kit-b)' }} aria-hidden />
                  {b.name}
                </span>
              </span>
              <span className={styles.archMeta}>
                {e.competition} {e.season}
                {e.stage ? ` · ${e.stage}` : ''}
              </span>
              <span className={styles.rowGo} aria-hidden>
                Watch&nbsp;→
              </span>
            </Link>
          );
        })}
      </div>

      {shown.length > limit && (
        <button className={styles.archMore} onClick={() => setLimit((l) => l + PAGE * 4)}>
          Show more · {(shown.length - limit).toLocaleString('en-US')} remaining
        </button>
      )}
    </section>
  );
}
