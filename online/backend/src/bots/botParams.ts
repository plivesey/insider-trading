import type { BotProfile } from './profile.js';
import type { ValueNetWeights } from './valueNet.js';
import type { Rng } from '../domain/rng.js';

/**
 * Every hand-tuned constant in the bot's decision logic, in one place, so they
 * can be optimized as a vector by Evolution Strategies (see
 * scripts/trainBotParams.ts). `defaultBotParams()` reproduces today's behavior.
 *
 * Integer-valued knobs are floored/rounded at their use sites (bids are whole
 * dollars); the rest are continuous.
 */
export interface BotParams {
  // --- bidding / auction (decide.ts) ---
  winnerMargin: number; // ceiling = perceived − winnerMargin
  /** @deprecated No longer read. Opening bid is now maxBid − rand(0..3) (see decide.ts).
   * Kept so saved bot_params.json + the ES vector layout stay valid. */
  openingDiscount: number;
  loanCostOffset: number; // nextLoanCost(L) = L + loanCostOffset
  emergencySellCash: number; // sell a stock when cash < this and holding a loan
  ownedColorWeight: number; // market-pick weight = 1 + ownedColorWeight * ownedCount

  // --- stock special bumps (valuation.ts SPECIAL_BUMP) ---
  bumpExtraUp: number;
  bumpOtherUp: number;
  bumpPeekBuy: number;
  bumpPeekSell: number;

  // --- action-card valuation formula constants (valuation.ts) ---
  takeFaceUpBase: number; // Corner the Market flat/floor
  sellDoubleFloor: number; // Pump and Dump floor
  adjustStockCap: number; // The Squeeze cap
  flipAndAdjustFlat: number; // Wild Speculation
  tieBreakerFlat: number; // Preferred Bidder
  stealStockBonus: number; // Hostile Takeover bonus over 2nd-highest
  drawTipValue: number; // Insider Source (deck non-empty)
  sellSameBonusFloor: number; // Liquidation floor
  adjustAllFloor: number; // Rumor Mill floor
  secondHighestFallback: number; // proxy when market has no stocks

  // --- goal valuation (valuation.ts) ---
  goalBumpDivisorOffset: number; // floor(cash / (totalReq + offset))
  goalGapCutoff: number; // ignore goals more than this many cards away
  rewardAdjustMult: number; // ×amount for adjust_*/sell_bonus_batch rewards
  rewardDrawTipsMult: number; // ×count for draw_tips reward
  rewardPeekMult: number; // ×count for peek_tips reward
  rewardFlatValue: number; // set_stock / swap / draw_and_choose flat

  // --- personality (profile.ts), single values during optimization ---
  stockOffset: number; // also a net input feature
  actionOffset: number;
  wildShareValue: number;
  hotTipThreshold: number;
}

export interface ParamSpec {
  key: keyof BotParams;
  min: number;
  max: number;
  int: boolean;
}

/**
 * Search bounds + integer flag per parameter. The order here defines the ES
 * vector layout; defaults must be strictly interior to each [min,max] (the
 * logit encoding is undefined at the bounds).
 */
export const PARAM_SPECS: ParamSpec[] = [
  { key: 'winnerMargin', min: 0, max: 3, int: true },
  { key: 'openingDiscount', min: 0, max: 4, int: true },
  { key: 'loanCostOffset', min: 0, max: 5, int: true },
  { key: 'emergencySellCash', min: 0, max: 20, int: true },
  { key: 'ownedColorWeight', min: 0, max: 8, int: false },

  { key: 'bumpExtraUp', min: 0, max: 4, int: false },
  { key: 'bumpOtherUp', min: 0, max: 4, int: false },
  { key: 'bumpPeekBuy', min: 0, max: 3, int: false },
  { key: 'bumpPeekSell', min: 0, max: 3, int: false },

  { key: 'takeFaceUpBase', min: 0, max: 8, int: false },
  { key: 'sellDoubleFloor', min: 0, max: 12, int: false },
  { key: 'adjustStockCap', min: 0, max: 12, int: false },
  { key: 'flipAndAdjustFlat', min: 0, max: 8, int: false },
  { key: 'tieBreakerFlat', min: 0, max: 8, int: false },
  { key: 'stealStockBonus', min: 0, max: 4, int: false },
  { key: 'drawTipValue', min: 0, max: 8, int: false },
  { key: 'sellSameBonusFloor', min: 0, max: 4, int: false },
  { key: 'adjustAllFloor', min: 0, max: 4, int: false },
  { key: 'secondHighestFallback', min: 0, max: 8, int: false },

  { key: 'goalBumpDivisorOffset', min: 1, max: 8, int: true },
  { key: 'goalGapCutoff', min: 1, max: 4, int: true },
  { key: 'rewardAdjustMult', min: 0, max: 4, int: false },
  { key: 'rewardDrawTipsMult', min: 0, max: 5, int: false },
  { key: 'rewardPeekMult', min: 0, max: 4, int: false },
  { key: 'rewardFlatValue', min: 0, max: 6, int: false },

  { key: 'stockOffset', min: -2, max: 3, int: false },
  { key: 'actionOffset', min: -3, max: 2, int: false },
  { key: 'wildShareValue', min: 0, max: 8, int: false },
  { key: 'hotTipThreshold', min: 0, max: 4, int: true }
];

