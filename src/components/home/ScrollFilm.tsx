'use client';

/**
 * ScrollFilm — the homepage hero. IN-ENGINE footage (the real PitchSide
 * renderer filming Di María's goal in the 2022 World Cup final, captured by
 * scripts/film.mjs and encoded all-keyframe so every frame is seekable) is
 * pinned to the viewport and SCRUBBED by the user's scroll: the page's first
 * 320vh crane down from above the stands into the goalmouth, while the
 * headline advances in three beats. What you scrub IS the product.
 *
 * All scroll work happens in one rAF loop writing CSS custom properties and
 * video.currentTime directly — React never re-renders during scroll.
 * prefers-reduced-motion swaps the scrub for a static frame and shows the
 * final beat only.
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './home.module.css';

const VIDEO_SRC = '/video/hero-stadium.mp4';
const POSTER_SRC = '/video/hero-stadium-poster.jpg';

export default function ScrollFilm({ featuredHref }: { featuredHref: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      root.style.setProperty('--p', '1');
      root.dataset.stage = 'c';
      return;
    }

    let raf = 0;
    let smoothT = 0; // smoothed video time
    let ready = false;
    let seeking = false;
    let stage = '';

    const onReady = () => {
      ready = true;
      video.pause();
    };
    // serialize seeks: issue the next one only when the last completed, and
    // reveal the video only once a frame has actually been presented (until
    // then the poster img underneath carries the hero)
    const onSeeked = () => {
      seeking = false;
      root.dataset.ready = '1';
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onSeeked);
    if (video.readyState >= 1) onReady();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const rect = root.getBoundingClientRect();
      const runway = rect.height - window.innerHeight;
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(runway, 1)));
      root.style.setProperty('--p', p.toFixed(4));

      // gate pointer events so invisible CTAs can't swallow early clicks
      const next = p > 0.64 ? 'c' : p > 0.3 ? 'b' : 'a';
      if (next !== stage) {
        stage = next;
        root.dataset.stage = next;
      }

      if (ready && !seeking && video.duration) {
        const target = p * (video.duration - 0.1);
        // ease toward the target so fast flicks don't demand 60 seeks/second
        smoothT += (target - smoothT) * 0.22;
        if (Math.abs(video.currentTime - smoothT) > 1 / 48) {
          seeking = true;
          video.currentTime = smoothT;
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onSeeked);
    };
  }, []);

  return (
    <div className={styles.film} ref={rootRef} data-film id="top">
      <div className={styles.filmStage}>
        <span className={styles.filmProgress} aria-hidden />
        {/* footage */}
        <img src={POSTER_SRC} alt="" className={styles.filmPoster} aria-hidden />
        <video
          ref={videoRef}
          className={styles.filmVideo}
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted
          playsInline
          preload="auto"
          aria-hidden
        />
        <div className={styles.filmScrim} aria-hidden />

        {/* nav overlay */}
        <nav className={styles.nav}>
          <span className={styles.brand}>
            PitchSide<span className={styles.brandDot}>.</span>
          </span>
          <div className={styles.navRight}>
            <a href="#library" className={styles.navLink}>
              Library
            </a>
            <Link href={featuredHref} className={styles.navCta}>
              Enter a match
            </Link>
          </div>
        </nav>

        {/* the three beats */}
        <div className={styles.beat} data-beat="a" aria-hidden>
          <p className={styles.beatLine}>Every match leaves a record.</p>
        </div>
        <div className={styles.beat} data-beat="b" aria-hidden>
          <p className={styles.beatLine}>Even the ones no camera kept.</p>
        </div>
        <div className={styles.beat} data-beat="c">
          <h1 className={styles.title}>
            Step inside
            <br />
            the game.
          </h1>
          <p className={styles.subtitle}>
            A time machine for football — Pelé &rsquo;58 to Messi &rsquo;22, rebuilt in 3D
            from the real record. Pause the goal. Rewind the break. Fly anywhere.
          </p>
          <div className={styles.ctaRow}>
            <Link href={featuredHref} className={styles.ctaPrimary}>
              Enter the marquee match
            </Link>
            <a href="#library" className={styles.ctaGhost}>
              Browse the library ↓
            </a>
          </div>
        </div>

        <div className={styles.scrollHint} aria-hidden>
          <span>Scroll</span>
          <i />
        </div>
      </div>
    </div>
  );
}
