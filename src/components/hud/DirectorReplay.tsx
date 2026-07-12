'use client';

/**
 * DirectorReplay — the auto slow-mo replay that makes Director mode feel like
 * a real TV production. While the director camera is on and a goal's
 * celebration winds down, the clock jumps back seven seconds and re-runs the
 * goal at 0.25× (the PostFX stack racks depth-of-field onto slow motion
 * automatically), then returns to live and normal speed. Each goal replays
 * once per visit; any user intervention — pausing, scrubbing away, changing
 * camera or speed — cancels instantly and hands control back.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useMatch } from '@/state/match';
import { playhead, useClock } from '@/state/clock';
import styles from './hud.module.css';

const LEAD = 7; // seconds of buildup replayed before the goal
const HOLD = 2.1; // seconds past the goal before returning to live
const AFTER = 5.3; // celebration seconds before the replay begins

interface ActiveReplay {
  goalT: number;
  resumeT: number;
  prevSpeed: number;
}

export function useAutoReplay() {
  const { ir } = useMatch();
  const goals = useMemo(() => ir.events.filter((e) => e.type === 'goal'), [ir.events]);
  const replayed = useRef(new Set<number>());
  const active = useRef<ActiveReplay | null>(null);
  const lastT = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = useClock.getState();
      const t = playhead.t;

      if (active.current) {
        const a = active.current;
        const userTookOver =
          s.cameraMode !== 'cinematic' ||
          !s.playing ||
          s.speed !== 0.25 ||
          t < a.goalT - LEAD - 2 ||
          t > a.goalT + HOLD + 2;
        if (t >= a.goalT + HOLD && !userTookOver) {
          // replay complete — back to live
          active.current = null;
          s.setReplayActive(false);
          s.setSpeed(a.prevSpeed);
          s.seek(a.resumeT);
        } else if (userTookOver) {
          // the user grabbed the controls — cancel silently, no seek
          active.current = null;
          s.setReplayActive(false);
        }
        lastT.current = playhead.t;
        return;
      }

      // arm a replay when the clock crosses "goal + celebration" while the
      // director is cutting the match and we're at a watchable speed
      if (s.cameraMode === 'cinematic' && s.playing && s.speed <= 2) {
        for (const g of goals) {
          const trigger = g.t + AFTER;
          if (!replayed.current.has(g.t) && lastT.current < trigger && t >= trigger) {
            replayed.current.add(g.t);
            active.current = { goalT: g.t, resumeT: t, prevSpeed: s.speed };
            s.setReplayActive(true);
            s.setSpeed(0.25);
            s.seek(g.t - LEAD);
            break;
          }
        }
      }
      lastT.current = playhead.t;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [goals]);
}

/** Broadcast-style REPLAY tag, shown while the director re-runs a goal. */
export default function DirectorReplay() {
  useAutoReplay();
  const replayActive = useClock((s) => s.replayActive);
  if (!replayActive) return null;
  return (
    <div className={styles.replayBadge} aria-live="polite">
      <span className={styles.replayDot} />
      REPLAY
      <span className={styles.replaySpeed}>0.25×</span>
    </div>
  );
}
