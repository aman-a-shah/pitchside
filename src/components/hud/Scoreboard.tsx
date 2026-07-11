'use client';

import { useMatch } from '@/state/match';
import { useClock } from '@/state/clock';
import { ScoreSnapshot } from '@/ir/types';
import { broadcastClock } from '@/lib/format';
import styles from './hud.module.css';

function snapshotAt(list: ScoreSnapshot[], t: number): ScoreSnapshot {
  let cur = list[0];
  for (const s of list) {
    if (s.t <= t) cur = s;
    else break;
  }
  return cur;
}

export default function Scoreboard() {
  const { ir } = useMatch();
  const uiT = useClock((s) => s.uiT);
  const [home, away] = ir.meta.teams;
  const snap = snapshotAt(ir.scoreboard, uiT);

  return (
    <div className={styles.scoreboard}>
      <div
        className={`${styles.sbTeam} ${styles.sbHome}`}
        style={{ ['--kit' as string]: home.kit.primary }}
      >
        <span className={styles.sbKit} />
        <span className={styles.sbShort}>{home.short}</span>
      </div>
      <div className={styles.sbScore}>
        <span className={styles.sbNum}>
          {/* key remount re-triggers the roll each time the score changes */}
          <span className={styles.sbNumRoll} key={snap.home}>
            {snap.home}
          </span>
        </span>
        <span className={styles.sbColon}>:</span>
        <span className={styles.sbNum}>
          <span className={styles.sbNumRoll} key={snap.away}>
            {snap.away}
          </span>
        </span>
      </div>
      <div
        className={`${styles.sbTeam} ${styles.sbAway}`}
        style={{ ['--kit' as string]: away.kit.primary }}
      >
        <span className={styles.sbShort}>{away.short}</span>
        <span className={styles.sbKit} />
      </div>

      <div className={styles.sbClock}>
        <span className={styles.liveDot} />
        <span className={styles.sbTime}>{broadcastClock(ir, uiT)}</span>
        {snap.detail && <span className={styles.sbDetail}>{snap.detail}</span>}
      </div>
    </div>
  );
}
