'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { playhead, useClock } from '@/state/clock';

/**
 * Advances the master playhead each frame from the clock's play/speed state and
 * mirrors a throttled copy into zustand for the UI. Lives inside the Canvas so it
 * shares the render loop.
 */
export default function ClockDriver() {
  const invalidate = useThree((st) => st.invalidate);
  const lastUi = useRef(0);

  useEffect(() => {
    playhead.invalidate = invalidate;
    return () => {
      playhead.invalidate = null;
    };
  }, [invalidate]);

  useFrame((_, delta) => {
    const st = useClock.getState();
    if (st.playing) {
      const d = Math.min(delta, 0.1); // guard against tab-refocus jumps
      let t = playhead.t + d * st.speed;
      if (t >= st.duration) {
        t = st.duration;
        st.pause();
      } else if (t < 0) {
        t = 0;
        st.pause();
      }
      playhead.t = t;
    }
    // throttle UI sync to ~15Hz
    if (Math.abs(playhead.t - lastUi.current) > 1 / 15) {
      lastUi.current = playhead.t;
      st.setUiT(playhead.t);
    }
  });

  return null;
}
