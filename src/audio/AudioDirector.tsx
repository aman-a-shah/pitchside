'use client';

/**
 * AudioDirector — cues every sound off the match clock.
 *
 * Watches `playhead.t` on a rAF loop (same pattern as the scene: no React
 * re-renders at frame rate) and reacts to crossings:
 *   - events drive the procedural crowd (goal roar, chance swell, whistles)
 *   - baked commentary cues (public/audio/<matchId>/cues.json) drive the
 *     voice track, era matches through the vintage radio chain
 *
 * The AudioContext arms on the first user gesture (browser autoplay policy);
 * a seek/scrub stops any speaking line rather than letting it hang stale.
 */

import { useEffect, useRef } from 'react';
import { useMatch } from '@/state/match';
import { playhead, useClock } from '@/state/clock';
import {
  arm,
  armed,
  playCommentary,
  roar,
  setCrowdTarget,
  setMuted,
  stopCommentary,
  whistle,
} from './engine';

interface Cue {
  /** match-clock seconds */
  t: number;
  /** audio file name within the match's audio folder */
  f: string;
  /** clip duration, seconds */
  d: number;
  /** priority: 3 goal · 2 big moment · 1 routine */
  p: number;
}

export default function AudioDirector() {
  const { ir } = useMatch();
  const soundOn = useClock((s) => s.soundOn);
  const cuesRef = useRef<Cue[] | null>(null);

  // arm the AudioContext on the first gesture anywhere in the app
  useEffect(() => {
    const onGesture = () => arm();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  useEffect(() => {
    setMuted(!soundOn);
  }, [soundOn]);

  // baked commentary for this match, if the catalog has it
  useEffect(() => {
    let alive = true;
    cuesRef.current = null;
    fetch(`/audio/${ir.id}/cues.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cues: { cues: Cue[] } | Cue[] | null) => {
        if (!alive || !cues) return;
        cuesRef.current = Array.isArray(cues) ? cues : cues.cues;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ir.id]);

  useEffect(() => {
    const vintage = ir.meta.era === 'archive' || ir.meta.era === 'technicolor';
    const events = ir.events;
    let lastT = playhead.t;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!armed()) return;
      const s = useClock.getState();
      const t = playhead.t;
      const dt = t - lastT;
      const smooth = s.playing && dt >= 0 && dt < 1.5; // normal forward playback
      const jumped = Math.abs(dt) > 2;

      // crowd bed follows the state of play
      setCrowdTarget(!s.soundOn ? 0 : s.playing ? 0.34 : 0.1);

      if (jumped) stopCommentary();

      if (smooth && s.soundOn) {
        // ---- event-driven crowd + whistles ----
        for (const e of events) {
          if (e.t <= lastT || e.t > t) continue;
          if (e.type === 'goal') roar(1, 6.5);
          else if (e.type === 'shot' && (e.importance ?? 0) >= 0.6) roar(0.45, 2.6);
          else if (e.type === 'save') roar(0.55, 3);
          else if (e.type === 'card') {
            whistle('foul');
            roar(e.text?.startsWith('RED') ? 0.7 : 0.3, 3);
          } else if (e.type === 'kickoff') whistle('kickoff');
          else if (e.type === 'restart' && e.text?.includes('Second half')) whistle('kickoff');
        }

        // ---- commentary cues (skip at chipmunk speeds) ----
        const cues = cuesRef.current;
        if (cues && s.speed <= 2) {
          for (const c of cues) {
            if (c.t <= lastT || c.t > t) continue;
            playCommentary(`/audio/${ir.id}/${c.f}`, c.p, vintage);
            break;
          }
        }
      }
      lastT = t;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      stopCommentary();
      setCrowdTarget(0);
    };
  }, [ir]);

  return null;
}
