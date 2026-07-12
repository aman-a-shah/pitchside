'use client';

/**
 * ControlBar — the transport dock. Keyboard shortcuts live in useHudKeys
 * (mounted once by MatchView), not here. Layout contract, left → right:
 * transport · speed · [spacer] · cameras (incl. player cam + its popover)
 * · ask · stats · footage · tactical · fullscreen · help.
 *
 * The player cam replaces the old separate POV + Follow buttons: one camera,
 * two views (first/third person), one target (auto = possession, or a picked
 * player). All of it configured from the PlayerCamPopover.
 */

import { useEffect, useState } from 'react';
import { useMatch } from '@/state/match';
import { CameraMode, playhead, useClock } from '@/state/clock';
import {
  IconAsk,
  IconBroadcast,
  IconChevronUp,
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
  IconPov,
  IconRestart,
  IconBack5,
  IconFwd5,
  IconStats,
} from './Icons';
import PlayerCamPopover from './RosterPopover';
import { toggleFullscreen } from './useHudKeys';
import styles from './hud.module.css';

// real matches run 90+ minutes — the high gears make them watchable in one sitting
const SPEEDS = [0.25, 1, 2, 4, 8];
const CAMERAS: { mode: CameraMode; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { mode: 'broadcast', label: 'Broadcast', Icon: IconBroadcast },
  { mode: 'cinematic', label: 'Director', Icon: IconCinematic },
];
const CAMERAS_AFTER: typeof CAMERAS = [
  { mode: 'orbit', label: 'Orbit', Icon: IconOrbit },
  { mode: 'fly', label: 'Fly', Icon: IconFly },
];
const CAM_KEYS: Record<CameraMode, string> = {
  broadcast: '1',
  cinematic: '2',
  player: '3',
  orbit: '4',
  fly: '5',
};

export default function ControlBar() {
  const { players, ir } = useMatch();
  const playing = useClock((s) => s.playing);
  const speed = useClock((s) => s.speed);
  const cameraMode = useClock((s) => s.cameraMode);
  const povView = useClock((s) => s.povView);
  const followId = useClock((s) => s.followId);
  const videoOpen = useClock((s) => s.videoOpen);
  const statsOpen = useClock((s) => s.statsOpen);
  const rosterOpen = useClock((s) => s.rosterOpen);
  const shortcutsOpen = useClock((s) => s.shortcutsOpen);
  const askOpen = useClock((s) => s.askOpen);
  const showTactical = useClock((s) => s.showTactical);

  const toggle = useClock((s) => s.toggle);
  const setSpeed = useClock((s) => s.setSpeed);
  const seek = useClock((s) => s.seek);
  const setCameraMode = useClock((s) => s.setCameraMode);
  const setVideoOpen = useClock((s) => s.setVideoOpen);
  const setStatsOpen = useClock((s) => s.setStatsOpen);
  const setRosterOpen = useClock((s) => s.setRosterOpen);
  const setShortcutsOpen = useClock((s) => s.setShortcutsOpen);
  const setAskOpen = useClock((s) => s.setAskOpen);
  const toggleTactical = useClock((s) => s.toggleTactical);
  const play = useClock((s) => s.play);

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const hasVideo = !!ir.meta.videos?.length;
  const playerCamOn = cameraMode === 'player';
  const followed = followId ? players.find((p) => p.id === followId) : null;
  const PlayerIcon = povView === 'first' ? IconPov : IconFollow;
  const playerLabel = playerCamOn
    ? followed
      ? `${followed.number != null ? `${followed.number} · ` : ''}${followed.name ?? ''}`
      : 'Auto'
    : 'Player';

  const camSeg = (c: (typeof CAMERAS)[number]) => (
    <button
      key={c.mode}
      className={`${styles.camSeg} ${cameraMode === c.mode ? styles.camSegOn : ''}`}
      onClick={() => setCameraMode(c.mode)}
      title={`${c.label} (${CAM_KEYS[c.mode]})`}
      aria-pressed={cameraMode === c.mode}
    >
      <c.Icon size={16} />
      <span className={styles.label}>{c.label}</span>
    </button>
  );

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

      <div className={styles.segment} role="group" aria-label="Playback speed">
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

      <div className={styles.segment} role="group" aria-label="Camera">
        {CAMERAS.map(camSeg)}
        <span className={styles.anchor}>
          <button
            className={`${styles.camSeg} ${styles.playerSeg} ${
              playerCamOn ? styles.camSegOn : ''
            }`}
            onClick={() => {
              if (!playerCamOn) {
                setCameraMode('player');
                setRosterOpen(true);
              } else {
                setRosterOpen(!rosterOpen);
              }
            }}
            title="Player cam — first or third person, any player (3 · V flips view · F cycles)"
            aria-pressed={playerCamOn}
            aria-expanded={rosterOpen}
            aria-haspopup="menu"
          >
            <PlayerIcon size={16} />
            <span className={styles.label}>{playerLabel}</span>
            <IconChevronUp size={11} className={styles.segChev} />
          </button>
          <PlayerCamPopover />
        </span>
        {CAMERAS_AFTER.map(camSeg)}
      </div>

      <div className={styles.group}>
        <button
          className={`${styles.btn} ${styles.cam} ${askOpen ? styles.btnActive : ''}`}
          onClick={() => setAskOpen(!askOpen)}
          title="Ask the match (⌘K)"
          aria-pressed={askOpen}
        >
          <IconAsk size={17} />
          <span className={styles.label}>Ask</span>
        </button>
        <button
          className={`${styles.btn} ${statsOpen ? styles.btnActive : ''}`}
          onClick={() => setStatsOpen(!statsOpen)}
          title="Match stats (S)"
          aria-pressed={statsOpen}
          aria-label="Match stats"
        >
          <IconStats size={17} />
        </button>
        {hasVideo && (
          <button
            className={`${styles.btn} ${videoOpen ? styles.btnActive : ''}`}
            onClick={() => setVideoOpen(!videoOpen)}
            title="Watch real footage"
            aria-pressed={videoOpen}
            aria-label="Watch real footage"
          >
            <IconFootage size={17} />
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
