'use client';

/**
 * FirstRunHint — one slim chip, first visit only ("Press ? for controls").
 * Permanent discoverability lives in the dock's ? button + ShortcutsOverlay;
 * this just points new viewers at it, then never appears again.
 */

import { useEffect, useState } from 'react';
import styles from './match.module.css';

const KEY = 'pitchside.hintSeen';

export default function FirstRunHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
      localStorage.setItem(KEY, '1');
    } catch {
      /* private mode — show it anyway */
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.help}>
      <span>
        Press <kbd>?</kbd> for controls
      </span>
      <button className={styles.helpClose} onClick={() => setVisible(false)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
