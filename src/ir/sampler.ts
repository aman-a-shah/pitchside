/**
 * Track sampler — evaluates a dense uniform-grid Track at an arbitrary clock time
 * with smooth interpolation. Because tracks are stored on a uniform grid, locating
 * the bracketing samples is O(1) index math (no binary search), and playback at any
 * speed / direction is just a matter of choosing t.
 */

import { Action, Sample, Track } from './types';

const TAU = Math.PI * 2;

/** Shortest-path angular interpolation (radians). */
export function lerpAngle(a: number, b: number, f: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * f;
}

/** Sample a track at match-clock time `t` (seconds). Clamps to track bounds. */
export function sampleTrack(track: Track, t: number, out?: Sample): Sample {
  const o: Sample = out ?? { x: 0, y: 0, z: 0, speed: 0, heading: 0, action: Action.Idle };
  const { hz, t0, count } = track;

  if (count === 0) {
    o.x = o.y = o.z = o.speed = o.heading = 0;
    o.action = Action.Idle;
    return o;
  }

  const fpos = (t - t0) * hz; // fractional sample index
  if (fpos <= 0) {
    return copySample(track, 0, o);
  }
  if (fpos >= count - 1) {
    return copySample(track, count - 1, o);
  }

  const i = fpos | 0;
  const f = fpos - i;
  const j = i + 1;

  o.x = track.x[i] + (track.x[j] - track.x[i]) * f;
  o.y = track.y[i] + (track.y[j] - track.y[i]) * f;
  o.z = track.z[i] + (track.z[j] - track.z[i]) * f;
  o.speed = track.speed[i] + (track.speed[j] - track.speed[i]) * f;
  o.heading = lerpAngle(track.heading[i], track.heading[j], f);
  // Action is a discrete pose — take the nearer sample so brief poses aren't lost.
  o.action = (f < 0.5 ? track.action[i] : track.action[j]) as Action;
  return o;
}

function copySample(track: Track, i: number, o: Sample): Sample {
  o.x = track.x[i];
  o.y = track.y[i];
  o.z = track.z[i];
  o.speed = track.speed[i];
  o.heading = track.heading[i];
  o.action = track.action[i] as Action;
  return o;
}

/** Allocate an empty dense track with `count` samples on a uniform grid. */
export function createTrack(hz: number, count: number, t0 = 0): Track {
  return {
    hz,
    t0,
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    speed: new Float32Array(count),
    heading: new Float32Array(count),
    action: new Uint8Array(count),
  };
}
