'use client';

/**
 * StickyNav — slim fixed bar that slides in only after the scroll-film hero
 * has fully released, so it never competes with the film's own nav overlay.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './sections.module.css';

export default function StickyNav({ featuredHref }: { featuredHref: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const film = document.querySelector('[data-film]');
    if (!film) return;
    const io = new IntersectionObserver(([e]) => setOn(!e.isIntersecting));
    io.observe(film);
    return () => io.disconnect();
  }, []);

  return (
    <header className={styles.stickyNav} data-on={on || undefined} aria-hidden={!on}>
      <a href="#top" className={styles.stickyBrand}>
        PitchSide<span className={styles.footBrandDot}>.</span>
      </a>
      <div className={styles.stickyRight}>
        <a href="#library" className={styles.stickyLink} tabIndex={on ? 0 : -1}>
          Library
        </a>
        <Link href={featuredHref} className={styles.stickyCta} tabIndex={on ? 0 : -1}>
          Enter a match
        </Link>
      </div>
    </header>
  );
}
