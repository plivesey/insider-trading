import type { Color, GameState, PlayerId, StockCard } from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import type { BotProfile } from './profile.js';
import {
  bestGoalBump,
  effectivePrices,
  goalBumpPerStock,
  rewardCashEquivalent,
  visibleCount
} from './valuation.js';

/**
 * Fixed length of the stock-valuation feature vector. Frozen: changing it
 * invalidates every trained checkpoint, so add new signals into the reserved
 * tail slots rather than resizing.
 */
export const STOCK_FEATURE_LEN = 40;

const COLOR_INDEX: Record<Color, number> = { Blue: 0, Orange: 1, Yellow: 2, Purple: 3 };

/**
 * Count, across active goals the bot is within 2 cards of completing, how many
 * still require `color`. A cheap "this color unlocks a near-term goal" signal.
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
  for (const g of state.activeGoals) {
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
  const owned: Record<Color, number> = { Blue: 0, Orange: 0, Yellow: 0, Purple: 0 };
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
  x[13] = prices.Yellow / 10;
  x[14] = prices.Purple / 10;
  x[15] = eff.Blue / 10;
  x[16] = eff.Orange / 10;
  x[17] = eff.Yellow / 10;
  x[18] = eff.Purple / 10;

  x[19] = owned.Blue / 4;
  x[20] = owned.Orange / 4;
  x[21] = owned.Yellow / 4;
  x[22] = owned.Purple / 4;
  x[23] = wildOwned / 4;
  x[24] = bestGoalBump(state, botId, profile.params) / 4;

  x[25] = (bot ? bot.cash : 0) / 30;
  x[26] = (bot ? bot.loans : 0) / 3;
  x[27] = state.insiderTipDeck.length / tipDenom;
  x[28] = state.resolvedInsiderTips.length / tipDenom;
  x[29] = state.market.length / 5;
  x[30] = state.activeGoals.length / (numPlayers + 2);
  x[31] = state.turnNumber / 30;
  x[32] = numPlayers / 6;
  x[33] = coloredOwned / 8;

  x[35] = profile.stockOffset / 2;
  x[36] = profile.wildShareValue / 6;
  x[37] = profile.knownPeekedTips.length / 4;

  // Sharp goal signals: how much would acquiring THIS card (one of `color`, or a
  // Wild) help finish an active goal? x[38] spikes for a *finishing* card (gap
  // 1→0), scaled by the goal's reward; x[39] rewards advancing a big, near goal.
  // The diffuse goalBump features (x10/x24/x34) never expressed "this completes a
  // goal now" — these do, so the net can learn to chase finishing cards.
  {
    let bestCompletion = 0;
    let bestAdvance = 0;
    for (const g of state.activeGoals) {
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
