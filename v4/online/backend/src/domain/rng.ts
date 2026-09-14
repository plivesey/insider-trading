// Tiny seedable PRNG (mulberry32). Deterministic; used everywhere randomness
// would otherwise leak into the game (shuffles, die rolls, future picks).

export interface Rng {
  next(): number; // [0, 1)
  int(maxExclusive: number): number;
  pick<T>(arr: T[]): T;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(maxExclusive) {
      return Math.floor(next() * maxExclusive);
    },
    pick<T>(arr: T[]) {
      return arr[Math.floor(next() * arr.length)];
    }
  };
}
