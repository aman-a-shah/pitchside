'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { buildMatch, CatalogEntry, getFeatured, resolveEntry } from '@/catalog';
import { buildModel, MatchModel, MatchProvider } from '@/state/match';
import { playhead, useClock } from '@/state/clock';
import LoadingOverlay from './LoadingOverlay';
import Scoreboard from '@/components/hud/Scoreboard';
import Timeline from '@/components/hud/Timeline';
import ControlBar from '@/components/hud/ControlBar';
import EventFeed from '@/components/hud/EventFeed';
import Minimap from '@/components/hud/Minimap';
import VideoPanel from '@/components/hud/VideoPanel';
import StatsPanel from '@/components/hud/StatsPanel';
import CelebrationBanner from '@/components/hud/CelebrationBanner';
import DirectorReplay from '@/components/hud/DirectorReplay';
import AskBar from '@/components/hud/AskBar';
import ShortcutsOverlay from '@/components/hud/ShortcutsOverlay';
import TopBar from '@/components/hud/TopBar';
import { useHudKeys } from '@/components/hud/useHudKeys';
import FirstRunHint from './FirstRunHint';
import { deriveMatchTheme } from '@/components/theme';
import styles from './match.module.css';

// The WebGL scene must never SSR.
const SceneCanvas = dynamic(() => import('@/components/scene/SceneCanvas'), {
  ssr: false,
});
// Unity WebGL renderer (`?engine=unity`) — same match model + HUD, different engine.
const UnityView = dynamic(() => import('@/components/unity/UnityView'), {
  ssr: false,
});

/** Loading gates: 0 event data downloading → 1 IR built → 2 GL context → 3 first frame */
export default function MatchView({ id }: { id: string }) {
  const [model, setModel] = useState<MatchModel | null>(null);
  const [stage, setStage] = useState(0);
  const [overlayGone, setOverlayGone] = useState(false);
  // featured entries resolve synchronously so the loader has team art instantly;
  // everything else fills in once the match index arrives
  const [entry, setEntry] = useState<CatalogEntry | null>(() => getFeatured(id) ?? null);
  const [loadedBytes, setLoadedBytes] = useState<number>();
  const [error, setError] = useState<string | null>(null);
  const setDuration = useClock((s) => s.setDuration);
  const setDeadSpans = useClock((s) => s.setDeadSpans);
  const play = useClock((s) => s.play);
  const seek = useClock((s) => s.seek);
  const startedRef = useRef(false);
  // `?poster=1` renders only the 3D scene (no HUD) for clean thumbnail capture;
  // `?film=1` does the same for hero-footage capture (scripts/film.mjs).
  const [clean] = useState(() => {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search);
    return q.has('poster') || q.has('film');
  });
  // `?engine=unity` renders the scene with the Unity WebGL build (see unity/).
  const [engine] = useState<'three' | 'unity'>(() => {
    if (typeof window === 'undefined') return 'three';
    return new URLSearchParams(window.location.search).get('engine') === 'unity'
      ? 'unity'
      : 'three';
  });

  // Fetch the real event stream and reconstruct the match.
  useEffect(() => {
    let alive = true;
    playhead.t = 0;
    resolveEntry(id)
      .then((e) => {
        if (alive && e) setEntry(e);
      })
      .catch(() => {});
    buildMatch(id, (loaded) => {
      if (alive) setLoadedBytes(loaded);
    })
      .then((ir) => {
        if (!alive) return;
        const m = buildModel(ir);
        setDuration(ir.duration);
        setDeadSpans(ir.deadSpans ?? []);
        seek(0);
        setModel(m);
        setStage(1);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [id, setDuration, setDeadSpans, seek]);

  // Extend the automation hook with the built model so headless QA can find
  // event times (window.__pitchside.model.ir.events).
  useEffect(() => {
    if (!model || typeof window === 'undefined') return;
    const w = window as unknown as { __pitchside?: Record<string, unknown> };
    w.__pitchside = { ...(w.__pitchside ?? {}), model };
  }, [model]);

  // Gate 2: the WebGL context exists. Gate 3: a frame has actually flushed.
  const onSceneReady = useCallback(() => {
    setStage(2);
    requestAnimationFrame(() => requestAnimationFrame(() => setStage(3)));
  }, []);

  const ready = stage >= 3;

  // Fade the overlay over the live scene, then unmount it; autoplay follows.
  useEffect(() => {
    if (!ready) return;
    const gone = setTimeout(() => setOverlayGone(true), 500);
    let auto: ReturnType<typeof setTimeout> | undefined;
    if (!startedRef.current) {
      startedRef.current = true;
      auto = setTimeout(() => play(), 700);
    }
    return () => {
      clearTimeout(gone);
      if (auto) clearTimeout(auto);
    };
  }, [ready, play]);

  return (
    <div className={styles.root} style={entry ? deriveMatchTheme(entry) : undefined}>
      {model && (
        <MatchProvider model={model}>
          <div className={styles.canvasWrap}>
            {engine === 'unity' ? (
              <UnityView model={model} onReady={onSceneReady} />
            ) : (
              <SceneCanvas model={model} onReady={onSceneReady} />
            )}
          </div>
          {!clean && ready && entry && (
            <>
              <div className={styles.topScrim} aria-hidden />
              <TopBar entry={entry} />
              <Scoreboard />
              <Minimap />
              <EventFeed />
              <VideoPanel />
              <StatsPanel />
              <CelebrationBanner />
              <DirectorReplay />
              <AskBar />
              <div className={styles.bottomDock}>
                <div className={styles.dockPanel}>
                  <Timeline />
                  <ControlBar />
                </div>
              </div>
              <ShortcutsOverlay />
              <FirstRunHint />
            </>
          )}
          {!clean && <HudKeys />}
        </MatchProvider>
      )}
      {!overlayGone && !(clean && model) && (
        <LoadingOverlay
          entry={entry}
          stage={stage}
          done={ready}
          loadedBytes={loadedBytes}
          error={error}
        />
      )}
    </div>
  );
}

/** useHudKeys needs the MatchProvider context, so it mounts as a null child. */
function HudKeys() {
  useHudKeys();
  return null;
}
