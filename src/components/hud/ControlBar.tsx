'use client';

/**
 * ControlBar — the transport dock. Keyboard shortcuts live in useHudKeys
 * (mounted once by MatchView), not here. Layout contract, left → right:
 * transport · speed · [spacer] · cameras · follow(+roster) · stats · footage
 * · tactical · fullscreen · help.
 */

import { useEffect, useState } from 'react';
import { useMatch } from '@/state/match';
import { CameraMode, playhead, useClock } from '@/state/clock';
import {
  IconBroadcast,
  IconCinematic,
  IconCollapse,
  IconExpand,
  IconFly,
  IconFollow,
  IconFootage,
  IconHelp,
  IconOrbit,
  IconPause,
  IconPitch,
  IconPlay,
  IconRestart,
  IconBack5,
  IconFwd5,
  IconStats,
} from './Icons';
import RosterPopover from './RosterPopover';
import { toggleFullscreen } from './useHudKeys';
import styles from './hud.module.css';

// real matches run 90+ minutes — the high gears make them watchable in one sitting
const SPEEDS = [0.25, 1, 2, 4, 8];
const CAMERAS: { mode: CameraMode; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { mode: 'broadcast', label: 'Broadcast', Icon: IconBroadcast },
  { mode: 'cinematic', label: 'Cinematic', Icon: IconCinematic },
  { mode: 'orbit', label: 'Orbit', Icon: IconOrbit },
  { mode: 'fly', label: 'Fly', Icon: IconFly },
];

export default function ControlBar() {
  const { players, ir } = useMatch();
  const playing = useClock((s) => s.playing);
  const speed = useClock((s) => s.speed);
  const cameraMode = useClock((s) => s.cameraMode);
  const followId = useClock((s) => s.followId);
  const videoOpen = useClock((s) => s.videoOpen);
  const statsOpen = useClock((s) => s.statsOpen);
  const rosterOpen = useClock((s) => s.rosterOpen);
  const shortcutsOpen = useClock((s) => s.shortcutsOpen);
  const showTactical = useClock((s) => s.showTactical);

  const toggle = useClock((s) => s.toggle);
  const setSpeed = useClock((s) => s.setSpeed);
  const seek = useClock((s) => s.seek);
  const setCameraMode = useClock((s) => s.setCameraMode);
  const setVideoOpen = useClock((s) => s.setVideoOpen);
  const setStatsOpen = useClock((s) => s.setStatsOpen);
  const setRosterOpen = useClock((s) => s.setRosterOpen);
  const setShortcutsOpen = useClock((s) => s.setShortcutsOpen);
  const toggleTactical = useClock((s) => s.toggleTactical);
  const play = useClock((s) => s.play);

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const hasVideo = !!ir.meta.videos?.length;
  const followed = followId ? players.find((p) => p.id === followId) : null;

  return (
    <div className={styles.controls}>
      <div className={styles.group}>
        <button className={styles.btn} onClick={() => seek(0)} title="Restart" aria-label="Restart">
          <IconRestart size={17} />
        </button>
        <button
          className={styles.btn}
          onClick={() => seek(playhead.t - 5)}
          title="Back 5s (←)"
          aria-label="Back 5 seconds"
        >
          <IconBack5 size={17} />
        </button>
        <button
          className={styles.btnPrimary}
          onClick={() => toggle()}
          title="Play / Pause (Space)"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
        </button>
        <button
          className={styles.btn}
          onClick={() => seek(playhead.t + 5)}
          title="Forward 5s (→)"
          aria-label="Forward 5 seconds"
        >
          <IconFwd5 size={17} />
        </button>
      </div>

      <div className={`${styles.group} ${styles.segment}`}>
        <span className={styles.segLabel}>Speed</span>
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            className={`${styles.seg} ${speed === sp && playing ? styles.segOn : ''}`}
            onClick={() => {
              setSpeed(sp);
              play();
            }}
            title={sp === 0.25 ? 'Slow-mo' : `${sp}× speed`}
          >
            {sp === 0.25 ? '¼×' : `${sp}×`}
          </button>
        ))}
      </div>

      <div className={styles.spacer} />

      <div className={styles.group}>
        {CAMERAS.map((c) => (
          <button
            key={c.mode}
            className={`${styles.btn} ${styles.cam} ${
              cameraMode === c.mode ? styles.btnActive : ''
            }`}
            onClick={() => setCameraMode(c.mode)}
            title={`${c.label} (${CAMERAS.indexOf(c) + 1})`}
            aria-pressed={cameraMode === c.mode}
          >
            <c.Icon size={17} />
            <span className={styles.label}>{c.label}</span>
          </button>
        ))}
        <span className={styles.anchor}>
          <button
            className={`${styles.btn} ${styles.cam} ${
              cameraMode === 'player' || rosterOpen ? styles.btnActive : ''
            }`}
            onClick={() => setRosterOpen(!rosterOpen)}
            title="Follow a player (F cycles)"
            aria-pressed={cameraMode === 'player'}
            aria-expanded={rosterOpen}
          >
            <IconFollow size={17} />
            <span className={styles.label}>
              {cameraMode === 'player' && followed
                ? `#${followed.number ?? ''} ${followed.name ?? ''}`
                : 'Follow'}
            </span>
          </button>
          <RosterPopover />
        </span>
      </div>

      <div className={styles.group}>
        <button
          className={`${styles.btn} ${styles.cam} ${statsOpen ? styles.btnActive : ''}`}
          onClick={() => setStatsOpen(!statsOpen)}
          title="Match stats (S)"
          aria-pressed={statsOpen}
        >
          <IconStats size={17} />
          <span className={styles.label}>Stats</span>
        </button>
        {hasVideo && (
          <button
            className={`${styles.btn} ${styles.cam} ${videoOpen ? styles.btnActive : ''}`}
            onClick={() => setVideoOpen(!videoOpen)}
            title="Watch real footage"
            aria-pressed={videoOpen}
          >
            <IconFootage size={17} />
            <span className={styles.label}>Footage</span>
          </button>
        )}
        <button
          className={`${styles.btn} ${styles.hideMobile} ${showTactical ? styles.btnActive : ''}`}
          onClick={toggleTactical}
          title="Tactical radar (T)"
          aria-pressed={showTactical}
          aria-label="Toggle tactical radar"
        >
          <IconPitch size={17} />
        </button>
        <button
          className={styles.btn}
          onClick={toggleFullscreen}
          title="Fullscreen (Shift+F)"
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {fullscreen ? <IconCollapse size={17} /> : <IconExpand size={17} />}
        </button>
        <button
          className={`${styles.btn} ${shortcutsOpen ? styles.btnActive : ''}`}
          onClick={() => setShortcutsOpen(!shortcutsOpen)}
          title="Keyboard shortcuts (?)"
          aria-pressed={shortcutsOpen}
          aria-label="Keyboard shortcuts"
        >
          <IconHelp size={17} />
        </button>
      </div>
    </div>
  );
}
