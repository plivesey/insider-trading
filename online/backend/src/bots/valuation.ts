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
export function rewardCashEquivalent(reward: GoalReward, numPlayers: number): number {
  switch (reward.type) {
    case 'gain_cash':
      return reward.amount;
    case 'end_game_cash':
      return reward.amount;
    case 'adjust_stock':
      return reward.amount * 2;
    case 'adjust_all_stocks':
      return reward.amount * 2;
    case 'adjust_two_stocks':
      return reward.up * 2;
    case 'set_stock':
      return 3;
    case 'peek_tips':
      return reward.count * 2;
    case 'steal_from_all':
      return reward.amount * Math.max(1, numPlayers - 1);
    case 'sell_bonus_batch':
      return reward.bonus * 2;
    case 'swap_with_market':
      return 3;
    case 'draw_and_choose':
      return 3;
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
  botId: PlayerId
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
    if (gap > 2) continue;
    const cash = rewardCashEquivalent(g.reward.parsed, n);
    bump += Math.floor(cash / (total + 3));
  }
  return bump;
}

/** Best (max across colors) per-stock goal bump — used as the value of a Wild Share. */
export function bestGoalBump(state: GameState, botId: PlayerId): number {
  let best = 0;
  for (const c of COLORS) {
    const b = goalBumpPerStock(state, c, botId);
    if (b > best) best = b;
  }
  return best;
}

const SPECIAL_BUMP: Record<StockType, number> = {
  blank: 0,
  extra_up: 2,
  other_up: 2,
  peek_buy: 1,
  peek_sell: 1,
  wild: 0
};

export function perceivedStockSpecialBump(stockType: StockType): number {
  return SPECIAL_BUMP[stockType] ?? 0;
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
  const prices = effectivePrices(state, profile.knownPeekedTips);
  const base = prices[color];
  const visible = visibleCount(state, color, botId);
  const goal = goalBumpPerStock(state, color, botId);
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
  return Math.max(profile.wildShareValue, bestGoalBump(state, botId));
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
  return perceivedStockValue(state, profile, card.color, botId) + perceivedStockSpecialBump(card.type);
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
  if (values.length === 0) return 3;
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
  switch (card.effect.type) {
    case 'draw_and_choose':
      // Tipster's Choice: 2nd-highest market stock proxy.
      return secondHighestMarketStock(state, profile, botId);
    case 'take_face_up': {
      // Corner the Market: max perceivedValue of any market card. We must NOT
      // recurse into another take_face_up card (mutual recursion); fall back
      // to a flat $4 estimate for those.
      let best = 0;
      for (const c of state.market) {
        let v: number;
        if (c.category === 'stock') {
          v = perceivedStockCardValue(state, profile, c as StockCard, botId);
        } else if ((c as ActionCard).effect.type === 'take_face_up') {
          v = 4;
        } else {
          v = actionCardBaseValue(c as ActionCard, state, profile, botId);
        }
        if (v > best) best = v;
      }
      return Math.max(4, best);
    }
    case 'sell_double':
      // Pump and Dump: max($6, max stockPrice of owned colors), floor of $6.
      return Math.max(6, maxOwnedStockPrice(state, botId));
    case 'adjust_stock':
      // The Squeeze: min($6, 2 × max-count-of-one-color owned). Up to $6.
      return Math.min(6, 2 * maxColorCount(state, botId));
    case 'flip_and_adjust':
      return 4; // Wild Speculation flat.
    case 'tie_breaker':
      return 3; // Preferred Bidder flat.
    case 'steal_stock':
      // Hostile Takeover: 2nd-highest market stock proxy + $1.
      return secondHighestMarketStock(state, profile, botId) + 1;
    case 'adjust_all_stocks':
      // Rumor Mill: max($1, count of bot's colored stocks).
      return Math.max(1, ownedColoredStockCount(state, botId));
    case 'peek_reorder_tips':
      return 3; // Inside Track / Wiretap flat.
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
