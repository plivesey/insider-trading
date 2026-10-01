import type { Color, GameState, GoalCard, InsiderTipCard, PlayerId, StockCard } from '@insider-trading/shared';
import { COLORS, MAX_LOANS } from '@insider-trading/shared';
import type { BotProfile } from './profile.js';
import {
  bestGoalBump,
  effectivePrices,
  goalBumpPerStock,
  rewardCashEquivalent,
  visibleCount
} from './valuation.js';

/**
 * Fixed length of the stock-valuation feature vector. Frozen at 40 for a long
 * time -- see v5_tuning_notes.md / online/V5_MIGRATION_PLAN.md Phase 8 for why
 * a full retrain was out of scope back then. Grown to 45 on 2026-09-27 (item
 * 18) to add `progressRemaining` (x[40]) and `colorRisk` (x[41..44]) -- see
 * `scripts/growNet.ts` for the one-time migration that pads an existing
 * champion's weight matrix with zero-initialized columns for the new slots
 * before retraining, so old checkpoints aren't silently invalidated.
 */
export const STOCK_FEATURE_LEN = 45;

const COLOR_INDEX: Record<Color, number> = { Blue: 0, Orange: 1, Green: 2, Purple: 3 };

/**
 * Fixed composition of the 28-card market-movement half of the Event Deck
 * (see CLAUDE.md, tests/insider_tip_cards.test.js) -- used only by
 * `colorRiskStillOut` below to know how much of each card type existed in
 * the first place. Crash and surge are uniform per color (a flat count);
 * slump and shift are each one specific, directional color-pair card, so
 * each gets its own definition instead of a count.
 */
const CRASH_COUNT_PER_COLOR = 3;
const SURGE_COUNT_PER_COLOR = 1;
const PAIR_TIP_DEFS: Array<{ a: Color; aDelta: number; b: Color; bDelta: number }> = [
  // slump: -2/-2, all 6 color pairs
  { a: 'Blue', aDelta: -2, b: 'Orange', bDelta: -2 },
  { a: 'Orange', aDelta: -2, b: 'Purple', bDelta: -2 },
  { a: 'Purple', aDelta: -2, b: 'Green', bDelta: -2 },
  { a: 'Green', aDelta: -2, b: 'Blue', bDelta: -2 },
  { a: 'Blue', aDelta: -2, b: 'Purple', bDelta: -2 },
  { a: 'Orange', aDelta: -2, b: 'Green', bDelta: -2 },
  // shift: +2 one color / -2 another, all 6 color pairs, each a fixed direction
  { a: 'Blue', aDelta: 2, b: 'Orange', bDelta: -2 },
  { a: 'Orange', aDelta: 2, b: 'Green', bDelta: -2 },
  { a: 'Green', aDelta: 2, b: 'Purple', bDelta: -2 },
  { a: 'Purple', aDelta: 2, b: 'Blue', bDelta: -2 },
  { a: 'Blue', aDelta: 2, b: 'Green', bDelta: -2 },
  { a: 'Orange', aDelta: 2, b: 'Purple', bDelta: -2 }
];

function pairDefMatches(card: InsiderTipCard, def: { a: Color; aDelta: number; b: Color; bDelta: number }): boolean {
  return card.effect.type === 'adjust' && card.effect.changes[def.a] === def.aDelta && card.effect.changes[def.b] === def.bDelta;
}

/**
 * Public-information-only estimate of the signed price drift for `color`
 * still "out there" (in the undrawn event deck, or in another player's
 * hand): never reads any other player's actual hand contents, only
 * `state.resolvedEventCards` (public) and the bot's own hand, weighed
 * against the fixed, publicly-known deck composition above. Deliberately
 * scoped this way per the design decision in v5_tuning_notes.md item 18 --
 * bots should reason about hidden-card risk the way a sharp human could
 * (from what's already been revealed and the known deck composition), not
 * by cheating and reading opponents' hands directly.
 *
 * A crash card's impact uses the *current* price as a proxy (ignores that
 * more than one remaining crash for the same color would compound); fine for
 * a net input feature the trained weights will scale appropriately, not
 * meant to be a precise simulator.
 */
