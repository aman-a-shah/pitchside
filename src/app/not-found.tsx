import Link from 'next/link';
import styles from '@/components/home/sections.module.css';

export default function NotFound() {
  return (
    <main className={styles.nf}>
      <div className={styles.nfArt} aria-hidden />
      <div className={styles.nfScrim} aria-hidden />
      <div className={styles.nfBody}>
        <p className={styles.nfCode}>404 · OFF THE PITCH</p>
        <h1 className={styles.nfTitle}>This fixture isn&rsquo;t in the programme.</h1>
        <p className={styles.nfText}>
          The match you&rsquo;re looking for was never scheduled — or the reconstruction
          hasn&rsquo;t been synthesized yet.
        </p>
        <Link href="/" className={styles.ctaPill}>
          Back to the library
        </Link>
      </div>
    </main>
  );
}
