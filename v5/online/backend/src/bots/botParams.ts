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
  /** @deprecated Vestigial since Classic's setup variant was removed -- peek_buy
   * (Scout) always values via `drawTipValue` now. Kept so saved bot_params.json
   * + the ES vector layout stay valid. */
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

  // --- bidding/action-play fixes (decide.ts), appended 2026-09-27 -- see
  // v5_tuning_notes.md item 18. Each defaults to a value that exactly
  // reproduces pre-fix behavior, so existing trained vectors are unaffected
  // until these are deliberately tuned. Appended at the END of the params
  // list (and PARAM_SPECS below) since order defines the ES vector layout.
  loanWillingness: number; // 0..1: graduated credit line vs. effectiveBidCeiling's old cliff (0 = old behavior)
  endgameDiscountStrength: number; // 0..1: discounts `perceived` as the progress tracker nears threshold (0 = no discount)

  // --- decaying tip-play threshold (decide.ts tipPlayThreshold()), replaces
  // the flat (and permanently inert -- see v5_tuning_notes.md item 18)
  // tipPlayDelayThreshold above. Progress-relative rather than turn-number
  // based, since turn counts vary a lot by player count -- see
  // v6_tuning_notes.md. ---
  tipPlayThresholdStart: number; // required score to auto-play early in the game (progress fraction 0)
  tipPlayThresholdFloor: number; // required score late in the game (<= Start)
  tipPlayThresholdDecayWindow: number; // 0..1: progress fraction over which Start decays to Floor

  // --- opponent-aware tip scoring (valuation.ts tipScoreForBot()) ---
  // Weight on opponents' PUBLICLY KNOWN holdings (state.publicStockKnowledge,
  // never ground-truth hands) in a market-movement card's score: a card that
  // barely touches the bot's own holdings but would hurt a rival who's loaded
  // up on that color is worth more than pure self-P&L says. 0 = old
  // self-only behavior.
  opponentImpactWeight: number;
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
  { key: 'hotTipThreshold', min: 0, max: 4, int: true },

  // min is nudged just below 0 (rather than 0) so the "no effect" default of
  // exactly 0 is strictly interior to the range, not sitting on the logit
  // encoding's undefined boundary -- see the ParamSpec doc comment above.
  { key: 'loanWillingness', min: -0.001, max: 1, int: false },
  { key: 'endgameDiscountStrength', min: -0.001, max: 1, int: false },

  { key: 'tipPlayThresholdStart', min: 4, max: 16, int: false },
  { key: 'tipPlayThresholdFloor', min: 2, max: 12, int: false },
  // max is nudged just above 1 (rather than 1) so the default of exactly 1
  // (decay over the whole game) is strictly interior -- see the ParamSpec doc
  // comment above.
  { key: 'tipPlayThresholdDecayWindow', min: 0.05, max: 1.001, int: false },

  // min is -0.1, not the usual -0.001 nudge (see loanWillingness/
  // endgameDiscountStrength above): with a default of exactly 0 and a -0.001
  // min, the logit encoding of 0 sits at ~-6.9, deep in the sigmoid's
  // saturated tail -- a full ES mutation step there moves the decoded value
  // by ~0.0002, so the search can't realistically climb out of that corner
  // within a normal generation budget even when a much larger value performs
  // better (confirmed: forcing 0.3 directly beats production by $0.67-4.11/
  // game, but 3 separate ES runs converged back to ~0). -0.1 puts the
  // default at logit ≈ -2.3, a non-saturated point with real mutation
  // headroom in both directions -- see v6_tuning_notes.md.
  { key: 'opponentImpactWeight', min: -0.1, max: 1, int: false }
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
    hotTipThreshold: 1,

    loanWillingness: 0,
    endgameDiscountStrength: 0,

    tipPlayThresholdStart: 10,
    tipPlayThresholdFloor: 7,
    tipPlayThresholdDecayWindow: 1,

    opponentImpactWeight: 0
  };
}

const PARAM_COUNT = PARAM_SPECS.length;

const sigmoid = (u: number): number => 1 / (1 + Math.exp(-u));
const logit = (p: number): number => Math.log(p / (1 - p));

/**
 * Encode params → unbounded ES vector (per-param logit of its [min,max]
 * fraction). Throws on a missing/non-finite field instead of silently
 * producing NaN -- a param added to BotParams/PARAM_SPECS after a saved
 * bot_params.json was written (e.g. loaded via `--resume`) would otherwise
 * decode `undefined - min` to NaN, which then poisons every downstream ES
 * generation (mutations on NaN stay NaN) and decodes back to `null` in the
 * saved output, all silently -- this happened once already, corrupting a
 * full 200-generation training run. Callers migrating an old saved file
 * should spread it onto `defaultBotParams()` first: `{ ...defaultBotParams(),
 * ...JSON.parse(old) }`.
 */
export function encodeParams(p: BotParams): Float64Array {
  const v = new Float64Array(PARAM_COUNT);
  PARAM_SPECS.forEach((s, i) => {
    const frac = (p[s.key] - s.min) / (s.max - s.min);
    if (!Number.isFinite(frac)) {
      throw new Error(
        `encodeParams: non-finite value for "${s.key}" (got ${p[s.key]}) -- likely a stale saved ` +
          `BotParams file missing a field added since it was written; merge onto defaultBotParams() first`
      );
    }
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
