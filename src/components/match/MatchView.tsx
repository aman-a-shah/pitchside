'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { buildMatch, getEntry } from '@/catalog';
import { buildModel, MatchModel, MatchProvider } from '@/state/match';
import { playhead, useClock } from '@/state/clock';
import LoadingOverlay from './LoadingOverlay';
import Scoreboard from '@/components/hud/Scoreboard';
import Timeline from '@/components/hud/Timeline';
import ControlBar from '@/components/hud/ControlBar';
import Commentary from '@/components/hud/Commentary';
import Minimap from '@/components/hud/Minimap';
import VideoPanel from '@/components/hud/VideoPanel';
import TopBar from '@/components/hud/TopBar';
import HelpHint from './HelpHint';
import styles from './match.module.css';

// The WebGL scene must never SSR.
const SceneCanvas = dynamic(() => import('@/components/scene/SceneCanvas'), {
  ssr: false,
});

export default function MatchView({ id }: { id: string }) {
  const [model, setModel] = useState<MatchModel | null>(null);
  const entry = getEntry(id);
  const setDuration = useClock((s) => s.setDuration);
  const play = useClock((s) => s.play);
  const seek = useClock((s) => s.seek);
  const startedRef = useRef(false);

  // Build the (potentially heavy) IR off the first paint so the loader shows.
  useEffect(() => {
    let alive = true;
    playhead.t = 0;
    const timer = setTimeout(() => {
      const ir = buildMatch(id);
      if (!ir || !alive) return;
      const m = buildModel(ir);
      setDuration(ir.duration);
      seek(0);
      setModel(m);
    }, 60);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, setDuration, seek]);

  // Autoplay shortly after the scene is ready.
  useEffect(() => {
    if (model && !startedRef.current) {
      startedRef.current = true;
      const t = setTimeout(() => play(), 900);
      return () => clearTimeout(t);
    }
  }, [model, play]);

  return (
    <div className={styles.root}>
      {model ? (
        <MatchProvider model={model}>
          <div className={styles.canvasWrap}>
            <SceneCanvas model={model} />
          </div>
          <TopBar entry={entry!} />
          <Scoreboard />
          <Minimap />
          <Commentary />
          <VideoPanel />
          <div className={styles.bottomDock}>
            <Timeline />
            <ControlBar />
          </div>
          <HelpHint />
        </MatchProvider>
      ) : (
        <LoadingOverlay entry={entry} />
      )}
    </div>
  );
}
