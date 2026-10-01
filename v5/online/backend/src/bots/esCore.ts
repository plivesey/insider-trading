import type { Rng } from '../domain/rng.js';

/**
 * Shared Evolution-Strategies primitives used by both optimizers
 * (scripts/trainStockValueNet.ts for net weights, scripts/trainBotParams.ts for
 * the constant vector). OpenAI-style: mirrored sampling + rank-normalized
 * utilities. The objective is treated as a black box — only `evalFn(vector)`.
 */

/** Cheap 2-arg seed mix for deriving deterministic sub-seeds. */
export function hashSeed(a: number, b: number): number {
  return (Math.imul(a >>> 0, 2654435761) ^ Math.imul(b >>> 0, 40503) ^ 0x9e3779b9) >>> 0;
}

/** Vector of standard normals via Box–Muller, sourced from a seedable Rng. */
export function gaussianVec(rng: Rng, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let u = rng.next();
    const v = rng.next();
    if (u < 1e-12) u = 1e-12;
    out[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  return out;
}

/** Rank-normalize fitnesses to centered utilities in [-0.5, 0.5] (scale-robust). */
export function rankUtilities(fits: number[]): number[] {
  const order = fits.map((_, i) => i).sort((a, b) => fits[a] - fits[b]);
  const u = new Array<number>(fits.length);
  const denom = Math.max(1, fits.length - 1);
  order.forEach((idx, rank) => {
    u[idx] = rank / denom - 0.5;
  });
  return u;
}

export interface EsStepOpts {
  popPairs: number; // P; population is 2P (antithetic)
  sigma: number;
  lr: number;
  noiseRng: Rng;
}

/**
 * One OpenAI-ES generation: perturb `theta` with P mirrored Gaussian pairs,
 * score each candidate with `evalFn`, and nudge `theta` (in place) toward the
 * higher-ranked directions. Returns the raw fitnesses for logging.
 */
export function esStep(
  theta: Float64Array,
  evalFn: (candidate: Float64Array) => number,
  opts: EsStepOpts
): { fits: number[] } {
  const dim = theta.length;
  const fits: number[] = [];
  const dirs: Float64Array[] = [];
  for (let p = 0; p < opts.popPairs; p++) {
    const eps = gaussianVec(opts.noiseRng, dim);
    for (const sign of [1, -1] as const) {
      const cand = new Float64Array(dim);
      for (let i = 0; i < dim; i++) cand[i] = theta[i] + sign * opts.sigma * eps[i];
      fits.push(evalFn(cand));
      const dir = new Float64Array(dim);
      for (let i = 0; i < dim; i++) dir[i] = sign * eps[i];
      dirs.push(dir);
    }
  }
  const util = rankUtilities(fits);
  const N = fits.length;
  const scale = opts.lr / (N * opts.sigma);
  for (let i = 0; i < dim; i++) {
    let g = 0;
    for (let m = 0; m < N; m++) g += util[m] * dirs[m][i];
    theta[i] += scale * g;
  }
  return { fits };
}
