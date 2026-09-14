import type {
  ActionCard,
  BonusCard,
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
  // Tip resolution order is the order in the event deck. Sort known peeks by
  // their index in the deck so we apply them in the order they'll fire.
  const indexed = knownPeekedTips
    .map(t => ({ tip: t, idx: state.eventDeck.findIndex(d => d.uid === t.uid) }))
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
      // Peek plus the option to bury one bad card — a bit better than a pure peek.
      return reward.count * params.rewardPeekMult + 1;
    case 'draw_tips':
      // Drawing cards into hand (playable later, or a new private goal) is
      // worth more than a peek.
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
      // A card in hand (playable later, or a new private goal) plus flat cash.
      return reward.cash + params.rewardDrawTipsMult;
  }
}

/**
 * For one color, sum floor(rewardCashEquivalent / (totalRequirements + 3))
 * over every goal (public row + the bot's own private goals in hand) that
 * requires this color AND that the bot is no more than 2 cards away from
 * completing. Goals further away are ignored.
 *
 * Why the filter: completing a 4-card goal from zero owned stocks requires 4
 * future auction wins — the bump should not influence today's bidding for
 * something that may never happen.
 *
 * Why total+3: conservative discount for the cost/risk of actually completing
 * the goal AND for the chance another player claims it first (n/a for a
 * private goal, but the discount is harmless there too).
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
  const privateGoals = bot.hand.filter((c): c is GoalCard => c.category === 'goal');
  const relevantGoals: GoalCard[] = [...state.goalRow, ...privateGoals];
  let bump = 0;
  const n = state.players.length;
  for (const g of relevantGoals) {
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

/** Heuristic value of a goal card itself (used when drafting/deciding whether to keep one). Undiscounted by completability -- deeper play is out of scope for a heuristic bot. */
export function perceivedGoalCardValue(
  state: GameState,
  card: GoalCard,
  params: BotParams = DEFAULTS
): number {
  return rewardCashEquivalent(card.reward.parsed, state.players.length, params);
}

/**
 * Flat heuristic value of a hidden end-game bonus card. These constants are
 * rough, hand-picked estimates (not yet threaded through BotParams/ES tuning
 * -- consistent with the "heuristic-only for V5" scope); revisit once
 * playtesting gives a sense of typical game length / stock counts.
 */
