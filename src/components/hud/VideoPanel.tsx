'use client';

import { useEffect, useRef } from 'react';
import { useMatch } from '@/state/match';
import { playhead, useClock } from '@/state/clock';
import { VideoRef } from '@/ir/types';
import { mmss } from '@/lib/format';
import { IconFootage, IconClose, IconJump } from './Icons';
import styles from './hud.module.css';

/** Map match-clock seconds to video seconds via piecewise-linear anchors. */
function toVideoSeconds(video: VideoRef, t: number): number {
  const a = video.clockAnchors;
  if (a.length === 0) return t;
  if (t <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) {
    if (t <= a[i][0]) {
      const [t0, v0] = a[i - 1];
      const [t1, v1] = a[i];
      const f = (t - t0) / Math.max(0.001, t1 - t0);
      return v0 + (v1 - v0) * f;
    }
  }
  const last = a[a.length - 1];
  const prev = a[a.length - 2] ?? [0, 0];
  const slope = (last[1] - prev[1]) / Math.max(0.001, last[0] - prev[0]);
  return last[1] + (t - last[0]) * slope;
}

export default function VideoPanel() {
  const { ir } = useMatch();
  const open = useClock((s) => s.videoOpen);
  const setVideoOpen = useClock((s) => s.setVideoOpen);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const video = ir.meta.videos?.[0];

  const command = (func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      'https://www.youtube.com'
    );
  };

  const syncNow = () => {
    if (!video) return;
    command('seekTo', [Math.max(0, toVideoSeconds(video, playhead.t)), true]);
  };

  // sync shortly after opening (iframe needs a moment to be ready)
  useEffect(() => {
    if (open && video) {
      const t = setTimeout(syncNow, 900);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !video) return null;

  const startAt = Math.floor(toVideoSeconds(video, playhead.t));
  const src = `https://www.youtube.com/embed/${video.id}?enablejsapi=1&start=${startAt}&rel=0&modestbranding=1`;

  return (
    <div className={styles.video}>
      <div className={styles.videoHead}>
        <span className={styles.videoTitle}>
          <IconFootage size={15} />
          Real footage
          {video.label ? <span className={styles.videoLabel}>· {video.label}</span> : null}
        </span>
        <button
          className={styles.videoClose}
          onClick={() => setVideoOpen(false)}
          aria-label="Close footage"
        >
          <IconClose size={15} />
        </button>
      </div>
      <div className={styles.videoFrame}>
        <iframe
          ref={iframeRef}
          src={src}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className={styles.videoFoot}>
        <span className={styles.videoDrift}>
          Approx. sync · reconstruction ≈ {mmss(playhead.t)}
        </span>
        <button className={styles.videoSync} onClick={syncNow}>
          <IconJump size={14} />
          Jump to this moment
        </button>
      </div>
    </div>
  );
}
