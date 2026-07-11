/**
 * SiteFooter — the programme's back page. The full fixture index doubles as
 * navigation; credits stay in the mono data voice.
 */

import Link from 'next/link';
import type { CatalogEntry } from '@/catalog';
import styles from './sections.module.css';

const COMPETITIONS = ['FIFA World Cup', 'Champions League', 'La Liga', 'Premier League', "Women's World Cup"];

export default function SiteFooter({ entries }: { entries: CatalogEntry[] }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footBrandCol}>
          <span className={styles.footBrand}>
            PitchSide<span className={styles.footBrandDot}>.</span>
          </span>
          <p className={styles.footMission}>
            Real matches, rebuilt from their recorded event streams and rendered in real
            time — pause the goal, rewind the save, fly anywhere.
          </p>
          <p className={styles.footHint}>
            <kbd>?</kbd>
            <span>inside a match shows every control</span>
          </p>
        </div>

        <nav aria-label="All fixtures">
          <p className={styles.footColTitle}>Programme</p>
          <ul className={styles.footList}>
            {entries.map((e, i) => (
              <li key={e.id}>
                <Link href={`/match/${e.id}`} className={styles.footFixture}>
                  <i>{String(i + 1).padStart(2, '0')}</i>
                  {e.teams[0].short} v {e.teams[1].short} · {e.competition}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Competitions">
          <p className={styles.footColTitle}>Competitions</p>
          <ul className={styles.footList}>
            {COMPETITIONS.map((c) => (
              <li key={c}>
                <a href="#archive" className={styles.footLink}>
                  {c}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className={styles.footColTitle}>Made with</p>
          <p className={styles.footCredits}>
            Match data ·{' '}
            <a
              href="https://github.com/statsbomb/open-data"
              target="_blank"
              rel="noreferrer"
              className={styles.footLink}
            >
              StatsBomb Open Data
            </a>
            <br />
            Footage · Pexels
            <br />
            Characters · Quaternius (CC0)
            <br />
            Renderer · Three.js
            <br />
            Framework · Next.js
          </p>
        </div>
      </div>

      <div className={styles.footBase}>
        <div className={styles.footBaseInner}>
          <span>Every match rebuilt from real event data</span>
          <span>60 fps · WebGL</span>
        </div>
      </div>
    </footer>
  );
}
