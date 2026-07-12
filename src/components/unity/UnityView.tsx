'use client';

/**
 * Unity WebGL renderer embed (`?engine=unity`).
 *
 * Unity renders; React stays the source of truth. Reconstruction, the master
 * clock and every HUD control keep working exactly as with the three.js scene —
 * this component simply:
 *   1. boots the Unity player (built into /public/unity by `npm run build:unity`),
 *   2. sends the one-time match setup (teams, kits, entity slots) via SendMessage,
 *   3. every animation frame advances the playhead (mirroring ClockDriver) and
 *      writes each entity's sampled state straight into a shared float buffer
 *      inside the wasm heap (announced by the Unity side via a .jslib plugin),
 *   4. forwards camera-mode / follow changes from the HUD.
 *
 * Buffer layout must match unity/Assets/Scripts/MatchBridge.cs:
 *   header [0]=version [1]=t [2]=playing [3..7] reserved, then per entity slot
 *   (stride 8): x, y, z, heading, speed, action, visible, reserved.
 */

import { useEffect, useRef } from 'react';
import { MatchModel } from '@/state/match';
import { playhead, useClock } from '@/state/clock';
import { sampleTrack } from '@/ir/sampler';
import { Sample } from '@/ir/types';

const HEADER_FLOATS = 8;
const ENTITY_STRIDE = 8;
const MAX_ENTITIES = 64;

interface UnityInstance {
  SendMessage(obj: string, method: string, value?: string | number): void;
  Quit(): Promise<void>;
}

interface UnityBridge {
  bufferPtr?: number;
  bufferFloats?: number;
  getHeap?: () => Float32Array;
  ready?: boolean;
}

declare global {
  interface Window {
    createUnityInstance?: (
      canvas: HTMLCanvasElement,
      config: Record<string, unknown>,
      onProgress?: (p: number) => void
    ) => Promise<UnityInstance>;
    __pitchsideUnity?: UnityBridge;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      s.dataset.loaded = '1';
      resolve();
    };
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Build the one-time setup message (mirrors unity MatchSetupMsg). */
function buildSetupJson(model: MatchModel): string {
  const ir = model.ir;
  return JSON.stringify({
    field: {
      length: ir.fieldSpec.length,
      width: ir.fieldSpec.width,
      goalWidth: ir.fieldSpec.goalWidth ?? 3.66,
      goalHeight: ir.fieldSpec.goalHeight ?? 2.44,
    },
    mood: ir.meta.mood ?? 'night',
    duration: ir.duration,
    teams: ir.meta.teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.short,
      kit: t.kit,
      attackDir: t.attackDir,
    })),
    entities: ir.entities.slice(0, MAX_ENTITIES).map((e) => ({
      id: e.id,
      role: e.role,
      team: e.team ?? '',
      name: e.name ?? '',
      number: e.number ?? 0,
      position: e.position ?? 'MID',
    })),
    keyEvents: ir.events
      .filter((e) => (e.importance ?? 0) >= 0.7)
      .map((e) => ({
        t: e.t,
        x: e.location?.[0] ?? 0,
        z: e.location?.[1] ?? 0,
        importance: e.importance ?? 0,
      })),
    deadSpans: (ir.deadSpans ?? []).map(([t0, t1]) => ({ t0, t1 })),
  });
}

