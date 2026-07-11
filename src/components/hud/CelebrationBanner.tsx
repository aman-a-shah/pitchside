'use client';

/**
 * CelebrationBanner — the broadcast lower-third for score moments. Fires only
 * when the playhead CROSSES a scoring moment during normal playback (a seek
 * or scrub never triggers it), holds for four seconds, and stays a caption:
 * the 3D scene's own celebration is the spectacle, this is the graphic.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import { ScoreMoment, scoreMoments } from '@/lib/stats';
import styles from './hud.module.css';

const HOLD_MS = 4000;
/** a uiT jump larger than this is a seek, not playback */
const MAX_PLAYBACK_STEP = 0.75;

export default function CelebrationBanner() {
  const { ir } = useMatch();
  const uiT = useClock((s) => s.uiT);
  const moments = useMemo(() => scoreMoments(ir), [ir]);

  const prevRef = useRef(uiT);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moment, setMoment] = useState<ScoreMoment | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = uiT;
    const dt = uiT - prev;

    if (dt < 0 || dt > MAX_PLAYBACK_STEP) {
      // seek / scrub — dismiss immediately
      if (timerRef.current) clearTimeout(timerRef.current);
      setMoment(null);
      return;
    }
    if (dt === 0) return;

    const hit = moments.find((m) => m.t > prev && m.t <= uiT);
    if (hit) {
      setMoment(hit);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMoment(null), HOLD_MS);
    }
  }, [uiT, moments]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  if (!moment) return null;

  const team = moment.side === 'home' ? ir.meta.teams[0] : ir.meta.teams[1];
  const kit = moment.side === 'home' ? 'var(--home-legible)' : 'var(--away-legible)';

  return (
    <div className={styles.banner} key={moment.t} role="status">
      <span className={styles.bannerRule} style={{ background: kit }} aria-hidden />
      <div className={styles.bannerRow}>
        <span className={styles.bannerLabel} style={{ color: kit }}>
          {moment.label}
        </span>
        <span className={styles.bannerText}>
          {/* the label already shouts the moment — strip a leading "GOAL!" from the line */}
          {moment.event?.text?.replace(/^goal!\s*/i, '') ?? `${team.name} score.`}
        </span>
        <span className={styles.bannerScore}>
          {moment.home}
          <i>:</i>
          {moment.away}
        </span>
      </div>
    </div>
  );
}