function colorRiskStillOut(state: GameState, color: Color, botId: PlayerId): number {
  const bot = state.players.find(p => p.playerId === botId);
  const ownHand = bot ? bot.hand.filter((c): c is InsiderTipCard => c.category === 'insider_tip') : [];
  const seen = [...state.resolvedEventCards, ...ownHand];

  let risk = 0;

  const resolvedCrash = seen.filter(c => c.type === 'crash' && c.effect.type === 'halve' && c.effect.color === color).length;
  const remainingCrash = Math.max(0, CRASH_COUNT_PER_COLOR - resolvedCrash);
  if (remainingCrash > 0) {
    const price = state.stockPrices[color];
    risk += remainingCrash * (Math.floor(price / 2) - price); // negative
  }

  const resolvedSurge = seen.filter(
    c => c.type === 'surge' && c.effect.type === 'adjust' && c.effect.changes[color] !== undefined
  ).length;
  risk += Math.max(0, SURGE_COUNT_PER_COLOR - resolvedSurge) * 4;

  for (const def of PAIR_TIP_DEFS) {
    if (def.a !== color && def.b !== color) continue;
    if (seen.some(c => pairDefMatches(c, def))) continue; // this specific card is already accounted for
    risk += def.a === color ? def.aDelta : def.bDelta;
  }

  return risk;
}

/** Goals relevant to this bot: the public row plus its own private goals in hand. */
function relevantGoalsForBot(state: GameState, botId: PlayerId): GoalCard[] {
  const bot = state.players.find(p => p.playerId === botId);
  const privateGoals = bot ? bot.hand.filter((c): c is GoalCard => c.category === 'goal') : [];
  return [...state.goalRow, ...privateGoals];
}

/**
 * Count, across goals (public + this bot's private) the bot is within 2 cards
 * of completing, how many still require `color`. A cheap "this color unlocks
 * a near-term goal" signal.
 */
function nearGoalsNeedingColor(state: GameState, color: Color, botId: PlayerId): number {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return 0;
  const owned: Partial<Record<Color, number>> = {};
  let wild = 0;
  for (const c of bot.hand) {
    if (c.category !== 'stock') continue;
    if (c.color === 'Wild') wild++;
    else owned[c.color] = (owned[c.color] ?? 0) + 1;
  }
  let count = 0;
  for (const g of relevantGoalsForBot(state, botId)) {
    const req = g.goal.parsed.requirements;
    if ((req[color] ?? 0) <= 0) continue;
    let gap = 0;
    for (const c of COLORS) {
      const r = req[c] ?? 0;
      const o = owned[c] ?? 0;
      if (r > o) gap += r - o;
    }
    gap = Math.max(0, gap - wild);
    if (gap <= 2) count++;
  }
  return count;
}

/**
 * Encode a stock valuation query into a fixed-length, normalized feature vector.
 * Single source of truth for both training and runtime inference.
 *
 * `color` is the colored stock being valued; pass `isWild=true` with `color=null`
 * for a Wild Share (color-specific slots are zeroed and the net leans on the
 * portfolio/goal features). Feature order is frozen — see STOCK_FEATURE_LEN.
 */
