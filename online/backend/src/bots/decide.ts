import type {
  AuctionBidRequest,
  Color,
  FreeActionRequest,
  GameState,
  GoalCard,
  HandCard,
  InsiderTipCard,
  PlayerId,
  PromptEnvelope,
  StockCard,
  TurnActionRequest
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import type { Rng } from '../domain/rng.js';
import type { BotProfile } from './profile.js';
import { chooseActionCardToPlay } from './actionHeuristics.js';
import {
  bestOwnedColor,
  effectivePrices,
  ownedColoredStockCount,
  perceivedActionCardValue,
  perceivedCardValue,
  perceivedStockCardValue,
  perceivedStockValue,
  perceivedWildShareValue,
  tipScoreForBot
} from './valuation.js';

/**
 * Auction tuning. WINNER_MARGIN is the discount from perceived value the bot
 * keeps as its "winner's curse" buffer — bidding to exactly your private
 * valuation has zero expected profit. LOAN_COST is the net $ penalty of a
 * single loan ($12 owed at end − $10 cash received).
 */
const WINNER_MARGIN = 1;
const LOAN_COST = 2;

/**
 * Given the bot's perceived value of a card and current cash, return the
 * maximum bid the bot is willing to make. Encodes both the winner-curse
 * discount (#2) and the EV-based loan gate (#3): a loan is only worth taking
 * if the perceived value above current cash exceeds LOAN_COST.
 */
function effectiveBidCeiling(perceived: number, cash: number): number {
  const adjusted = perceived - WINNER_MARGIN;
  if (adjusted <= cash) return adjusted;
  // Otherwise we'd need a loan to bid this high.
  if (adjusted - LOAN_COST > cash) {
    return Math.min(adjusted, cash + 10);
  }
  return cash;
}

/** What the bot wants to do next. The runner translates each to an engine call. */
export type BotAction =
  | { kind: 'turn_action'; action: TurnActionRequest }
  | { kind: 'auction_bid'; action: AuctionBidRequest }
  | { kind: 'free_action'; request: FreeActionRequest }
  | { kind: 'prompt_response'; promptId: string; response: Record<string, unknown> };

export interface DecideContext {
  rng: Rng;
}

/**
 * Returns the bot's next action, or null if it has nothing to do given current
 * state. Caller should keep calling until null (between every mutation).
 */
export function decideBotAction(
  state: GameState,
  botId: PlayerId,
  profile: BotProfile,
  ctx: DecideContext
): BotAction | null {
  if (state.gameOver) return null;
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return null;

  // Prune resolved peeks from the profile (no-op if none).
  if (profile.knownPeekedTips.length > 0) {
    const resolvedUids = new Set(state.resolvedInsiderTips.map(t => t.uid));
    profile.knownPeekedTips = profile.knownPeekedTips.filter(t => !resolvedUids.has(t.uid));
  }

  // 1. Pending prompt → respond.
  const prompt = state.pendingPrompts[botId] ?? null;
  if (prompt) return respondToPrompt(state, bot, profile, prompt, ctx);

  // Skip free-action generation if this bot already has one queued — it'll
  // process when advance() can drain (i.e., when all pending prompts clear).
  // Without this guard, a bot would re-enqueue the same goal/Hot Tip every
  // tick while a different bot has an open prompt, livelocking the runner.
  const alreadyQueued = state.freeActionQueue.some(e => e.playerId === botId);
  if (alreadyQueued) return null;

  // 2. Claimable goal.
  const claim = tryBuildGoalClaim(state, botId, profile);
  if (claim) {
    return { kind: 'free_action', request: claim };
  }

  // 3. Hot Tip (if threshold reached).
  if (
    bot.hotTipAvailable &&
    state.resolvedInsiderTips.length >= profile.hotTipThreshold &&
    state.insiderTipDeck.length > 0
  ) {
    return { kind: 'free_action', request: { kind: 'use_hot_tip' } };
  }

  // 4. Single-use action card in hand worth playing.
  const cardToPlay = chooseActionCardToPlay(state, profile, botId);
  if (cardToPlay) {
    return {
      kind: 'free_action',
      request: { kind: 'play_action_card', cardUid: cardToPlay }
    };
  }

  // 5. Turn action — only when it's the bot's turn and we're awaiting one.
  if (
    state.turnPhase === 'awaiting_turn_action' &&
    state.players[state.currentPlayerIndex].playerId === botId
  ) {
    return decideTurnAction(state, bot, profile, ctx);
  }

  return null;
}

// -----------------------------------------------------------------------------
// Goal claim helper. Per rules.md, colored stocks stay in hand after
// claiming — only Wild Shares used as substitutes are discarded. Claiming is
// therefore free money: the bot always claims any goal it can satisfy,
// burning Wilds without hesitation if needed.
// -----------------------------------------------------------------------------
function tryBuildGoalClaim(
  state: GameState,
  botId: PlayerId,
  _profile: BotProfile
): FreeActionRequest | null {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return null;
  for (const goal of state.activeGoals) {
    const req = { ...goal.goal.parsed.requirements };
    const need: Partial<Record<Color, number>> = { ...req };
    const assignment: Record<string, Color> = {};
    const usedUids = new Set<string>();
    // Use exact-color stocks first.
    for (const c of bot.hand) {
      if (c.category !== 'stock') continue;
      if (c.color === 'Wild') continue;
      if (usedUids.has(c.uid)) continue;
      const remaining = need[c.color] ?? 0;
      if (remaining > 0) {
        assignment[c.uid] = c.color;
        usedUids.add(c.uid);
        need[c.color] = remaining - 1;
      }
    }
    // Fill with Wild Shares.
    for (const color of COLORS) {
      while ((need[color] ?? 0) > 0) {
        const wild = bot.hand.find(
          c => c.category === 'stock' && c.color === 'Wild' && !usedUids.has(c.uid)
        );
        if (!wild) break;
        assignment[wild.uid] = color;
        usedUids.add(wild.uid);
        need[color] = (need[color] ?? 0) - 1;
      }
    }
    const satisfied = COLORS.every(c => (need[c] ?? 0) <= 0);
    if (!satisfied) continue;
    return {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: assignment }
    };
  }
  return null;
}

