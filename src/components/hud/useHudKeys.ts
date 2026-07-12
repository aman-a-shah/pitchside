'use client';

/**
 * useHudKeys — the single owner of all match-view keyboard shortcuts, mounted
 * once by MatchView. Scattering listeners across components caused conflicts
 * once the shortcut surface grew, so everything routes through here.
 *
 * Fly mode owns WASD/Q/E/Esc (handled by the camera rig), so transport keys
 * are suppressed while flying.
 */

import { useEffect } from 'react';
import { playhead, useClock } from '@/state/clock';
import { useMatch } from '@/state/match';

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
}

/** Advance follow to the next player (F). Reads live state so one closure works forever. */
export function useCycleFollow() {
  const { players } = useMatch();
  return () => {
    const { followId, setFollow } = useClock.getState();
    const idx = followId ? players.findIndex((p) => p.id === followId) : -1;
    const next = players[(idx + 1) % players.length];
    if (next) setFollow(next.id);
  };
}

export function useHudKeys() {
  const cycleFollow = useCycleFollow();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const s = useClock.getState();
      const flying = s.cameraMode === 'fly';

      // ⌘K / Ctrl+K — Ask the match (works everywhere, even from inputs)
      if (e.code === 'KeyK' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        s.setAskOpen(!s.askOpen);
        return;
      }

      // '?' works everywhere, even mid-fly
      if (e.key === '?' ) {
        e.preventDefault();
        s.setShortcutsOpen(!s.shortcutsOpen);
        return;
      }

      if (e.code === 'Escape') {
        // close the topmost open panel; fly mode's pointer-lock release also
        // fires Escape — closing panels alongside it is harmless
        if (s.shortcutsOpen) s.setShortcutsOpen(false);
        else if (s.rosterOpen) s.setRosterOpen(false);
        else if (s.statsOpen) s.setStatsOpen(false);
        else if (s.videoOpen) s.setVideoOpen(false);
        return;
      }

      switch (e.code) {
        case 'Space':
          if (!flying) {
            e.preventDefault();
            s.toggle();
          }
          break;
        case 'ArrowLeft':
          if (!flying) {
            e.preventDefault();
            s.seek(playhead.t - 5);
          }
          break;
        case 'ArrowRight':
          if (!flying) {
            e.preventDefault();
            s.seek(playhead.t + 5);
          }
          break;
        case 'Comma':
          s.nudge(-1 / 25);
          break;
        case 'Period':
          s.nudge(1 / 25);
          break;
        case 'Digit1':
          s.setCameraMode('broadcast');
          break;
        case 'Digit2':
          s.setCameraMode('cinematic');
          break;
        case 'Digit3':
          s.setCameraMode('pov');
          break;
        case 'Digit4':
          s.setCameraMode('orbit');
          break;
        case 'Digit5':
          s.setCameraMode('fly');
          break;
        case 'KeyF':
          if (e.shiftKey) toggleFullscreen();
          else if (!flying) cycleFollow();
          break;
        case 'KeyS':
          if (!flying) s.setStatsOpen(!s.statsOpen);
          break;
        case 'KeyT':
          s.toggleTactical();
          break;
        case 'KeyM':
          s.toggleSound();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