export function encodeColorFeatures(
  state: GameState,
  color: Color | null,
  isWild: boolean,
  botId: PlayerId,
  profile: BotProfile
): Float64Array {
  const x = new Float64Array(STOCK_FEATURE_LEN);
  const numPlayers = state.players.length;
  const bot = state.players.find(p => p.playerId === botId);
  const prices = state.stockPrices;
  const eff = effectivePrices(state, profile.knownPeekedTips);

  // Owned counts per color + wild.
  const owned: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
  let wildOwned = 0;
  let coloredOwned = 0;
  if (bot) {
    for (const c of bot.hand) {
      if (c.category !== 'stock') continue;
      if (c.color === 'Wild') wildOwned++;
      else {
        owned[c.color]++;
        coloredOwned++;
      }
    }
  }

  const tipDenom = Math.max(1, 2 * numPlayers);

  x[0] = 1; // bias
  if (color && !isWild) {
    x[1 + COLOR_INDEX[color]] = 1;
    x[6] = prices[color] / 10;
    x[7] = eff[color] / 10;
    x[8] = (eff[color] - prices[color]) / 10;
    x[9] = visibleCount(state, color, botId) / 4;
    x[10] = goalBumpPerStock(state, color, botId, profile.params) / 4;
    x[34] = nearGoalsNeedingColor(state, color, botId) / 4;
  }
  x[5] = isWild ? 1 : 0;

  x[11] = prices.Blue / 10;
  x[12] = prices.Orange / 10;
  x[13] = prices.Green / 10;
  x[14] = prices.Purple / 10;
  x[15] = eff.Blue / 10;
  x[16] = eff.Orange / 10;
  x[17] = eff.Green / 10;
  x[18] = eff.Purple / 10;

  x[19] = owned.Blue / 4;
  x[20] = owned.Orange / 4;
  x[21] = owned.Green / 4;
  x[22] = owned.Purple / 4;
  x[23] = wildOwned / 4;
  x[24] = bestGoalBump(state, botId, profile.params) / 4;

  // Starting cash is $25 in V5 (was $30 in V4) and the loan cap is
  // MAX_LOANS=2 (was 3) -- both denominators below now match the current
  // rule constants, so these slots use their full [0,1] range again instead
  // of being permanently compressed under the old game's numbers.
  x[25] = (bot ? bot.cash : 0) / 25;
  x[26] = (bot ? bot.loans : 0) / MAX_LOANS;
  x[27] = state.eventDeck.length / tipDenom;
  x[28] = state.resolvedEventCards.length / tipDenom;
  x[29] = state.market.length / 5;
  x[30] = state.goalRow.length / (numPlayers + 2);
  x[31] = state.turnNumber / 30;
  x[32] = numPlayers / 6;
  x[33] = coloredOwned / 8;

  x[35] = profile.stockOffset / 2;
  x[36] = profile.wildShareValue / 6;
  x[37] = profile.knownPeekedTips.length / 4;

  // Sharp goal signals: how much would acquiring THIS card (one of `color`, or a
  // Wild) help finish a goal (public or this bot's own private)? x[38] spikes
  // for a *finishing* card (gap 1→0), scaled by the goal's reward; x[39]
  // rewards advancing a big, near goal. The diffuse goalBump features
  // (x10/x24/x34) never expressed "this completes a goal now" — these do, so
  // the net can learn to chase finishing cards.
  {
    let bestCompletion = 0;
    let bestAdvance = 0;
    for (const g of relevantGoalsForBot(state, botId)) {
      const req = g.goal.parsed.requirements;
      let rawGap = 0;
      for (const col of COLORS) {
        const r = req[col] ?? 0;
        if (r > owned[col]) rawGap += r - owned[col];
      }
      const gapNow = Math.max(0, rawGap - wildOwned);
      if (gapNow === 0) continue; // already claimable — nothing to advance here
      // Does acquiring this one card reduce the gap?
      const reduces = isWild ? true : color ? (req[color] ?? 0) > owned[color] : false;
      if (!reduces) continue;
      const gapAfter = gapNow - 1;
      const reward = rewardCashEquivalent(g.reward.parsed, numPlayers, profile.params);
      if (gapAfter === 0 && reward > bestCompletion) bestCompletion = reward;
      const adv = reward / (gapAfter + 1);
      if (adv > bestAdvance) bestAdvance = adv;
    }
    // Normalize by 12 (not 8) so the biggest goals ($9/$11 rewards) don't clip
    // at 1.0 — the net should see "this is a HUGE goal" distinctly from a $5 one.
    x[38] = Math.min(1, bestCompletion / 12);
    x[39] = Math.min(1, bestAdvance / 12);
  }

  // Fraction of the game likely still remaining (1 = just started, 0 = the
  // progress tracker is about to hit its threshold) -- replaces the poorly-
  // correlated raw turnNumber (x[31]) as an endgame-awareness signal, since
  // real game length varies ~8-77 turns (see v5_game_length_log.md) while the
  // progress tracker's distance to its own threshold is the actual trigger.
  x[40] = Math.max(0, state.progressThreshold - state.progressTracker) / state.progressThreshold;

  // Public-information-only signed price-drift risk still "out there" for
  // each color, from market-movement cards not yet resolved and not in this
  // bot's own hand (see colorRiskStillOut above).
  x[41] = colorRiskStillOut(state, 'Blue', botId) / 10;
  x[42] = colorRiskStillOut(state, 'Orange', botId) / 10;
  x[43] = colorRiskStillOut(state, 'Green', botId) / 10;
  x[44] = colorRiskStillOut(state, 'Purple', botId) / 10;

  return x;
}

/** Encode a specific stock card (routes Wild Shares to the wild path). */
export function encodeStockCardFeatures(
  state: GameState,
  card: StockCard,
  botId: PlayerId,
  profile: BotProfile
): Float64Array {
  if (card.color === 'Wild') {
    return encodeColorFeatures(state, null, true, botId, profile);
  }
  return encodeColorFeatures(state, card.color, false, botId, profile);
}
