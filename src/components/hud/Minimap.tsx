'use client';

import { useEffect, useRef } from 'react';
import { useMatch } from '@/state/match';
import { playhead, useClock } from '@/state/clock';
import { sampleTrack } from '@/ir/sampler';
import { Sample } from '@/ir/types';
import styles from './hud.module.css';

const smp: Sample = { x: 0, y: 0, z: 0, speed: 0, heading: 0, action: 0 };

export default function Minimap() {
  const { ir, players, teamById } = useMatch();
  const showTactical = useClock((s) => s.showTactical);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const hl = ir.fieldSpec.length / 2;
    const hw = ir.fieldSpec.width / 2;
    const W = 176;
    const H = Math.round((W * ir.fieldSpec.width) / ir.fieldSpec.length);
    const pad = 8;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const toX = (x: number) => pad + ((x + hl) / (2 * hl)) * (W - 2 * pad);
    const toY = (z: number) => pad + ((z + hw) / (2 * hw)) * (H - 2 * pad);

    const backdrop =
      ir.sport === 'basketball'
        ? 'rgba(120,74,40,0.5)'
        : ir.sport === 'tennis'
        ? 'rgba(150,70,40,0.5)'
        : 'rgba(20,60,32,0.55)';

    let raf = 0;
    const draw = () => {
      const t = playhead.t;
      ctx.clearRect(0, 0, W, H);
      // court backdrop
      ctx.fillStyle = backdrop;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      roundRect(ctx, pad, pad, W - 2 * pad, H - 2 * pad, 4);
      ctx.fill();
      ctx.stroke();
      // centre line (net for tennis)
      ctx.beginPath();
      ctx.moveTo(W / 2, pad);
      ctx.lineTo(W / 2, H - pad);
      ctx.stroke();
      if (ir.sport !== 'tennis') {
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, ir.sport === 'basketball' ? 8 : 12, 0, Math.PI * 2);
        ctx.stroke();
      }

      // read follow/hover-preview state imperatively — no React re-render at 60fps
      const { followId, selectedId } = useClock.getState();

      for (const p of players) {
        const tr = ir.tracks[p.id];
        if (!tr) continue;
        sampleTrack(tr, t, smp);
        const team = p.team ? teamById[p.team] : undefined;
        const px = toX(smp.x);
        const py = toY(smp.z);
        ctx.beginPath();
        ctx.fillStyle =
          (p.position === 'GK' ? team?.kit.gk?.primary : team?.kit.primary) ??
          team?.kit.primary ??
          '#fff';
        ctx.arc(px, py, p.position === 'GK' ? 2.5 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.stroke();

        // solid ring = camera-followed player; dashed ring = roster hover preview
        if (p.id === followId) {
          ctx.beginPath();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.id === selectedId) {
          ctx.beginPath();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.setLineDash([2.5, 2.5]);
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // ball
      sampleTrack(ir.tracks['ball'], t, smp);
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.arc(toX(smp.x), toY(smp.z), 2, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [ir, players, teamById, showTactical]);

  if (!showTactical) return null;

  return (
    <div className={styles.minimap}>
      <div className={styles.minimapCanvas}>
        <canvas ref={canvasRef} />
        <span className={styles.minimapBadge} aria-hidden>
          <i />
          Live
        </span>
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
