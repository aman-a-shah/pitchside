/**
 * Deterministic, seedable pseudo-random number generation.
 *
 * A seeded RNG is essential for PitchSide: match synthesis must be reproducible
 * so that (a) a given match id always renders identically, and (b) hand-authored
 * video clock-anchors line up with the same simulated events every run.
 */

/** mulberry32 — tiny, fast, decent-quality 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit unsigned int (for turning match ids into seeds). */
export function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small stateful RNG helper with convenience distributions. */
export class Rng {
  private next: () => number;

  constructor(seed: number | string) {
    const s = typeof seed === 'string' ? hashStringToSeed(seed) : seed;
    this.next = mulberry32(s >>> 0);
  }

  /** Uniform [0,1). */
  float(): number {
    return this.next();
  }

  /** Uniform [min,max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min,max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a random element. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Approximately-normal via sum of uniforms (mean 0, std ~1). */
  gaussian(mean = 0, std = 1): number {
    const u = this.next() + this.next() + this.next() + this.next() - 2;
    return mean + u * std * 0.8165; // normalize variance of sum-of-4 uniforms
  }
}
