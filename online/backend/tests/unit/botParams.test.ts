import { makeRng } from '../../src/domain/rng.js';
import {
  PARAM_DIM,
  PARAM_SPECS,
  VARIETY_ACTION_KEYS,
  decodeParams,
  defaultBotParams,
  defaultVector,
  encodeParams,
  makeBotProfile,
  makeProductionBotProfile,
  type BotParams
} from '../../src/bots/botParams.js';
import { perceivedStockSpecialBump, rewardCashEquivalent } from '../../src/bots/valuation.js';
import type { ValueNetWeights } from '../../src/bots/valueNet.js';

describe('botParams encode/decode', () => {
  test('defaultVector decodes back to defaultBotParams', () => {
    const decoded = decodeParams(defaultVector());
    const defaults = defaultBotParams();
    for (const s of PARAM_SPECS) {
      expect(decoded[s.key]).toBeCloseTo(defaults[s.key], 6);
    }
  });

  test('encode∘decode round-trips arbitrary in-range params', () => {
    const rng = makeRng(7);
    for (let t = 0; t < 25; t++) {
      const p = {} as BotParams;
      for (const s of PARAM_SPECS) {
        // a random value strictly inside (min, max)
        let v = s.min + (s.max - s.min) * (0.05 + 0.9 * rng.next());
        if (s.int) v = Math.round(v);
        p[s.key] = v;
      }
      const back = decodeParams(encodeParams(p));
      for (const s of PARAM_SPECS) {
        if (s.int) expect(back[s.key]).toBe(p[s.key]);
        else expect(back[s.key]).toBeCloseTo(p[s.key], 4);
      }
    }
  });

  test('decode keeps every param within its bounds and rounds ints', () => {
    const extreme = new Float64Array(PARAM_DIM).fill(0);
    const hi = new Float64Array(PARAM_DIM).fill(50);
    const lo = new Float64Array(PARAM_DIM).fill(-50);
    for (const vec of [extreme, hi, lo]) {
      const p = decodeParams(vec);
      PARAM_SPECS.forEach(s => {
        expect(p[s.key]).toBeGreaterThanOrEqual(s.min);
        expect(p[s.key]).toBeLessThanOrEqual(s.max);
        if (s.int) expect(Number.isInteger(p[s.key])).toBe(true);
      });
    }
  });
});

describe('default params reproduce the original hard-coded constants', () => {
  test('stock special bumps', () => {
    expect(perceivedStockSpecialBump('extra_up')).toBe(2);
    expect(perceivedStockSpecialBump('other_up')).toBe(2);
    expect(perceivedStockSpecialBump('peek_buy')).toBe(1);
    expect(perceivedStockSpecialBump('peek_sell')).toBe(1);
    expect(perceivedStockSpecialBump('blank')).toBe(0);
    expect(perceivedStockSpecialBump('wild')).toBe(0);
    // Alternate: Scout gains the card outright, valued like a 1-card Insider
    // Source draw instead of the flat Classic peek bump.
    const params = defaultBotParams();
    expect(perceivedStockSpecialBump('peek_buy', params, 'alternate')).toBe(params.drawTipValue);
  });

  test('goal-reward cash equivalents', () => {
    expect(rewardCashEquivalent({ type: 'gain_cash', amount: 8 }, 4)).toBe(8);
    expect(rewardCashEquivalent({ type: 'adjust_stock', amount: 3 }, 4)).toBe(6); // ×2
    expect(rewardCashEquivalent({ type: 'adjust_two_stocks', up: 3, down: 3 }, 4)).toBe(6); // up×2
    expect(rewardCashEquivalent({ type: 'set_stock', amount: 6 }, 4)).toBe(3); // flat
    expect(rewardCashEquivalent({ type: 'peek_tips', count: 2 }, 4)).toBe(4); // ×2
    expect(rewardCashEquivalent({ type: 'draw_tips', count: 2 }, 4)).toBe(6); // ×3
    expect(rewardCashEquivalent({ type: 'swap_with_market' }, 4)).toBe(6); // best market card
    expect(rewardCashEquivalent({ type: 'steal_from_all', amount: 2 }, 4)).toBe(6); // ×(n−1)
  });
});

describe('makeBotProfile', () => {
  test('mirrors personality params and resets per-game mutable state', () => {
    const p = defaultBotParams();
    const prof = makeBotProfile(p);
    expect(prof.params).toBe(p);
    expect(prof.stockOffset).toBe(p.stockOffset);
    expect(prof.actionOffset).toBe(p.actionOffset);
    expect(prof.hotTipThreshold).toBe(p.hotTipThreshold);
    expect(prof.wildShareValue).toBe(p.wildShareValue);
    expect(prof.knownPeekedTips).toEqual([]);
    expect(prof.auctionCeilings).toEqual({});
    expect(prof.auctionBidOffsets).toEqual({});
    expect(prof.valueNet).toBeUndefined();
  });
});

describe('makeProductionBotProfile', () => {
  const fakeNet = {} as ValueNetWeights;
  const variedKeys = new Set<keyof BotParams>([...VARIETY_ACTION_KEYS, 'hotTipThreshold']);

  test('attaches the net and resets per-game mutable state', () => {
    const prof = makeProductionBotProfile(makeRng(1), fakeNet, defaultBotParams());
    expect(prof.valueNet).toBe(fakeNet);
    expect(prof.knownPeekedTips).toEqual([]);
    expect(prof.auctionCeilings).toEqual({});
    expect(prof.auctionBidOffsets).toEqual({});
  });

  test('keeps every param in bounds and only jitters the variety knobs', () => {
    const base = defaultBotParams();
    for (let seed = 0; seed < 200; seed++) {
      const prof = makeProductionBotProfile(makeRng(seed), fakeNet, base);
      const p = prof.params;
      for (const s of PARAM_SPECS) {
        expect(p[s.key]).toBeGreaterThanOrEqual(s.min);
        expect(p[s.key]).toBeLessThanOrEqual(s.max);
        if (s.int) expect(Number.isInteger(p[s.key])).toBe(true);
        // Non-variety params (net features, bidding constants) stay at center.
        if (!variedKeys.has(s.key)) expect(p[s.key]).toBe(base[s.key]);
      }
      expect(p.hotTipThreshold).toBeGreaterThanOrEqual(0);
      expect(p.hotTipThreshold).toBeLessThanOrEqual(2);
    }
  });

  test('actually varies the action-card knobs across seeds', () => {
    const base = defaultBotParams();
    const seen = new Map<keyof BotParams, Set<number>>();
    for (const k of VARIETY_ACTION_KEYS) seen.set(k, new Set());
    for (let seed = 0; seed < 50; seed++) {
      const p = makeProductionBotProfile(makeRng(seed), fakeNet, base).params;
      for (const k of VARIETY_ACTION_KEYS) seen.get(k)!.add(p[k]);
    }
    // Each jittered knob should take more than one distinct value.
    for (const k of VARIETY_ACTION_KEYS) expect(seen.get(k)!.size).toBeGreaterThan(1);
  });
});
