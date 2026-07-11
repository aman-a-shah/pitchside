'use client';

import { useEffect, useState } from 'react';
import { useClock } from '@/state/clock';
import styles from './match.module.css';

export default function HelpHint() {
  const [visible, setVisible] = useState(true);
  const cameraMode = useClock((s) => s.cameraMode);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 9000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.help}>
      {cameraMode === 'fly' ? (
        <span>
          <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · click to look ·{' '}
          <kbd>Q</kbd>/<kbd>E</kbd> down/up · <kbd>Esc</kbd> release
        </span>
      ) : (
        <span>
          <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> seek · <kbd>F</kbd> follow a
          player · drag the timeline to scrub
        </span>
      )}
      <button className={styles.helpClose} onClick={() => setVisible(false)}>
        ✕
      </button>
    </div>
  );
}
