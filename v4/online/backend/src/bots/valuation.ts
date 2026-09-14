import type {
  ActionCard,
  Color,
  GameState,
  GoalCard,
  GoalReward,
  InsiderTipCard,
  PlayerId,
  StockCard,
  StockType
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import type { BotProfile } from './profile.js';
import { valueColor } from './valueNet.js';
import { defaultBotParams, type BotParams } from './botParams.js';

/** Shared default params, so callers without a profile (and the parity path) match today. */
const DEFAULTS = defaultBotParams();

/**
 * Apply known peeked tips (in their deck order) to current stockPrices to
 * yield the bot's perceived base price per color. Halve floors at 0; adjusts
 * floor at 0 too.
 */
export function effectivePrices(
  state: GameState,
  knownPeekedTips: InsiderTipCard[]
): Record<Color, number> {
  const out: Record<Color, number> = { ...state.stockPrices };
  // Tip resolution order is the order in insiderTipDeck. Sort known peeks by
  // their index in the deck so we apply them in the order they'll fire.
  const indexed = knownPeekedTips
    .map(t => ({ tip: t, idx: state.insiderTipDeck.findIndex(d => d.uid === t.uid) }))
    .filter(e => e.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  for (const { tip } of indexed) {
    if (tip.effect.type === 'halve') {
      out[tip.effect.color] = Math.max(0, Math.floor(out[tip.effect.color] / 2));
    } else {
      for (const [c, delta] of Object.entries(tip.effect.changes) as [Color, number][]) {
        out[c] = Math.max(0, out[c] + delta);
      }
    }
  }
  return out;
}

/** Count colored stocks of `color` visible to the bot: bot's own hand + market. */
export function visibleCount(state: GameState, color: Color, botId: PlayerId): number {
  let n = 0;
  const bot = state.players.find(p => p.playerId === botId);
  if (bot) {
    for (const c of bot.hand) {
      if (c.category === 'stock' && c.color === color) n++;
    }
  }
  for (const c of state.market) {
    if (c.category === 'stock' && c.color === color) n++;
  }
  return n;
}

/** Cash-equivalent estimate of a goal reward — drives per-stock goal bumps. */
export function rewardCashEquivalent(
  reward: GoalReward,
  numPlayers: number,
  params: BotParams = DEFAULTS
): number {
  switch (reward.type) {
    case 'gain_cash':
      return reward.amount;
    case 'end_game_cash':
      return reward.amount;
    case 'adjust_stock':
      return reward.amount * params.rewardAdjustMult;
    case 'adjust_all_stocks':
      return reward.amount * params.rewardAdjustMult;
    case 'adjust_two_stocks':
      return reward.up * params.rewardAdjustMult;
    case 'set_stock':
      // Set any one stock to $amount: pump your cheapest toward it (or deny an
      // opponent). Roughly half the target value in practice.
      return Math.max(params.rewardFlatValue, reward.amount / 2);
    case 'peek_tips':
      return reward.count * params.rewardPeekMult;
    case 'peek_tips_bottom':
      // Peek plus the option to bury one bad tip — a bit better than a pure peek.
      return reward.count * params.rewardPeekMult + 1;
    case 'draw_tips':
      // Drawing tips into hand (playable later) is worth more than a peek.
      return reward.count * params.rewardDrawTipsMult;
    case 'steal_from_all':
      return reward.amount * Math.max(1, numPlayers - 1);
    case 'sell_bonus_batch':
      return reward.bonus * params.rewardAdjustMult;
    case 'swap_with_market':
      // Trade your worst card for the best face-up market card — typically a
      // strong stock; worth well more than the generic flat value.
      return 6;
    case 'draw_and_choose':
      // Draw 3 from the deck, keep the best — ~a good stock's worth.
      return 6;
    case 'draw_deck_tip':
      // A tip in hand (playable later) plus flat cash.
      return reward.cash + params.rewardDrawTipsMult;
  }
}

/**
 * For one color, sum floor(rewardCashEquivalent / (totalRequirements + 3))
 * over every active goal that requires this color AND that the bot is no more
 * than 2 cards away from completing. Goals further away are ignored.
 *
 * Why the filter: completing a 4-card goal from zero owned stocks requires 4
 * future auction wins — the bump should not influence today's bidding for
 * something that may never happen.
 *
 * Why total+3: conservative discount for the cost/risk of actually completing
 * the goal AND for the chance another player claims it first.
 */
export function goalBumpPerStock(
  state: GameState,
  color: Color,
  botId: PlayerId,
  params: BotParams = DEFAULTS
): number {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return 0;
  const ownedNonWild: Partial<Record<Color, number>> = {};
  let wildCount = 0;
  for (const c of bot.hand) {
    if (c.category !== 'stock') continue;
    if (c.color === 'Wild') wildCount++;
    else ownedNonWild[c.color] = (ownedNonWild[c.color] ?? 0) + 1;
  }
  let bump = 0;
  const n = state.players.length;
  for (const g of state.activeGoals) {
    const req = g.goal.parsed.requirements;
    const need = req[color] ?? 0;
    if (need <= 0) continue;
    const total = (Object.values(req) as number[]).reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    // Cards still needed = sum over colors of max(0, req - owned), then we can
    // also cover gaps with Wild Shares the bot already holds.
    let gap = 0;
    for (const c of COLORS) {
      const r = req[c] ?? 0;
      const o = ownedNonWild[c] ?? 0;
      if (r > o) gap += r - o;
    }
    gap = Math.max(0, gap - wildCount);
    if (gap > params.goalGapCutoff) continue;
    const cash = rewardCashEquivalent(g.reward.parsed, n, params);
    bump += Math.floor(cash / (total + params.goalBumpDivisorOffset));
  }
  return bump;
}

/** Best (max across colors) per-stock goal bump — used as the value of a Wild Share. */
export function bestGoalBump(
  state: GameState,
  botId: PlayerId,
  params: BotParams = DEFAULTS
): number {
  let best = 0;
  for (const c of COLORS) {
    const b = goalBumpPerStock(state, c, botId, params);
    if (b > best) best = b;
  }
  return best;
}

export function perceivedStockSpecialBump(
  stockType: StockType,
  params: BotParams = DEFAULTS
): number {
  switch (stockType) {
    case 'extra_up':
      return params.bumpExtraUp;
    case 'other_up':
      return params.bumpOtherUp;
    case 'peek_buy':
      return params.bumpPeekBuy;
    case 'peek_sell':
      return params.bumpPeekSell;
    default:
      return 0;
  }
}

/**
 * Perceived value of a single colored stock of `color`:
 * effectivePrice + visibleCount + goalBumpPerStock + stockOffset.
 * Floored at 0.
 */
export function perceivedStockValue(
  state: GameState,
  profile: BotProfile,
  color: Color,
  botId: PlayerId
): number {
  // Trained net (if any) replaces the heuristic base value for a colored stock.
  // The special-ability bump is still added by perceivedStockCardValue, and is
  // NOT a net feature, so there is no double counting. Floor to an integer: the
  // whole bidding pipeline deals in whole dollars (a $10.7 value ⇒ max bid $10).
  if (profile.valueNet) {
    return Math.floor(valueColor(profile.valueNet, state, color, false, botId, profile));
  }
  const prices = effectivePrices(state, profile.knownPeekedTips);
  const base = prices[color];
  const visible = visibleCount(state, color, botId);
  const goal = goalBumpPerStock(state, color, botId, profile.params);
  return Math.max(0, base + visible + goal + profile.stockOffset);
}

/**
 * Perceived value of a Wild Share. Wild cannot be sold and is only useful for
 * substituting in goal claims — bestGoalBump under-rates them when no
 * near-term goal needs filling. Use the bot's fixed `wildShareValue` (2–4)
 * as the floor, taking the bigger of that and the actual goal bump in case
 * the bump is high.
 */
export function perceivedWildShareValue(
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): number {
  if (profile.valueNet) {
    return Math.floor(valueColor(profile.valueNet, state, null, true, botId, profile));
  }
  return Math.max(profile.wildShareValue, bestGoalBump(state, botId, profile.params));
}

/**
 * Perceived value of a specific stock card (including special-ability bump).
 * Wild Shares route through `perceivedWildShareValue`.
 */
export function perceivedStockCardValue(
  state: GameState,
  profile: BotProfile,
  card: StockCard,
  botId: PlayerId
): number {
  if (card.color === 'Wild') return perceivedWildShareValue(state, profile, botId);
  return (
    perceivedStockValue(state, profile, card.color, botId) +
    perceivedStockSpecialBump(card.type, profile.params)
  );
}

// ---- Action card valuation ----------------------------------------------------

/**
 * 2nd-highest perceivedValue among stocks in state.market. Falls back to the
 * highest if only one stock, or $3 if no stocks. Used by Tipster's Choice and
 * Hostile Takeover.
 */
function secondHighestMarketStock(
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): number {
  const values: number[] = [];
  for (const c of state.market) {
    if (c.category !== 'stock') continue;
    values.push(perceivedStockCardValue(state, profile, c as StockCard, botId));
  }
  if (values.length === 0) return profile.params.secondHighestFallback;
  values.sort((a, b) => b - a);
  return values[1] ?? values[0];
}

function maxOwnedStockPrice(state: GameState, botId: PlayerId): number {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return 0;
  let max = 0;
  for (const c of bot.hand) {
    if (c.category !== 'stock' || c.color === 'Wild') continue;
    const p = state.stockPrices[c.color];
    if (p > max) max = p;
  }
  return max;
}

function maxColorCount(state: GameState, botId: PlayerId): number {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return 0;
  const counts: Partial<Record<Color, number>> = {};
  for (const c of bot.hand) {
    if (c.category === 'stock' && c.color !== 'Wild') {
      counts[c.color] = (counts[c.color] ?? 0) + 1;
    }
  }
  let max = 0;
  for (const c of COLORS) {
    const v = counts[c] ?? 0;
    if (v > max) max = v;
  }
  return max;
}

function ownedColoredStockCount(state: GameState, botId: PlayerId): number {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return 0;
  return bot.hand.filter(c => c.category === 'stock' && c.color !== 'Wild').length;
}

function ownsAnyColoredStock(state: GameState, botId: PlayerId): boolean {
  return ownedColoredStockCount(state, botId) > 0;
}

/** Pre-offset value of an action card. Caller adds profile.actionOffset. */
function actionCardBaseValue(
  card: ActionCard,
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): number {
  const p = profile.params;
  switch (card.effect.type) {
    case 'draw_and_choose':
      // Tipster's Choice: 2nd-highest market stock proxy.
      return secondHighestMarketStock(state, profile, botId);
    case 'take_face_up': {
      // Corner the Market: max perceivedValue of any market card. We must NOT
      // recurse into another take_face_up card (mutual recursion); fall back
      // to a flat estimate for those.
      let best = 0;
      for (const c of state.market) {
        let v: number;
        if (c.category === 'stock') {
          v = perceivedStockCardValue(state, profile, c as StockCard, botId);
        } else if ((c as ActionCard).effect.type === 'take_face_up') {
          v = p.takeFaceUpBase;
        } else {
          v = actionCardBaseValue(c as ActionCard, state, profile, botId);
        }
        if (v > best) best = v;
      }
      return Math.max(p.takeFaceUpBase, best);
    }
    case 'sell_double':
      // Pump and Dump: max(floor, max stockPrice of owned colors).
      return Math.max(p.sellDoubleFloor, maxOwnedStockPrice(state, botId));
    case 'sell_same_bonus':
      // Liquidation: bonus dollars ≈ count of the most-owned color (the +$1
      // per stock you'd realize dumping that whole color in one free action).
      return Math.max(p.sellSameBonusFloor, maxColorCount(state, botId));
    case 'adjust_stock':
      // The Squeeze: min(cap, 2 × max-count-of-one-color owned).
      return Math.min(p.adjustStockCap, 2 * maxColorCount(state, botId));
    case 'flip_and_adjust':
      return p.flipAndAdjustFlat; // Wild Speculation flat.
    case 'tie_breaker':
      return p.tieBreakerFlat; // Preferred Bidder flat.
    case 'steal_stock':
      // Hostile Takeover: 2nd-highest market stock proxy + bonus.
      return secondHighestMarketStock(state, profile, botId) + p.stealStockBonus;
    case 'adjust_all_stocks':
      // Rumor Mill: max(floor, count of bot's colored stocks).
      return Math.max(p.adjustAllFloor, ownedColoredStockCount(state, botId));
    case 'draw_tip':
      // Insider Source: knowing the next tip lets the bot react; valuable but
      // not dramatically so when the deck is full. Worth less if deck is small
      // (game ends sooner) but still useful.
      return state.insiderTipDeck.length > 0 ? p.drawTipValue : 0;
    case 'auction_unused_tip':
      // Black Market never reaches a player's hand (it triggers from market);
      // no perceived hand-value. Bid valuation for the SIDE-auction happens
      // separately in decide.ts when the bid prompt arrives.
      return 0;
    case 'buy_from_market':
      // Market Order is never auctioned; the bot plays it via a dedicated
      // strategy path (see chooseBuyTarget in decide.ts), not by value.
      return 0;
    case 'peek_top_tip':
      // Hot Tip is a starting hand card, never auctioned; no perceived
      // hand-value here (played via the dedicated hot-tip path in decide.ts).
      return 0;
  }
}

/**
 * Perceived value of an action card (effective auction ceiling), including the
 * bot's actionOffset. Floored at 0.
 */
export function perceivedActionCardValue(
  card: ActionCard,
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): number {
  return Math.max(0, actionCardBaseValue(card, state, profile, botId) + profile.actionOffset);
}

/** Perceived value of any market card (stock or action). Floor at 0. */
export function perceivedCardValue(
  card: StockCard | ActionCard,
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): number {
  if (card.category === 'stock') return perceivedStockCardValue(state, profile, card, botId);
  return perceivedActionCardValue(card, state, profile, botId);
}

// ---- Helpers for downstream modules ------------------------------------------

export { ownsAnyColoredStock, maxOwnedStockPrice, maxColorCount, ownedColoredStockCount };

/** Which color the bot owns the most of. Returns null if it owns no colored stocks. */
export function bestOwnedColor(state: GameState, botId: PlayerId): Color | null {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return null;
  const counts: Record<Color, number> = { Blue: 0, Orange: 0, Yellow: 0, Purple: 0 };
  for (const c of bot.hand) {
    if (c.category === 'stock' && c.color !== 'Wild') counts[c.color]++;
  }
  let best: Color | null = null;
  let bestN = 0;
  for (const c of COLORS) {
    if (counts[c] > bestN) {
      best = c;
      bestN = counts[c];
    }
  }
  return best;
}

/**
 * For Inside Track / Wiretap reorder decisions: signed score of a tip from the
 * bot's perspective (Σ over colors of delta × ownedCount(color)). Higher = better.
 */
export function tipScoreForBot(state: GameState, tip: InsiderTipCard, botId: PlayerId): number {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return 0;
  const owned: Record<Color, number> = { Blue: 0, Orange: 0, Yellow: 0, Purple: 0 };
  for (const c of bot.hand) {
    if (c.category === 'stock' && c.color !== 'Wild') owned[c.color]++;
  }
  if (tip.effect.type === 'halve') {
    const c = tip.effect.color;
    const halved = Math.floor(state.stockPrices[c] / 2);
    const delta = halved - state.stockPrices[c]; // negative
    return delta * owned[c];
  }
  let total = 0;
  for (const [c, d] of Object.entries(tip.effect.changes) as [Color, number][]) {
    total += d * owned[c];
  }
  return total;
}