// -----------------------------------------------------------------------------
// Turn action: sell-on-bad-news, sell-on-low-cash, or start auction.
// -----------------------------------------------------------------------------
function decideTurnAction(
  state: GameState,
  bot: { playerId: PlayerId; hand: HandCard[]; cash: number; loans: number },
  profile: BotProfile,
  ctx: DecideContext
): BotAction | null {
  // Sell-on-bad-news: bot owns a colored stock whose effective price (after
  // known peeked tips) is BELOW the current market price — i.e. a bad tip is
  // coming for that color. Sell the worst one.
  const effective = effectivePrices(state, profile.knownPeekedTips);
  let worst: { uid: string; loss: number } | null = null;
  for (const c of bot.hand) {
    if (c.category !== 'stock' || c.color === 'Wild') continue;
    const loss = state.stockPrices[c.color] - effective[c.color];
    if (loss > 0 && (!worst || loss > worst.loss)) {
      worst = { uid: c.uid, loss };
    }
  }
  if (worst) {
    return { kind: 'turn_action', action: { type: 'sell_stock', stockUid: worst.uid } };
  }

  // Sell-on-low-cash: cash < $10 AND has ≥1 loan AND owns a sellable stock.
  // Sell the stock with the highest ACTUAL current price (not perceived value)
  // — we want immediate cash, not future expectation.
  if (bot.cash < 10 && bot.loans >= 1) {
    let best: { uid: string; price: number } | null = null;
    for (const c of bot.hand) {
      if (c.category !== 'stock' || c.color === 'Wild') continue;
      const price = state.stockPrices[c.color];
      if (!best || price > best.price) best = { uid: c.uid, price };
    }
    if (best) {
      return { kind: 'turn_action', action: { type: 'sell_stock', stockUid: best.uid } };
    }
  }

  // Otherwise: start an auction on a market card. Heavily prefer market stocks
  // matching colors the bot already owns; opening bid = perceivedValue −
  // randInt(0, 3), clamped to [0, cash + 10] (the +10 leans on a loan).
  if (state.market.length === 0) return null;
  const ownedCounts: Record<Color, number> = { Blue: 0, Orange: 0, Yellow: 0, Purple: 0 };
  for (const c of bot.hand) {
    if (c.category === 'stock' && c.color !== 'Wild') ownedCounts[c.color]++;
  }
  const weights = state.market.map(c => {
    if (c.category === 'stock' && c.color !== 'Wild') {
      return 1 + 3 * ownedCounts[c.color];
    }
    return 1;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const roll = ctx.rng.next() * total;
  let acc = 0;
  let chosenIdx = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (roll < acc) {
      chosenIdx = i;
      break;
    }
  }
  const target = state.market[chosenIdx];
  const perceived = perceivedCardValue(target, state, profile, bot.playerId);
  const discount = ctx.rng.int(2); // 0..1 — minor "fish for a steal" variance
  let opening = Math.max(0, perceived - discount);
  // Clamp opening to the EV-positive bid ceiling (handles both winner-curse
  // discount and loan-cost gating).
  const ceiling = effectiveBidCeiling(perceived, bot.cash);
  if (opening > ceiling) opening = Math.max(0, ceiling);
  // Cache the bot's perceived value for this auction so re-bids reuse it.
  profile.auctionCeilings[target.uid] = perceived;
  return {
    kind: 'turn_action',
    action: { type: 'start_auction', cardUid: target.uid, initialBid: opening }
  };
}

// -----------------------------------------------------------------------------
// Prompt response router.
// -----------------------------------------------------------------------------
function respondToPrompt(
  state: GameState,
  bot: { playerId: PlayerId; hand: HandCard[]; cash: number; loans: number },
  profile: BotProfile,
  prompt: PromptEnvelope,
  ctx: DecideContext
): BotAction | null {
  const botId = bot.playerId;
  const payload = (prompt.payload || {}) as Record<string, unknown>;

  switch (prompt.type) {
    case 'auction_bid': {
      const auction = state.auction;
      if (!auction) return null;
      // The card being auctioned.
      const card = state.market.find(c => c.uid === auction.cardUid);
      if (!card) {
        return { kind: 'auction_bid', action: { type: 'pass' } };
      }
      // Cache the bot's perceived value per auction. We re-derive the bid
      // ceiling each turn because cash changes between bids.
      let perceived = profile.auctionCeilings[auction.cardUid];
      if (perceived === undefined) {
        perceived = perceivedCardValue(card, state, profile, botId);
        profile.auctionCeilings[auction.cardUid] = perceived;
      }
      const effectiveCeiling = effectiveBidCeiling(perceived, bot.cash);
      const next = auction.currentHigh + 1;
      if (next <= effectiveCeiling) {
        return { kind: 'auction_bid', action: { type: 'bid', amount: next } };
      }
      return { kind: 'auction_bid', action: { type: 'pass' } };
    }

    case 'peek_ack': {
      // Capture any revealed tip into the bot's knowledge for future valuation.
      const tip = payload.tip as { text: string; type: string } | undefined;
      const tips = payload.tips as Array<{ text: string; type: string }> | undefined;
      // We only have the projected (sanitized) payload here, so look up the
      // actual tip(s) by matching the top of insiderTipDeck.
      if (tip) {
        const top = state.insiderTipDeck[0];
        if (top && !profile.knownPeekedTips.some(t => t.uid === top.uid)) {
          profile.knownPeekedTips.push(top);
        }
      }
      if (tips && tips.length > 0) {
        for (let i = 0; i < tips.length; i++) {
          const t = state.insiderTipDeck[i];
          if (t && !profile.knownPeekedTips.some(k => k.uid === t.uid)) {
            profile.knownPeekedTips.push(t);
          }
        }
      }
      return { kind: 'prompt_response', promptId: prompt.promptId, response: {} };
    }

    case 'pick_color': {
      // Tip-Off: pick a color (other than the bought stock) to raise +1. Pick
      // the color the bot owns most of (or has highest goal bump if none).
      const exclude = payload.exclude as Color | undefined;
      const candidate = bestNonExcludedColor(state, profile, botId, exclude);
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { color: candidate }
      };
    }

    case 'pick_color_amount': {
      const amount = payload.amount as number;
      const perColor = payload.perColor as boolean | undefined;
      if (perColor) {
        // Rumor Mill / similar: set each color to +amount if bot owns ≥1 of
        // that color, else -amount (lower colors it doesn't own).
        const owned = countByColor(bot.hand);
        const choices: Record<Color, number> = { Blue: 0, Orange: 0, Yellow: 0, Purple: 0 };
        for (const c of COLORS) {
          choices[c] = owned[c] > 0 ? amount : -amount;
        }
        return {
          kind: 'prompt_response',
          promptId: prompt.promptId,
          response: { choices }
        };
      }
      // Single color: pick the color bot owns most of, raise it; if owns none,
      // raise any color (default Blue).
      const color = bestOwnedColor(state, botId) ?? bestColorByGoal(state, profile, botId);
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { color, sign: 'up' }
      };
    }

    case 'set_stock_choice': {
      // Reward: set a stock to amount $X. Pick the bot's biggest holding that's
      // currently BELOW that amount; otherwise pick the color with most stocks.
      const amount = payload.amount as number;
      const owned = countByColor(bot.hand);
      let pick: Color | null = null;
      let best = -1;
      for (const c of COLORS) {
        if (owned[c] === 0) continue;
        if (state.stockPrices[c] >= amount) continue;
        if (owned[c] > best) {
          best = owned[c];
          pick = c;
        }
      }
      pick = pick ?? bestOwnedColor(state, botId) ?? 'Blue';
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { color: pick }
      };
    }

    case 'adjust_two_stocks_choice': {
      // Raise one color (we own most of) and lower another (we own least, but
      // not the same).
      const owned = countByColor(bot.hand);
      const upColor = bestOwnedColor(state, botId) ?? 'Blue';
      let downColor: Color = COLORS.find(c => c !== upColor)!;
      let minOwned = Infinity;
      for (const c of COLORS) {
        if (c === upColor) continue;
        if (owned[c] < minOwned) {
          minOwned = owned[c];
          downColor = c;
        }
      }
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { upColor, downColor }
      };
    }

    case 'wild_speculation_choice': {
      const color = payload.color as Color;
      const owned = countByColor(bot.hand);
      const sign = owned[color] > 0 ? 'up' : 'down';
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { sign }
      };
    }

    case 'pick_stock_from_hand': {
      const mode = payload.mode as string;
      if (mode === 'pump_and_dump') {
        // Sell colored stock with highest current price.
        let best: { uid: string; price: number } | null = null;
        for (const c of bot.hand) {
          if (c.category !== 'stock' || c.color === 'Wild') continue;
          const p = state.stockPrices[c.color];
          if (!best || p > best.price) best = { uid: c.uid, price: p };
        }
        if (best) {
          return {
            kind: 'prompt_response',
            promptId: prompt.promptId,
            response: { stockUid: best.uid }
          };
        }
        // Nothing to sell — but Pump-and-Dump shouldn't be played without stocks.
        // The engine will error; we send done as a defensive escape.
        return {
          kind: 'prompt_response',
          promptId: prompt.promptId,
          response: { done: true }
        };
      }
      if (mode === 'sell_bonus_batch') {
        // Sell colored stocks one at a time (highest price first) until the
        // bot is out of saleable stocks; then send done.
        let best: { uid: string; price: number } | null = null;
        for (const c of bot.hand) {
          if (c.category !== 'stock' || c.color === 'Wild') continue;
          const p = state.stockPrices[c.color];
          if (!best || p > best.price) best = { uid: c.uid, price: p };
        }
        if (!best) {
          return {
            kind: 'prompt_response',
            promptId: prompt.promptId,
            response: { done: true }
          };
        }
        return {
          kind: 'prompt_response',
          promptId: prompt.promptId,
          response: { stockUid: best.uid }
        };
      }
      // Unknown mode — bail.
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { done: true }
      };
    }

    case 'pick_target_player': {
      // Hostile Takeover stage 1: pick opponent with largest hand (public info).
      let best: { id: PlayerId; size: number } | null = null;
      for (const p of state.players) {
        if (p.playerId === botId) continue;
        const size = p.hand.length;
        if (!best || size > best.size) best = { id: p.playerId, size };
      }
      const targetId = best?.id ?? state.players.find(p => p.playerId !== botId)?.playerId;
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { targetId }
      };
    }

    case 'pick_stock_from_target': {
      // Pick the highest-priced color in the target's revealed hand.
      const stocks = (payload.stocks as Array<{ uid: string; color: Color }>) ?? [];
      let best: { uid: string; price: number } | null = null;
      for (const s of stocks) {
        if (s.color === ('Wild' as never)) continue;
        const p = state.stockPrices[s.color];
        if (!best || p > best.price) best = { uid: s.uid, price: p };
      }
      const stockUid = best?.uid ?? stocks[0]?.uid;
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { stockUid }
      };
    }

    case 'pick_market_card': {
      // Corner the Market / swap_with_market: pick the market card with the
      // highest perceived value.
      let best: { uid: string; value: number } | null = null;
      for (const c of state.market) {
        const v = perceivedCardValue(c, state, profile, botId);
        if (!best || v > best.value) best = { uid: c.uid, value: v };
      }
      const cardUid = best?.uid ?? state.market[0]?.uid;
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { cardUid }
      };
    }

    case 'pick_hand_stock_for_swap': {
      // Swap one of my stocks with a chosen market card. Pick the colored
      // stock with the LOWEST perceived value (give up the worst).
      let worst: { uid: string; value: number } | null = null;
      for (const c of bot.hand) {
        if (c.category !== 'stock') continue;
        const v =
          c.color === 'Wild'
            ? perceivedWildShareValue(state, profile, botId)
            : perceivedStockCardValue(state, profile, c as StockCard, botId);
        if (!worst || v < worst.value) worst = { uid: c.uid, value: v };
      }
      const stockUid = worst?.uid;
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { stockUid }
      };
    }

    case 'draw_and_keep': {
      // Keep the highest-perceived-value drawn cards.
      const drawn = (payload.drawn as Array<{ uid: string; card: HandCard }>) ?? [];
      const keepCount = payload.keepCount as number;
      const sorted = drawn
        .map(d => ({
          uid: d.uid,
          value: perceivedCardValue(d.card, state, profile, botId)
        }))
        .sort((a, b) => b.value - a.value);
      const keepUids = sorted.slice(0, keepCount).map(s => s.uid);
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { keepUids }
      };
    }

    case 'reorder_tips': {
      // Order from best-for-bot (top) to worst-for-bot (bottom).
      const stagedUids = (payload.stagedUids as string[]) ?? [];
      const tips = stagedUids
        .map(uid => state.insiderTipDeck.find(t => t.uid === uid))
        .filter((t): t is InsiderTipCard => !!t);
      // Also capture them as known peeks (we just learned what they are).
      for (const t of tips) {
        if (!profile.knownPeekedTips.some(k => k.uid === t.uid)) {
          profile.knownPeekedTips.push(t);
        }
      }
      const scored = tips
        .map(t => ({ uid: t.uid, score: tipScoreForBot(state, t, botId) }))
        .sort((a, b) => b.score - a.score);
      const order = scored.map(s => s.uid);
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { order }
      };
    }
  }
  return null;
}

// ---- small helpers -----------------------------------------------------------

function countByColor(hand: HandCard[]): Record<Color, number> {
  const out: Record<Color, number> = { Blue: 0, Orange: 0, Yellow: 0, Purple: 0 };
  for (const c of hand) {
    if (c.category === 'stock' && c.color !== 'Wild') out[c.color]++;
  }
  return out;
}

function bestNonExcludedColor(
  state: GameState,
  profile: BotProfile,
  botId: PlayerId,
  exclude: Color | undefined
): Color {
  let best: Color = COLORS.find(c => c !== exclude)!;
  let bestV = -Infinity;
  for (const c of COLORS) {
    if (c === exclude) continue;
    const v = perceivedStockValue(state, profile, c, botId);
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

function bestColorByGoal(state: GameState, profile: BotProfile, botId: PlayerId): Color {
  let best: Color = 'Blue';
  let bestV = -Infinity;
  for (const c of COLORS) {
    const v = perceivedStockValue(state, profile, c, botId);
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}
