/**
 * Audio engine — the match's sound, built entirely from a WebAudio graph.
 *
 * Nothing here needs a sample library: the crowd is filtered noise (two
 * bandpassed layers with a slow wobble reads convincingly as a distant
 * stadium), the roar is an enveloped noise swell with a rising formant, and
 * the referee's whistle is a vibrato oscillator. Commentary is the one real
 * asset — pre-baked TTS clips (see scripts/generate-commentary.mjs) played
 * through an HTMLAudio element routed into the graph, so historic matches
 * can run through a period radio chain (bandpass + soft clip + crackle).
 *
 * Browsers gate AudioContext behind a user gesture: `arm()` is called from
 * the first pointer/key interaction and everything before that is silent.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let crowdGain: GainNode | null = null;
let roarGain: GainNode | null = null;
let commentaryGain: GainNode | null = null;
let radioCrackle: GainNode | null = null;
let muted = false;

/** shared 4s noise buffer (built once) */
let noiseBuffer: AudioBuffer | null = null;

function noise(): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const c = ctx!;
  const buf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const d = buf.getChannelData(0);
  // pink-ish noise via the Voss-ish cheap filter — pure white reads as static
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + 0.029591 * w;
    b1 = 0.985 * b1 + 0.032534 * w;
    b2 = 0.95 * b2 + 0.048056 * w;
    d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2;
  }
  noiseBuffer = buf;
  return buf;
}

function loopedNoise(freq: number, q: number, gain: number, dest: AudioNode): GainNode {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise();
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(dest);
  src.start();
  return g;
}

/** true once the context exists (i.e. after the first user gesture) */
export function armed(): boolean {
  return !!ctx;
}

/** Build the graph. Must be called from a user-gesture handler. */
export function arm(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  // ---- crowd bed: murmur + air, with a slow organic wobble ----
  crowdGain = ctx.createGain();
  crowdGain.gain.value = 0;
  crowdGain.connect(master);
  loopedNoise(480, 0.6, 0.7, crowdGain);
  loopedNoise(1400, 0.5, 0.28, crowdGain);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.05;
  lfo.connect(lfoDepth).connect(crowdGain.gain);
  lfo.start();

  // ---- roar layer (idle at zero; enveloped on demand) ----
  roarGain = ctx.createGain();
  roarGain.gain.value = 0;
  roarGain.connect(master);
  loopedNoise(700, 0.9, 0.9, roarGain);
  loopedNoise(2600, 0.7, 0.32, roarGain);

  // ---- commentary chain ----
  commentaryGain = ctx.createGain();
  commentaryGain.gain.value = 1;
  commentaryGain.connect(master);

  // vinyl crackle for the radio era: sparse impulse noise, off by default
  radioCrackle = ctx.createGain();
  radioCrackle.gain.value = 0;
  radioCrackle.connect(master);
  const crackleSrc = ctx.createBufferSource();
  const cbuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const cd = cbuf.getChannelData(0);
  for (let i = 0; i < cd.length; i++) {
    cd[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.8 : 0;
  }
  crackleSrc.buffer = cbuf;
  crackleSrc.loop = true;
  const chp = ctx.createBiquadFilter();
  chp.type = 'highpass';
  chp.frequency.value = 1800;
  crackleSrc.connect(chp).connect(radioCrackle);
  crackleSrc.start();
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, 0.08);
}

/** crowd bed level, 0..1 (ramped) */
export function setCrowdLevel(level: number): void {
  if (!ctx || !crowdGain) return;
  crowdGain.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
}

/** A crowd surge: intensity 0..1 (goal ≈ 1, big chance ≈ 0.5). */
export function roar(intensity: number, duration = 4.5): void {
  if (!ctx || !roarGain) return;
  const t = ctx.currentTime;
  const peak = 0.25 + intensity * 0.8;
  const g = roarGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(peak, t + 0.35 + (1 - intensity) * 0.4);
  g.setTargetAtTime(0.0001, t + duration * 0.45, duration * 0.28);
}

/** Referee's whistle: 'kickoff' | 'half' | 'full' | 'foul'. */
export function whistle(kind: 'kickoff' | 'half' | 'full' | 'foul'): void {
  if (!ctx || !master) return;
  const blasts =
    kind === 'full' ? [0, 0.45, 0.9] : kind === 'half' ? [0, 0.5] : [0];
  const dur = kind === 'foul' ? 0.28 : kind === 'full' ? 0.7 : 0.55;
  for (const off of blasts) {
    const t0 = ctx.currentTime + off + 0.01;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 2050;
    const vib = ctx.createOscillator();
    vib.frequency.value = 38; // pea-whistle trill
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 130;
    vib.connect(vibDepth).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
    g.gain.setValueAtTime(0.09, t0 + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    osc.connect(lp).connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    vib.start(t0);
    vib.stop(t0 + dur + 0.05);
  }
}

// ------------------------------- commentary -----------------------------------

let currentClip: HTMLAudioElement | null = null;
let currentPriority = 0;
const sourceCache = new WeakSet<HTMLAudioElement>();

export function commentaryBusy(): boolean {
  return !!currentClip && !currentClip.ended && !currentClip.paused;
}

export function stopCommentary(): void {
  if (currentClip) {
    currentClip.pause();
    currentClip = null;
    currentPriority = 0;
  }
  if (ctx && crowdGain) duck(false);
  if (ctx && radioCrackle) radioCrackle.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}

let lastCrowdTarget = 0;

/** commentary sits above the crowd like a broadcast mix */
function duck(on: boolean): void {
  if (!ctx || !crowdGain) return;
  crowdGain.gain.setTargetAtTime(lastCrowdTarget * (on ? 0.45 : 1), ctx.currentTime, 0.25);
}
export function setCrowdTarget(level: number): void {
  lastCrowdTarget = level;
  setCrowdLevel(commentaryBusy() ? level * 0.45 : level);
}

/**
 * Play a baked commentary clip. Returns false if a clip of equal or higher
 * priority is already speaking (the broadcast never talks over itself).
 * `vintage` routes the voice through the period radio chain.
 */
export function playCommentary(url: string, priority: number, vintage: boolean): boolean {
  if (!ctx || !commentaryGain) return false;
  if (commentaryBusy() && priority <= currentPriority) return false;
  stopCommentary();

  const el = new Audio(url);
  el.crossOrigin = 'anonymous';
  currentClip = el;
  currentPriority = priority;

  if (!sourceCache.has(el)) {
    sourceCache.add(el);
    const src = ctx.createMediaElementSource(el);
    if (vintage) {
      // AM-radio band, a touch of grit, and the crackle bed underneath
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 320;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 127.5) - 1;
        curve[i] = Math.tanh(x * 1.9) * 0.88;
      }
      shaper.curve = curve;
      const g = ctx.createGain();
      g.gain.value = 1.5;
      src.connect(hp).connect(lp).connect(shaper).connect(g).connect(commentaryGain);
    } else {
      const g = ctx.createGain();
      g.gain.value = 1.25;
      src.connect(g).connect(commentaryGain);
    }
  }

  if (vintage && radioCrackle) {
    radioCrackle.gain.setTargetAtTime(0.5, ctx.currentTime, 0.15);
  }
  duck(true);

  const done = () => {
    if (currentClip === el) {
      currentClip = null;
      currentPriority = 0;
    }
    duck(false);
    if (radioCrackle && ctx) radioCrackle.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  };
  el.addEventListener('ended', done, { once: true });
  el.addEventListener('error', done, { once: true });
  void el.play().catch(done);
  return true;
}
