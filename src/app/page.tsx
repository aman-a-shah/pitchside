'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { CATALOG, CatalogEntry } from '@/catalog';
import { Sport } from '@/ir/types';
import styles from './page.module.css';

type Filter = Sport | 'all';

const SPORT_META: Record<Sport, { label: string; short: string }> = {
  soccer: { label: 'Football', short: 'Football' },
  basketball: { label: 'Basketball', short: 'Basketball' },
  tennis: { label: 'Tennis', short: 'Tennis' },
};

/* ---- monoline sport glyphs (no emoji) ---- */
function SportGlyph({ sport, className }: { sport: Sport; className?: string }) {
  const common = {
    className,
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (sport === 'basketball') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3v18M5.6 5.6c3.5 3 3.5 9.8 0 12.8M18.4 5.6c-3.5 3-3.5 9.8 0 12.8" />
      </svg>
    );
  }
  if (sport === 'tennis') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M4.2 6.5c4 2.2 4 8.8 0 11M19.8 6.5c-4 2.2-4 8.8 0 11" />
      </svg>
    );
  }
  // soccer
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3 2.2-1.1 3.5h-3.8L9 10.4z" />
      <path d="M12 3v5.2M4.4 9.6l4.6.8M19.6 9.6l-4.6.8M8 20l2-6M16 20l-2-6" />
    </svg>
  );
}

/** dual-tone "clash" art built from the two team colors */
function clashGradient(e: CatalogEntry): string {
  const [a, b] = e.teams;
  return `linear-gradient(115deg, ${a.color} 0%, ${shade(a.color, -34)} 38%, ${shade(
    b.color,
    -40
  )} 60%, ${b.color} 108%)`;
}

function shade(hex: string, pct: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + (255 * pct) / 100));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + (255 * pct) / 100));
  const b = Math.max(0, Math.min(255, (n & 255) + (255 * pct) / 100));
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

function fmtDate(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(+dt)) return d;
  return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function TeamDot({ color }: { color: string }) {
  return <span className={styles.teamDot} style={{ background: color }} />;
}

