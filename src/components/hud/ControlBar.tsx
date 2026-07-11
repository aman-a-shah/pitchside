'use client';

import { useEffect } from 'react';
import { useMatch } from '@/state/match';
import { CameraMode, playhead, useClock } from '@/state/clock';
import {
  IconBroadcast,
  IconCinematic,
  IconOrbit,
  IconFly,
  IconFollow,
  IconFootage,
  IconPlay,
  IconPause,
  IconRestart,
  IconBack5,
  IconFwd5,
} from './Icons';
import styles from './hud.module.css';

const SPEEDS = [0.25, 0.5, 1, 2];
const CAMERAS: { mode: CameraMode; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { mode: 'broadcast', label: 'Broadcast', Icon: IconBroadcast },
  { mode: 'cinematic', label: 'Cinematic', Icon: IconCinematic },
  { mode: 'orbit', label: 'Orbit', Icon: IconOrbit },
  { mode: 'fly', label: 'Fly', Icon: IconFly },
];

export default function ControlBar() {
  const { players } = useMatch();
  const playing = useClock((s) => s.playing);
  const speed = useClock((s) => s.speed);
  const cameraMode = useClock((s) => s.cameraMode);
  const followId = useClock((s) => s.followId);
  const videoOpen = useClock((s) => s.videoOpen);
  const { ir } = useMatch();

  const toggle = useClock((s) => s.toggle);
  const setSpeed = useClock((s) => s.setSpeed);
  const seek = useClock((s) => s.seek);
  const nudge = useClock((s) => s.nudge);
  const setCameraMode = useClock((s) => s.setCameraMode);
  const setFollow = useClock((s) => s.setFollow);
  const setVideoOpen = useClock((s) => s.setVideoOpen);
  const play = useClock((s) => s.play);

  const cycleFollow = () => {
    // read the CURRENT followId (not the value captured at mount) so the
    // keyboard shortcut, which closes over this fn once, still advances.
    const cur = useClock.getState().followId;
    const idx = cur ? players.findIndex((p) => p.id === cur) : -1;
    const next = players[(idx + 1) % players.length];
    setFollow(next.id);
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const flying = useClock.getState().cameraMode === 'fly';
      switch (e.code) {
        case 'Space':
          if (!flying) {
            e.preventDefault();
            toggle();
          }
          break;
        case 'ArrowLeft':
          if (!flying) {
            e.preventDefault();
            seek(playhead.t - 5);
          }
          break;
        case 'ArrowRight':
          if (!flying) {
            e.preventDefault();
            seek(playhead.t + 5);
          }
          break;
        case 'Comma':
          nudge(-1 / 25);
          break;
        case 'Period':
          nudge(1 / 25);
          break;
        case 'Digit1':
          setCameraMode('broadcast');
          break;
        case 'Digit2':
          setCameraMode('cinematic');
          break;
        case 'Digit3':
          setCameraMode('orbit');
          break;
        case 'Digit4':
          setCameraMode('fly');
          break;
        case 'KeyF':
          cycleFollow();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasVideo = !!ir.meta.videos?.length;

  return (
    <div className={styles.controls}>
      <div className={styles.group}>
        <button className={styles.btn} onClick={() => seek(0)} title="Restart" aria-label="Restart">
          <IconRestart size={17} />
        </button>
        <button
          className={styles.btn}
          onClick={() => seek(playhead.t - 5)}
          title="Back 5s"
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
          title="Forward 5s"
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
            title={c.label}
            aria-pressed={cameraMode === c.mode}
          >
            <c.Icon size={17} />
            <span className={styles.label}>{c.label}</span>
          </button>
        ))}
        <button
          className={`${styles.btn} ${styles.cam} ${
            cameraMode === 'player' ? styles.btnActive : ''
          }`}
          onClick={cycleFollow}
          title="Follow a player (F)"
          aria-pressed={cameraMode === 'player'}
        >
          <IconFollow size={17} />
          <span className={styles.label}>
            {cameraMode === 'player' && followId
              ? `#${players.find((p) => p.id === followId)?.number ?? ''}`
              : 'Follow'}
          </span>
        </button>
      </div>

      {hasVideo && (
        <div className={styles.group}>
          <button
            className={`${styles.btn} ${styles.cam} ${videoOpen ? styles.btnActive : ''}`}
            onClick={() => setVideoOpen(!videoOpen)}
            title="Watch real footage"
            aria-pressed={videoOpen}
          >
            <IconFootage size={17} />
            <span className={styles.label}>Footage</span>
          </button>
        </div>
      )}
    </div>
  );
}