export function defaultBotParams(): BotParams {
  return {
    winnerMargin: 1,
    openingDiscount: 1,
    loanCostOffset: 2,
    emergencySellCash: 10,
    ownedColorWeight: 3,

    bumpExtraUp: 2,
    bumpOtherUp: 2,
    bumpPeekBuy: 1,
    bumpPeekSell: 1,

    takeFaceUpBase: 4,
    sellDoubleFloor: 6,
    adjustStockCap: 6,
    flipAndAdjustFlat: 4,
    tieBreakerFlat: 3,
    stealStockBonus: 1,
    drawTipValue: 3,
    sellSameBonusFloor: 1,
    adjustAllFloor: 1,
    secondHighestFallback: 3,

    goalBumpDivisorOffset: 3,
    goalGapCutoff: 2,
    rewardAdjustMult: 2,
    rewardDrawTipsMult: 3,
    rewardPeekMult: 2,
    rewardFlatValue: 3,

    stockOffset: 1,
    actionOffset: -1,
    wildShareValue: 4,
    hotTipThreshold: 1
  };
}

const PARAM_COUNT = PARAM_SPECS.length;

const sigmoid = (u: number): number => 1 / (1 + Math.exp(-u));
const logit = (p: number): number => Math.log(p / (1 - p));

/** Encode params → unbounded ES vector (per-param logit of its [min,max] fraction). */
export function encodeParams(p: BotParams): Float64Array {
  const v = new Float64Array(PARAM_COUNT);
  PARAM_SPECS.forEach((s, i) => {
    const frac = (p[s.key] - s.min) / (s.max - s.min);
    const clamped = Math.min(1 - 1e-6, Math.max(1e-6, frac));
    v[i] = logit(clamped);
  });
  return v;
}

/** Decode an unbounded ES vector → params (sigmoid back into range, rounding ints). */
export function decodeParams(v: Float64Array | number[]): BotParams {
  const out = {} as BotParams;
  PARAM_SPECS.forEach((s, i) => {
    let val = s.min + (s.max - s.min) * sigmoid(v[i]);
    if (s.int) val = Math.round(val);
    out[s.key] = Math.min(s.max, Math.max(s.min, val));
  });
  return out;
}

/** The ES vector that decodes (back) to today's defaults — the optimizer's start point. */
export function defaultVector(): Float64Array {
  return encodeParams(defaultBotParams());
}

export const PARAM_DIM = PARAM_COUNT;

/**
 * Build a fresh per-game bot profile from a parameter set (+ optional trained
 * net). Resets the mutable per-game fields and mirrors the four personality
 * params onto the legacy BotProfile fields the engine/net-encoder already read.
 */
export function makeBotProfile(params: BotParams, net?: ValueNetWeights): BotProfile {
  return {
    stockOffset: params.stockOffset,
    actionOffset: params.actionOffset,
    hotTipThreshold: params.hotTipThreshold,
    wildShareValue: params.wildShareValue,
    knownPeekedTips: [],
    auctionCeilings: {},
    auctionBidOffsets: {},
    valueNet: net,
    params,
    lastSeenProgressTracker: -1,
    lastProgressTurn: 0,
    ownTurnActionCardStreak: 0,
    ownTurnStreakTurnNumber: -1
  };
}

const SPEC_BY_KEY: Record<keyof BotParams, ParamSpec> = Object.fromEntries(
  PARAM_SPECS.map(s => [s.key, s])
) as Record<keyof BotParams, ParamSpec>;

/**
 * Action-card-valuation knobs that get per-bot personality variety. Excludes
 * everything that feeds the trained net (stockOffset, wildShareValue, bump*,
 * goal-progress params = "stock pricing") and all bidding constants — per the
 * design, the only bidding randomness is the per-auction min-bid band, and the
 * net handles stock value. hotTipThreshold is jittered separately (redrawn 0..2).
 */
export const VARIETY_ACTION_KEYS: (keyof BotParams)[] = [
  'actionOffset',
  'takeFaceUpBase',
  'sellDoubleFloor',
  'adjustStockCap',
  'flipAndAdjustFlat',
  'tieBreakerFlat',
  'stealStockBonus',
  'drawTipValue',
  'sellSameBonusFloor',
  'adjustAllFloor',
  'secondHighestFallback',
  'rewardAdjustMult',
  'rewardDrawTipsMult',
  'rewardPeekMult',
  'rewardFlatValue'
];

/** ± fraction of each param's [min,max] range used as the variety band. */
const VARIETY_BAND = 0.15;

function clampToSpec(key: keyof BotParams, value: number): number {
  const s = SPEC_BY_KEY[key];
  let v = s.int ? Math.round(value) : value;
  return Math.min(s.max, Math.max(s.min, v));
}

/**
 * Build a production bot profile: trained net + tuned constants, with a small
 * amount of per-bot variety jittered around the trained centers. Only the
 * action-card-valuation knobs (VARIETY_ACTION_KEYS) and hotTipThreshold vary;
 * everything that feeds the net and all bidding constants stay fixed at their
 * trained values. Jitter is additive, ±VARIETY_BAND of each param's range,
 * clamped to bounds.
 */
export function makeProductionBotProfile(
  rng: Rng,
  net: ValueNetWeights,
  baseParams: BotParams
): BotProfile {
  const params: BotParams = { ...baseParams };
  for (const key of VARIETY_ACTION_KEYS) {
    const s = SPEC_BY_KEY[key];
    const delta = (rng.next() * 2 - 1) * VARIETY_BAND * (s.max - s.min);
    params[key] = clampToSpec(key, baseParams[key] + delta);
  }
  // Hot Tip timing: redraw 0..2 (when in the game the bot spends its peek).
  params.hotTipThreshold = rng.int(3);
  const profile = makeBotProfile(params, net);
  // Market Order strategy (only used when rules.startingBuyCard is on): 50/50.
  profile.buyCardStrategy = rng.int(2) === 0 ? 'pairs' : 'goal';
  return profile;
}