function MatchCard({ e, i }: { e: CatalogEntry; i: number }) {
  const ref = useRef<HTMLAnchorElement>(null);

  const onMove = (ev: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width;
    const py = (ev.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - py) * 7}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * 9}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  const [a, b] = e.teams;
  return (
    <Link
      href={`/match/${e.id}`}
      className={styles.card}
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{
        animationDelay: `${i * 55}ms`,
        ['--accent-team' as string]: e.accent,
      }}
    >
      <div className={styles.cardInner}>
        <div className={styles.cardArt} style={{ background: clashGradient(e) }} />
        <div className={styles.cardSheen} />
        <div className={`${styles.cardLines}`} aria-hidden />
        <div className={`${styles.grain} grain-layer`} aria-hidden />

        <div className={styles.cardTop}>
          <span className={styles.sportChip}>
            <SportGlyph sport={e.sport} className={styles.sportChipGlyph} />
            {SPORT_META[e.sport].short}
          </span>
          <span className={styles.fidChip}>
            <span className={styles.fidDiamond} />
            Reconstructed
          </span>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.comp}>{e.competition}</div>
          <div className={styles.matchTitle}>{e.title}</div>

          <div className={styles.teams}>
            <span className={styles.teamName}>
              <TeamDot color={a.color} />
              {a.short}
            </span>
            <span className={styles.vs}>vs</span>
            <span className={styles.teamName}>
              {b.short}
              <TeamDot color={b.color} />
            </span>
          </div>

          <p className={styles.blurb}>{e.blurb}</p>

          <div className={styles.cardFoot}>
            <span className={styles.venue}>
              {e.venue}
              {e.date ? ` · ${fmtDate(e.date)}` : ''}
            </span>
            <span className={styles.enter}>
              Enter
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function GalleryPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const sports = Object.keys(SPORT_META) as Sport[];
  const featured = CATALOG[0];
  const shown = CATALOG.filter((e) => filter === 'all' || e.sport === filter);

  const [fa, fb] = featured.teams;

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden>
        <span className={styles.aurora} />
        <span className={styles.aurora2} />
        <span className={styles.pitchGrid} />
        <span className={`${styles.pageGrain} grain-layer`} />
      </div>

      <nav className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <span className={styles.brandPulse} />
          </span>
          PITCHSIDE
        </div>
        <div className={styles.navMeta}>
          <span className={styles.navStat}>{CATALOG.length} matches</span>
          <span className={styles.navSep} />
          <span className={styles.navStat}>3 sports</span>
        </div>
      </nav>

      {/* -------------------- hero -------------------- */}
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>
            <span className={styles.kickerDot} />
            Real matches · reconstructed in 3D
          </div>
          <h1 className={styles.title}>
            Step inside
            <br />
            the game.
          </h1>
          <p className={styles.subtitle}>
            PitchSide rebuilds real sports moments in a living, navigable 3D world. Fly the
            camera onto the pitch, pause on a goal, rewind, and watch it breathe in slow
            motion.
          </p>
          <div className={styles.ctaRow}>
            <Link href={`/match/${featured.id}`} className={styles.ctaPrimary}>
              Enter the marquee match
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <a href="#library" className={styles.ctaGhost}>
              Browse the library
            </a>
          </div>
        </div>

        <Link href={`/match/${featured.id}`} className={styles.featured}>
          <div className={styles.featuredArt} style={{ background: clashGradient(featured) }} />
          <div className={styles.featuredSheen} />
          <div className={`${styles.grain} grain-layer`} aria-hidden />
          <div className={styles.featuredTag}>
            <span className={styles.featuredTagDot} />
            Featured reconstruction
          </div>
          <div className={styles.featuredBody}>
            <div className={styles.featuredComp}>{featured.competition}</div>
            <div className={styles.featuredTitle}>{featured.title}</div>
            <div className={styles.featuredScore}>
              <span className={styles.fTeam}>
                <TeamDot color={fa.color} />
                {fa.short}
              </span>
              <span className={styles.fVs}>vs</span>
              <span className={styles.fTeam}>
                {fb.short}
                <TeamDot color={fb.color} />
              </span>
            </div>
            <div className={styles.featuredMeta}>
              {featured.venue}
              {featured.date ? ` · ${fmtDate(featured.date)}` : ''}
            </div>
            <span className={styles.featuredPlay}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          </div>
        </Link>
      </header>

      {/* -------------------- library -------------------- */}
      <section className={styles.library} id="library">
        <div className={styles.libHead}>
          <h2 className={styles.libTitle}>Match library</h2>
          <div className={styles.filters} role="tablist" aria-label="Filter by sport">
            <button
              role="tab"
              aria-selected={filter === 'all'}
              className={`${styles.filter} ${filter === 'all' ? styles.filterOn : ''}`}
              onClick={() => setFilter('all')}
            >
              All
              <span className={styles.filterCount}>{CATALOG.length}</span>
            </button>
            {sports.map((s) => {
              const n = CATALOG.filter((e) => e.sport === s).length;
              return (
                <button
                  key={s}
                  role="tab"
                  aria-selected={filter === s}
                  className={`${styles.filter} ${filter === s ? styles.filterOn : ''}`}
                  onClick={() => setFilter(s)}
                >
                  <SportGlyph sport={s} className={styles.filterGlyph} />
                  {SPORT_META[s].label}
                  <span className={styles.filterCount}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.grid} key={filter}>
          {shown.map((e, i) => (
            <MatchCard e={e} i={i} key={e.id} />
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footBrand}>PITCHSIDE</div>
        <p className={styles.footText}>
          Motion is synthesized by PitchSide&rsquo;s engine — formation shape, pressing lines
          and ball physics — the same pipeline real tracking data plugs into. Rendered with
          Three.js and React Three Fiber.
        </p>
      </footer>
    </main>
  );
}
