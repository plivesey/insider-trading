import { makeRng } from '../../src/domain/rng.js';
import {
  flattenWeights,
  forward,
  paramCount,
  randomWeights,
  unflattenWeights
} from '../../src/bots/valueNet.js';
import { STOCK_FEATURE_LEN } from '../../src/bots/valueNetFeatures.js';

describe('valueNet forward + weight (de)serialization', () => {
  const inputDim = STOCK_FEATURE_LEN;
  const hiddenDim = 12;

  test('paramCount matches structure', () => {
    expect(paramCount(inputDim, hiddenDim)).toBe(inputDim * hiddenDim + hiddenDim + hiddenDim + 1);
  });

  test('flatten -> unflatten round-trips', () => {
    const w = randomWeights(inputDim, hiddenDim, makeRng(3), 12);
    const flat = flattenWeights(w);
    expect(flat.length).toBe(paramCount(inputDim, hiddenDim));
    const w2 = unflattenWeights(flat, inputDim, hiddenDim, 12);
    expect(w2.w1).toEqual(w.w1);
    expect(w2.b1).toEqual(w.b1);
    expect(w2.w2).toEqual(w.w2);
    expect(w2.b2).toBe(w.b2);
    expect(w2.outScale).toBe(12);
  });

  test('forward is finite and within [0, clamp] on random + extreme inputs', () => {
    const w = randomWeights(inputDim, hiddenDim, makeRng(5), 12);
    const cases = [
      new Float64Array(inputDim), // all zeros
      new Float64Array(inputDim).fill(1),
      new Float64Array(inputDim).fill(-1),
      new Float64Array(inputDim).fill(1e6), // huge -> softplus overflow guard
      new Float64Array(inputDim).fill(-1e6)
    ];
    for (const x of cases) {
      const y = forward(w, x);
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(999);
    }
  });

  test('untrained net emits a sane mid-range value (~$5) for a zero feature vector', () => {
    const w = randomWeights(inputDim, hiddenDim, makeRng(9), 12);
    // With zero inputs, tanh(b1=0)=0, so output = softplus(b2)*outScale ≈ 5.
    const y = forward(w, new Float64Array(inputDim));
    expect(y).toBeGreaterThan(2);
    expect(y).toBeLessThan(9);
  });

  test('forward is deterministic', () => {
    const w = randomWeights(inputDim, hiddenDim, makeRng(11), 12);
    const x = new Float64Array(inputDim).map((_, i) => Math.sin(i));
    expect(forward(w, x)).toBe(forward(w, x));
  });
});
