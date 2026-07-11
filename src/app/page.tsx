'use client';

import { useEffect, useState } from 'react';
import { CatalogEntry, FEATURED, loadCatalog } from '@/catalog';
import ScrollFilm from '@/components/home/ScrollFilm';
import StickyNav from '@/components/home/StickyNav';
import FeaturedMatch from '@/components/home/FeaturedMatch';
import SportShowcase from '@/components/home/SportShowcase';
import EnginePipeline from '@/components/home/EnginePipeline';
import LibraryIndex from '@/components/home/LibraryIndex';
import ArchiveBrowser from '@/components/home/ArchiveBrowser';
import SiteFooter from '@/components/home/SiteFooter';
import styles from '@/components/home/sections.module.css';

export default function HomePage() {
  const featured = FEATURED[0];
  const [archive, setArchive] = useState<CatalogEntry[] | null>(null);
  const [compFilter, setCompFilter] = useState<string>('all');

  // the full real-match index (~4k rows) loads after first paint
  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((all) => alive && setArchive(all))
      .catch(() => alive && setArchive([]));
    return () => {
      alive = false;
    };
  }, []);

  const matchCount = archive ? archive.length.toLocaleString('en-US') : '3,900+';
  const compCount = archive ? new Set(archive.map((e) => e.competition)).size : 24;

  return (
    <main>
      <StickyNav featuredHref={`/match/${featured.id}`} />

      <ScrollFilm featuredHref={`/match/${featured.id}`} />

      {/* the wire — one strip of broadcast data between the film and the page */}
      <div className={styles.wire}>
        <div className={styles.wireInner}>
          <span className={styles.wireTag}>Real event data</span>
          <p className={styles.wireText}>
            Every pass, shot and save from real recorded matches — World Cup finals to
            El Clásico — rebuilt as living 3D worlds and rendered at 60fps in your browser.
          </p>
          <span className={styles.wireData}>
            <b>{matchCount}</b> real matches · <b>{compCount}</b> competitions · <b>60</b> fps
          </span>
        </div>
      </div>

      <FeaturedMatch entry={featured} />

      <SportShowcase archive={archive} onBrowse={setCompFilter} />

      <EnginePipeline />

      <LibraryIndex entries={FEATURED} />

      <ArchiveBrowser entries={archive} filter={compFilter} onFilter={setCompFilter} />

      <SiteFooter entries={FEATURED} />
    </main>
  );
}
