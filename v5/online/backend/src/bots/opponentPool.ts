import { createBotProfile } from './profile.js';
import { makeProductionBotProfile, type BotParams } from './botParams.js';
import type { ProfileBuilder } from './evaluate.js';
import type { ValueNetWeights } from './valueNet.js';

/**
 * A small, FIXED, deliberately diverse set of opponent archetypes for
 * training/validation, so a candidate can't win purely by specializing
 * against a homogeneous self-play population (self-play equilibria are
 * non-transitive -- see v5_tuning_notes.md item 18's "self-play exploit"
 * postmortem). Every future retrain should validate against this pool, not
 * just against itself/a frozen prior round/raw defaults.
 */

/** Structurally different from the trained-net bots: no value net at all, wider randomized personality ranges. */
export const legacyHeuristicProfileBuilder: ProfileBuilder = rng => createBotProfile(rng);

/**
 * Pushes the *existing* goal-valuation knobs to their validated extreme
 * (all within PARAM_SPECS bounds -- no new parameters): bids right up to its
 * perceived value (winnerMargin=0), and values goal-completing stock combos
 * far more aggressively (goalBumpDivisorOffset at its min, goalGapCutoff at
 * its max, the reward-conversion multipliers near their max). This directly
 * represents the human playstyle that exposed the exploit in the logged
 * 2026-09-27 game: bidding to win and prioritizing goal combos over folding
 * at a modest price.
 */
export const AGGRESSIVE_PARAMS_OVERRIDE: Partial<BotParams> = {
  winnerMargin: 0,
  goalBumpDivisorOffset: 1,
  goalGapCutoff: 4,
  rewardAdjustMult: 4,
  rewardDrawTipsMult: 5,
  rewardPeekMult: 4,
  rewardFlatValue: 6
};

export function makeAggressiveProfileBuilder(net: ValueNetWeights, baseParams: BotParams): ProfileBuilder {
  const aggressiveParams: BotParams = { ...baseParams, ...AGGRESSIVE_PARAMS_OVERRIDE };
  return rng => makeProductionBotProfile(rng, net, aggressiveParams);
}

/** The pool used by validateVsPool.ts and the pool-aware training scripts. */
export function buildOpponentPool(net: ValueNetWeights, baseParams: BotParams): ProfileBuilder[] {
  return [legacyHeuristicProfileBuilder, makeAggressiveProfileBuilder(net, baseParams)];
}
