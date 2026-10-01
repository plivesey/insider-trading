import type { Color, GameState, PlayerId, StockCard } from '@insider-trading/shared';
import type { BotProfile } from './profile.js';
import {
  STOCK_FEATURE_LEN,
  encodeColorFeatures,
  encodeStockCardFeatures
} from './valueNetFeatures.js';
import type { Rng } from '../domain/rng.js';

/**
 * Weights for the tiny stock-valuation MLP: inputDim -> hiddenDim (tanh) -> 1
 * (softplus * outScale). JSON-serializable so a trained champion is just a file
 * the backend loads at startup. Trained by Evolution Strategies (see
 * scripts/trainStockValueNet.ts).
 *
 * `inputDim`/`hiddenDim`/`outScale` are structure/hyperparameters, not optimized.
 * Only w1/b1/w2/b2 are searched over (see flattenWeights).
 */
export interface ValueNetWeights {
  inputDim: number;
  hiddenDim: number;
  w1: number[]; // hiddenDim * inputDim, row-major: w1[h*inputDim + i]
  b1: number[]; // hiddenDim
  w2: number[]; // hiddenDim
  b2: number;
  outScale: number; // dollar scale on the softplus output (~12)
}

const OUT_CLAMP = 999; // defensive upper bound on a dollar value

/** Numerically stable softplus: log(1 + e^z), linear for large z. */
function softplus(z: number): number {
  if (z > 30) return z;
  if (z < -30) return Math.exp(z);
  return Math.log1p(Math.exp(z));
}

/** Forward pass. `x` must have length === w.inputDim. Output is in [0, OUT_CLAMP]. */
export function forward(w: ValueNetWeights, x: Float64Array): number {
  const { inputDim, hiddenDim, w1, b1, w2 } = w;
  let out = w.b2;
  for (let h = 0; h < hiddenDim; h++) {
    let sum = b1[h];
    const base = h * inputDim;
    for (let i = 0; i < inputDim; i++) sum += w1[base + i] * x[i];
    out += w2[h] * Math.tanh(sum);
  }
  const y = softplus(out) * w.outScale;
  if (!Number.isFinite(y)) return 0;
  return Math.max(0, Math.min(OUT_CLAMP, y));
}

/** Number of trainable parameters for the given structure. */
export function paramCount(inputDim: number, hiddenDim: number): number {
  return inputDim * hiddenDim + hiddenDim + hiddenDim + 1;
}

/** Flatten the trainable params into a single vector (ES parameter space). */
export function flattenWeights(w: ValueNetWeights): Float64Array {
  const flat = new Float64Array(paramCount(w.inputDim, w.hiddenDim));
  let k = 0;
  for (let i = 0; i < w.w1.length; i++) flat[k++] = w.w1[i];
  for (let i = 0; i < w.b1.length; i++) flat[k++] = w.b1[i];
  for (let i = 0; i < w.w2.length; i++) flat[k++] = w.w2[i];
  flat[k++] = w.b2;
  return flat;
}

/** Inverse of flattenWeights given the fixed structure. */
export function unflattenWeights(
  flat: Float64Array | number[],
  inputDim: number,
  hiddenDim: number,
  outScale: number
): ValueNetWeights {
  let k = 0;
  const w1 = new Array<number>(inputDim * hiddenDim);
  for (let i = 0; i < w1.length; i++) w1[i] = flat[k++];
  const b1 = new Array<number>(hiddenDim);
  for (let i = 0; i < hiddenDim; i++) b1[i] = flat[k++];
  const w2 = new Array<number>(hiddenDim);
  for (let i = 0; i < hiddenDim; i++) w2[i] = flat[k++];
  const b2 = flat[k++];
  return { inputDim, hiddenDim, w1, b1, w2, b2, outScale };
}

/** Inverse softplus: pick a bias so the initial output is ~targetDollars. */
function inverseSoftplus(y: number): number {
  // y = log(1 + e^z)  =>  z = log(e^y - 1)
  return Math.log(Math.expm1(Math.max(1e-6, y)));
}

/** Standard normal via Box–Muller, sourced from the seedable Rng. */
function gaussian(rng: Rng): number {
  let u = rng.next();
  let v = rng.next();
  if (u < 1e-12) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Small random init. Hidden weights scaled by 1/sqrt(inputDim); output weights
 * small; b2 chosen so the untrained net emits ~$5 (a sane mid-range bid that
 * won't distort early self-play games before training kicks in).
 */
export function randomWeights(
  inputDim: number,
  hiddenDim: number,
  rng: Rng,
  outScale = 12
): ValueNetWeights {
  const s1 = 1 / Math.sqrt(inputDim);
  const w1 = new Array<number>(inputDim * hiddenDim);
  for (let i = 0; i < w1.length; i++) w1[i] = gaussian(rng) * s1;
  const b1 = new Array<number>(hiddenDim).fill(0);
  const w2 = new Array<number>(hiddenDim);
  for (let i = 0; i < hiddenDim; i++) w2[i] = gaussian(rng) * 0.1;
  const b2 = inverseSoftplus(5 / outScale);
  return { inputDim, hiddenDim, w1, b1, w2, b2, outScale };
}

/** Value a colored stock (or Wild) by color. Mirrors perceivedStockValue's signature. */
export function valueColor(
  net: ValueNetWeights,
  state: GameState,
  color: Color | null,
  isWild: boolean,
  botId: PlayerId,
  profile: BotProfile
): number {
  const x = encodeColorFeatures(state, color, isWild, botId, profile);
  return forward(net, x);
}

/** Value a specific stock card. Includes the special-ability bump separately (see valuation.ts). */
export function valueStockCard(
  net: ValueNetWeights,
  state: GameState,
  card: StockCard,
  botId: PlayerId,
  profile: BotProfile
): number {
  const x = encodeStockCardFeatures(state, card, botId, profile);
  return forward(net, x);
}

export { STOCK_FEATURE_LEN };