export function perceivedBonusCardValue(state: GameState, card: BonusCard, botId: PlayerId): number {
  switch (card.effect.type) {
    case 'flat_cash':
      return card.effect.amount;
    case 'per_stock_held': {
      const bot = state.players.find(p => p.playerId === botId);
      const owned = bot ? bot.hand.filter(c => c.category === 'stock').length : 0;
      const expectedFinalStocks = owned + 3; // rough: expect a few more acquisitions
      return card.effect.amount * expectedFinalStocks;
    }
    case 'per_goal_completed':
      return card.effect.amount * 1.5; // rough: expect ~1-2 goals completed over a game
    case 'no_loans_bonus': {
      const bot = state.players.find(p => p.playerId === botId);
      return bot && bot.loans === 0 ? card.effect.amount * 0.7 : card.effect.amount * 0.3;
    }
    case 'easy_credit':
      return 4; // small flat value; only matters if loans happen
  }
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
/**
 * Effect types whose own valuation logic scans the market or hand and would
 * recurse into `actionCardBaseValue` for whatever it finds there. If any two
 * of these end up evaluating each other (e.g. a Backroom Deal card sits in
 * the market while another Backroom Deal or Double Down card sits in a
 * hand), that recursion never bottoms out. `safeActionCardValue` is the
 * guarded entry point every such case must use instead of calling
 * `actionCardBaseValue` directly on an arbitrary other card.
 */
const RECURSION_RISK_EFFECTS = new Set(['take_face_up', 'backroom_deal', 'double_down']);

function safeActionCardValue(
  card: ActionCard,
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): number {
  if (RECURSION_RISK_EFFECTS.has(card.effect.type)) {
    return profile.params.takeFaceUpBase; // flat fallback, never recurses further
  }
  return actionCardBaseValue(card, state, profile, botId);
}

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
      // Corner the Market: max perceivedValue of any market card. Uses
      // safeActionCardValue for other action cards to avoid recursing into
      // another take_face_up/backroom_deal/double_down card.
      let best = 0;
      for (const c of state.market) {
        let v: number;
        if (c.category === 'stock') {
          v = perceivedStockCardValue(state, profile, c as StockCard, botId);
        } else if (c.category === 'action') {
          v = safeActionCardValue(c as ActionCard, state, profile, botId);
        } else {
          v = 0;
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
    case 'broker_discount':
      // Rough estimate of ~2 future auction wins in that color at $2 off each.
      return 4;
    case 'steal_stock':
      // Hostile Takeover: 2nd-highest market stock proxy + bonus.
      return secondHighestMarketStock(state, profile, botId) + p.stealStockBonus;
    case 'adjust_all_stocks':
      // Rumor Mill: max(floor, count of bot's colored stocks).
      return Math.max(p.adjustAllFloor, ownedColoredStockCount(state, botId));
    case 'draw_tip':
      // Insider Source: knowing/holding the next event card lets the bot react
      // (or gains a private goal); valuable but not dramatically so.
      return state.eventDeck.length > 0 ? p.drawTipValue : 0;
    case 'fire_sale': {
      let best = 0;
      for (const c of state.market) {
        if (c.category === 'stock' && c.color !== 'Wild') {
          const v = perceivedStockCardValue(state, profile, c as StockCard, botId);
          if (v > best) best = v;
        }
      }
      return Math.max(0, best - 3);
    }
    case 'first_look':
      // Roughly half a random market-deck card's expected value.
      return Math.max(1, Math.floor(secondHighestMarketStock(state, profile, botId) / 2));
    case 'foresight':
      return 2; // pure information value, small flat constant
    case 'windfall':
      return 5;
    case 'market_panic':
      // Mostly hurts others rather than directly helping self; discount it.
      return Math.max(0, Math.floor(3 * Math.max(0, state.players.length - 1) * 0.5));
    case 'backroom_deal': {
      let bestMarket = 0;
      for (const c of state.market) {
        const v =
          c.category === 'insider_tip'
            ? Math.max(0, tipScoreForBot(state, c as InsiderTipCard, botId))
            : c.category === 'goal'
              ? perceivedGoalCardValue(state, c as GoalCard, p)
              : c.category === 'action'
                ? safeActionCardValue(c as ActionCard, state, profile, botId)
                : perceivedStockCardValue(state, profile, c as StockCard, botId);
        if (v > bestMarket) bestMarket = v;
      }
      let worstHand = Infinity;
      const bot = state.players.find(pl => pl.playerId === botId);
      if (bot) {
        for (const c of bot.hand) {
          if (c.category === 'bonus') continue; // never tradeable
          if (c.uid === card.uid) continue; // never evaluate the card against itself
          let v: number;
          if (c.category === 'stock') {
            v =
              c.color === 'Wild'
                ? perceivedWildShareValue(state, profile, botId)
                : perceivedStockCardValue(state, profile, c as StockCard, botId);
          } else if (c.category === 'action') {
            v = safeActionCardValue(c as ActionCard, state, profile, botId);
          } else if (c.category === 'insider_tip') {
            v = Math.max(0, tipScoreForBot(state, c as InsiderTipCard, botId));
          } else {
            v = perceivedGoalCardValue(state, c as GoalCard, p);
          }
          if (v < worstHand) worstHand = v;
        }
      }
      if (worstHand === Infinity) worstHand = 0;
      return Math.max(0, bestMarket - worstHand);
    }
    case 'double_down': {
      const bot = state.players.find(pl => pl.playerId === botId);
      let bestOther = 0;
      if (bot) {
        for (const c of bot.hand) {
          if (c.category === 'action' && c.uid !== card.uid && !(c as ActionCard).persistent) {
            const v = safeActionCardValue(c as ActionCard, state, profile, botId);
            if (v > bestOther) bestOther = v;
          }
        }
      }
      return Math.max(0, bestOther - 2);
    }
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
  const counts: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
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
 * Signed score of a market-movement card from the bot's perspective (Σ over
 * colors of delta × ownedCount(color)). Higher = better. Used for reorder
 * decisions (Foresight, peek_bottom_choice) and for deciding whether to play
 * a held card.
 */
export function tipScoreForBot(state: GameState, tip: InsiderTipCard, botId: PlayerId): number {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return 0;
  const owned: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
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