export default function UnityView({
  model,
  onReady,
}: {
  model: MatchModel;
  onReady?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let instance: UnityInstance | null = null;
    let raf = 0;
    let announcedReady = false;
    let matchSent = false;
    const sample: Sample = { x: 0, y: 0, z: 0, speed: 0, heading: 0, action: 0 };
    let lastUi = 0;
    let lastFrame = performance.now();

    const trySendMatch = () => {
      if (!instance || matchSent || !window.__pitchsideUnity?.ready) return;
      matchSent = true;
      instance.SendMessage('MatchRunner', 'SetMatch', buildSetupJson(modelRef.current));
      const st = useClock.getState();
      instance.SendMessage('MatchRunner', 'SetCameraMode', unityCameraMode(st));
      instance.SendMessage('MatchRunner', 'SetFollow', followSlot(st.followId));
      if (!announcedReady) {
        announcedReady = true;
        onReady?.();
      }
    };

    const followSlot = (id: string | null): number => {
      if (!id) return -1;
      const idx = modelRef.current.ir.entities.findIndex((e) => e.id === id);
      return idx >= 0 && idx < MAX_ENTITIES ? idx : -1;
    };

    // Unity's protocol predates the merged player cam: it still speaks
    // 'pov' (first person) vs 'player' (third person) as separate modes
    const unityCameraMode = (st: { cameraMode: string; povView: string }): string =>
      st.cameraMode === 'player' && st.povView === 'first' ? 'pov' : st.cameraMode;

    const onUnityReady = () => trySendMatch();
    window.addEventListener('pitchside-unity-ready', onUnityReady);

    // HUD → Unity: camera mode + follow target
    const unsubClock = useClock.subscribe((st, prev) => {
      if (!instance || !matchSent) return;
      if (st.cameraMode !== prev.cameraMode || st.povView !== prev.povView)
        instance.SendMessage('MatchRunner', 'SetCameraMode', unityCameraMode(st));
      if (st.followId !== prev.followId)
        instance.SendMessage('MatchRunner', 'SetFollow', followSlot(st.followId));
    });

    // master clock + entity streaming, mirrors scene/ClockDriver.tsx
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const delta = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;

      const st = useClock.getState();
      if (st.playing) {
        let t = playhead.t + delta * st.speed;
        // jump over dead stretches (nothing happens on the pitch there)
        for (const [s0, s1] of st.deadSpans) {
          if (t > s0 && t < s1) {
            t = s1;
            break;
          }
        }
        if (t >= st.duration) {
          t = st.duration;
          st.pause();
        } else if (t < 0) {
          t = 0;
          st.pause();
        }
        playhead.t = t;
      }
      if (Math.abs(playhead.t - lastUi) > 1 / 15) {
        lastUi = playhead.t;
        st.setUiT(playhead.t);
      }

      const bridge = window.__pitchsideUnity;
      if (!bridge?.bufferPtr || !bridge.getHeap) return;
      const heap = bridge.getHeap();
      const base = bridge.bufferPtr >> 2;
      const ir = modelRef.current.ir;
      const t = playhead.t;

      heap[base + 1] = t;
      heap[base + 2] = st.playing ? 1 : 0;

      const n = Math.min(ir.entities.length, MAX_ENTITIES);
      for (let i = 0; i < n; i++) {
        const o = base + HEADER_FLOATS + i * ENTITY_STRIDE;
        const track = ir.tracks[ir.entities[i].id];
        if (!track) {
          heap[o + 6] = 0;
          continue;
        }
        sampleTrack(track, t, sample);
        heap[o] = sample.x;
        heap[o + 1] = sample.y;
        heap[o + 2] = sample.z;
        heap[o + 3] = sample.heading;
        heap[o + 4] = sample.speed;
        heap[o + 5] = sample.action;
        heap[o + 6] = 1;
      }
    };

    (async () => {
      // manifest is written by scripts/unity-manifest.mjs after each Unity build
      const manifest = await fetch('/unity/manifest.json').then((r) => {
        if (!r.ok) throw new Error('Unity build not found — run `npm run build:unity` first.');
        return r.json();
      });
      await loadScript(manifest.loaderUrl);
      if (disposed || !window.createUnityInstance) return;

      instance = await window.createUnityInstance(canvas, {
        dataUrl: manifest.dataUrl,
        frameworkUrl: manifest.frameworkUrl,
        codeUrl: manifest.codeUrl,
        streamingAssetsUrl: '/unity/StreamingAssets',
        companyName: 'pitchside',
        productName: 'pitchside',
        productVersion: '1.0',
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      });
      if (disposed) {
        instance.Quit().catch(() => {});
        return;
      }
      playhead.invalidate = null; // rAF loop always runs; no demand-render hook
      trySendMatch();
      raf = requestAnimationFrame(tick);
    })().catch((err) => {
      console.error('[pitchside] Unity boot failed:', err);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('pitchside-unity-ready', onUnityReady);
      unsubClock();
      window.__pitchsideUnity = undefined;
      instance?.Quit().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="unity-canvas"
      style={{ width: '100%', height: '100%', display: 'block', background: '#02040a' }}
    />
  );
}
