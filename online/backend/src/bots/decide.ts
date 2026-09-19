import type {
  ActionCard,
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
import { COLORS, maxAffordableSpend } from '@insider-trading/shared';
import type { Rng } from '../domain/rng.js';
import type { BotProfile } from './profile.js';
import type { BotParams } from './botParams.js';
import { chooseActionCardToPlay } from './actionHeuristics.js';
import { staticDraftCardValue } from './draftCardRanking.js';
import {
  bestOwnedColor,
  effectivePrices,
  perceivedActionCardValue,
  perceivedCardValue,
  perceivedGoalCardValue,
  perceivedStockCardValue,
  perceivedStockValue,
  perceivedWildShareValue,
  tipScoreForBot
} from './valuation.js';

/**
 * Auction tuning. `winnerMargin` is the discount from perceived value the bot
 * keeps as its "winner's curse" buffer — bidding to exactly your private
 * valuation has zero expected profit. The next-loan cost is roughly the
 * escalating loan schedule ($12 then $14) vs. $10 cash now, so the marginal
 * net cost of taking a loan when you already hold L loans is about
 * L + `loanCostOffset`. Both come from BotParams (see botParams.ts).
 */
function nextLoanCost(currentLoans: number, loanCostOffset: number): number {
  return currentLoans + loanCostOffset;
}

/**
 * How many turns (global `state.turnNumber`, not per-bot decision calls --
 * see BotProfile.lastProgressTurn) the progress tracker may sit unchanged
 * before a bot force-plays a held market-movement card regardless of its
 * score. Legitimate games observed in testing advance the tracker well
 * within a few hundred turns; this is set well above that so the fallback
 * never fires in normal play, but still bounds a fully-bot game to a finite
 * length in the pathological case where every remaining event-deck-origin
 * card is simultaneously unappealing to its private holder.
 */
const STAGNATION_FORCE_TURNS = 400;

/**
 * How many action cards the current player may play in a row, during their
 * own still-pending turn action, before being forced ahead to the mandatory
 * turn action instead. See the step-3 comment in decideBotAction for why
 * this exists. Generous relative to normal play (chaining more than 2-3
 * free-action cards before taking a turn action is already unusual).
 */
const MAX_OWN_TURN_ACTION_CARDS = 10;

/**
 * Given the bot's perceived value of a card, current cash, and existing loan
 * count, return the maximum bid the bot is willing to make. Encodes both the
 * winner-curse discount and an EV-based loan gate: a new loan is only worth
 * taking if the perceived value above current cash exceeds the *next* loan's
 * marginal cost (which grows with each loan already held). The `+10` is the
 * game's fixed loan cash amount (a rule constant, not a bot knob).
 */
function effectiveBidCeiling(
  perceived: number,
  cash: number,
  currentLoans: number,
  params: BotParams
): number {
  const adjusted = perceived - params.winnerMargin;
  if (adjusted <= cash) return adjusted;
  // Otherwise we'd need a loan. Never bid beyond the loan cap (max 2 loans).
  const maxAfford = maxAffordableSpend(cash, currentLoans);
  if (maxAfford > cash && adjusted - nextLoanCost(currentLoans, params.loanCostOffset) > cash) {
    return Math.min(adjusted, cash + 10, maxAfford);
  }
  return cash;
}

/**
 * Per-auction random bid offset r∈{0..3}, drawn once and cached on the profile.
 * The bot opens at `maxBid - r` and climbs by the minimum legal raise up to
 * `maxBid`, so it tries to win below its ceiling rather than slamming the max.
 */
function auctionOffset(profile: BotProfile, cardUid: string, rng: Rng): number {
  let r = profile.auctionBidOffsets[cardUid];
  if (r === undefined) {
    r = rng.int(4); // 0..3
    profile.auctionBidOffsets[cardUid] = r;
  }
  return r;
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

  // Track how long the progress tracker has gone without moving, from this
  // bot's point of view -- see the stagnation-fallback note at step 4 below.
  if (state.progressTracker !== profile.lastSeenProgressTracker) {
    profile.lastSeenProgressTracker = state.progressTracker;
    profile.lastProgressTurn = state.turnNumber;
  }

  // Track how many action cards this bot has played in a row since
  // `state.turnNumber` last moved -- see the step-3 cap below. This applies
  // regardless of whose turn it nominally is: two non-current players can
  // volley a card back and forth via free actions (legal "any time") and
  // starve the actual current player of any chance to act, so the cap has to
  // bound every bot's action-card streak, not just the current player's.
  if (profile.ownTurnStreakTurnNumber !== state.turnNumber) {
    profile.ownTurnStreakTurnNumber = state.turnNumber;
    profile.ownTurnActionCardStreak = 0;
  }

  // Prune resolved peeks from the profile (no-op if none).
  if (profile.knownPeekedTips.length > 0) {
    const resolvedUids = new Set(state.resolvedEventCards.map(t => t.uid));
    profile.knownPeekedTips = profile.knownPeekedTips.filter(t => !resolvedUids.has(t.uid));
  }

  // 1. Pending prompt → respond. (This also handles the setup-draft's
  // 'setup_draft_pick' prompt, since it's just another PromptType.)
  const prompt = state.pendingPrompts[botId] ?? null;
  if (prompt) return respondToPrompt(state, bot, profile, prompt, ctx);

  // While the setup draft is still in progress, a bot with no prompt of its
  // own (it already picked for this round, but others haven't) has nothing
  // else to do -- goal claims and action-card plays are not legal yet, and
  // free actions queued now would never drain: advance() intentionally
  // refuses to process the queue while turnPhase is 'setup_draft', so
  // queuing one here would livelock the runner once every bot runs out of
  // draft prompts to answer.
  if (state.turnPhase === 'setup_draft') return null;

  // Skip free-action generation if this bot already has one queued — it'll
  // process when advance() can drain (i.e., when all pending prompts clear).
  // Without this guard, a bot would re-enqueue the same goal every tick while
  // a different bot has an open prompt, livelocking the runner.
  const alreadyQueued = state.freeActionQueue.some(e => e.playerId === botId);
  if (alreadyQueued) return null;

  // 2. Claimable goal (public or private).
  const claim = tryBuildGoalClaim(state, botId);
  if (claim) {
    return { kind: 'free_action', request: claim };
  }

  // 3. Single-use action card in hand worth playing. Capped at
  // MAX_OWN_TURN_ACTION_CARDS plays per bot per turnNumber: a card like
  // Hostile Takeover can hand its target a replacement draw that (via the
  // market deck's discard-pile reshuffle) sometimes returns the very card
  // just discarded, letting two bots -- neither of whom need be the current
  // player, since free actions are legal "any time" -- volley the same
  // action card back and forth indefinitely. Since that never advances
  // `turnNumber`, it would starve the actual current player of ever getting
  // a turn. Once capped, fall through; this bot returns null for the rest of
  // this turnNumber (if it's not the current player) or falls to its own
  // mandatory turn action below, which always exists per the rules ("an
  // auction is always available").
  if (profile.ownTurnActionCardStreak < MAX_OWN_TURN_ACTION_CARDS) {
    const cardToPlay = chooseActionCardToPlay(state, profile, botId);
    if (cardToPlay) {
      profile.ownTurnActionCardStreak++;
      return {
        kind: 'free_action',
        request: { kind: 'play_action_card', cardUid: cardToPlay }
      };
    }
  }

  // 4. Market-movement card in hand worth playing (positive tipScore for the bot).
  let leastBadTipUid: string | null = null;
  let leastBadTipScore = -Infinity;
  for (const c of bot.hand) {
    if (c.category !== 'insider_tip') continue;
    const score = tipScoreForBot(state, c, botId);
    if (score > 0) {
      return {
        kind: 'free_action',
        request: { kind: 'play_market_movement', cardUid: c.uid }
      };
    }
    if (score > leastBadTipScore) {
      leastBadTipScore = score;
      leastBadTipUid = c.uid;
    }
  }

  // 4b. Stagnation fallback: every remaining path to +1 progress can end up
  // simultaneously unappealing to whoever holds it (a market-movement card
  // that's currently harmful to its private holder), which would otherwise
  // stall the progress tracker forever since nothing else ever forces it to
  // resolve. Once the tracker has genuinely gone quiet for a long stretch,
  // play the least-bad held card anyway rather than let the game hang.
  if (leastBadTipUid && state.turnNumber - profile.lastProgressTurn > STAGNATION_FORCE_TURNS) {
    return {
      kind: 'free_action',
      request: { kind: 'play_market_movement', cardUid: leastBadTipUid }
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
// Goal claim helpers.
// -----------------------------------------------------------------------------

/** Find a valid stock assignment for `requirements` from `hand`, or null if unsatisfiable. */
function buildStockAssignment(
  hand: HandCard[],
  requirements: Partial<Record<Color, number>>
): Record<string, Color> | null {
  const need: Partial<Record<Color, number>> = { ...requirements };
  const assignment: Record<string, Color> = {};
  const usedUids = new Set<string>();
  for (const c of hand) {
    if (c.category !== 'stock' || c.color === 'Wild') continue;
    if (usedUids.has(c.uid)) continue;
    const remaining = need[c.color] ?? 0;
    if (remaining > 0) {
      assignment[c.uid] = c.color;
      usedUids.add(c.uid);
      need[c.color] = remaining - 1;
    }
  }
  for (const color of COLORS) {
    while ((need[color] ?? 0) > 0) {
      const wild = hand.find(c => c.category === 'stock' && c.color === 'Wild' && !usedUids.has(c.uid));
      if (!wild) break;
      assignment[wild.uid] = color;
      usedUids.add(wild.uid);
      need[color] = (need[color] ?? 0) - 1;
    }
  }
  const satisfied = COLORS.every(c => (need[c] ?? 0) <= 0);
  return satisfied ? assignment : null;
}

/**
 * Public goals: colored stocks stay in hand after claiming (only Wild Shares
 * used as substitutes are discarded), so claiming is free money — the bot
 * always claims instantly once satisfiable. No new information is created by
 * claiming a card everyone can already see.
 *
 * Private goals: claim instantly too, UNLESS holding a Trophy Case bonus card
 * with enough estimated progress-tracker headroom left to plausibly bank more
 * completions first — a deliberately shallow "maybe wait" heuristic. Actually
 * bluffing/concealing a completed private goal is out of scope for a
 * heuristic-only bot.
 */
function tryBuildGoalClaim(state: GameState, botId: PlayerId): FreeActionRequest | null {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return null;

  for (const goal of state.goalRow) {
    const assignment = buildStockAssignment(bot.hand, goal.goal.parsed.requirements);
    if (assignment) {
      return { kind: 'claim_goal', goalUid: goal.uid, stockAssignment: { cards: assignment } };
    }
  }

  const hasTrophyCase = bot.hand.some(
    c => c.category === 'bonus' && c.effect.type === 'per_goal_completed'
  );
  const remainingProgress = state.progressThreshold - state.progressTracker;
  if (hasTrophyCase && remainingProgress > 3) return null;

  for (const card of bot.hand) {
    if (card.category !== 'goal') continue;
    const assignment = buildStockAssignment(bot.hand, card.goal.parsed.requirements);
    if (assignment) {
      return { kind: 'claim_private_goal', goalUid: card.uid, stockAssignment: { cards: assignment } };
    }
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
  if (bot.cash < profile.params.emergencySellCash && bot.loans >= (profile.emergencySellMinLoans ?? 1)) {
    // Sell the LEAST goal-useful stock (so we don't dump a near-goal piece we
    // just took a loan to win), tie-broken by highest current price.
    const useful = goalHoldUsefulnessByColor(state, bot.playerId);
    let best: { uid: string; useful: number; price: number } | null = null;
    for (const c of bot.hand) {
      if (c.category !== 'stock' || c.color === 'Wild') continue;
      const u = useful[c.color];
      const price = state.stockPrices[c.color];
      if (!best || u < best.useful || (u === best.useful && price > best.price)) {
        best = { uid: c.uid, useful: u, price };
      }
    }
    if (best) {
      return { kind: 'turn_action', action: { type: 'sell_stock', stockUid: best.uid } };
    }
  }

  // Otherwise: start an auction on a market card. Heavily prefer market stocks
  // matching colors the bot already owns; opening bid = perceivedValue −
  // randInt(0, 3), clamped to [0, cash + 10] (the +10 leans on a loan).
  if (state.market.length === 0) return null;
  const ownedCounts: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
  for (const c of bot.hand) {
    if (c.category === 'stock' && c.color !== 'Wild') ownedCounts[c.color]++;
  }
  // Goal-aware targeting: strongly prefer auctioning a color that would COMPLETE
  // a goal (public or private), and nudge toward colors that ADVANCE a near
  // goal. (Bidding/winning stays model-driven; this only steers which card the
  // bot puts up.)
  const goalBoost = goalTargetBoostByColor(state, bot.playerId);
  const weights = state.market.map(c => {
    if (c.category === 'stock' && c.color !== 'Wild') {
      return 1 + profile.params.ownedColorWeight * ownedCounts[c.color] + goalBoost[c.color];
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
  // Floor to whole dollars: tuned params make perceived values fractional, but
  // bids must be integers (a $X.7 valuation ⇒ max bid $X).
  const perceived = Math.floor(marketCardValue(target, state, profile, bot.playerId));
  // Open at minBid = maxBid − rand(0..3): below the ceiling so the bot can win
  // cheap, then it climbs by the minimum legal raise up to maxBid on re-bids.
  const maxBid = effectiveBidCeiling(perceived, bot.cash, bot.loans, profile.params);
  const offset = auctionOffset(profile, target.uid, ctx.rng);
  const opening = Math.max(0, Math.min(maxBid, maxBid - offset));
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
      // Cache the bot's perceived value per auction. We re-derive the bid
      // ceiling each turn because cash changes between bids.
      let perceived = profile.auctionCeilings[auction.cardUid];
      if (perceived === undefined) {
        const card = state.market.find(c => c.uid === auction.cardUid);
        if (!card) {
          return { kind: 'auction_bid', action: { type: 'pass' } };
        }
        perceived = Math.floor(marketCardValue(card, state, profile, botId));
        profile.auctionCeilings[auction.cardUid] = perceived;
      }
      // Recompute maxBid each round (cash changes between bids). minBid =
      // maxBid − rand(0..3) (offset fixed per auction). Bid the lowest legal
      // value in [minBid, maxBid] = max(minBid, currentHigh+1); pass if it
      // would exceed maxBid.
      const maxBid = effectiveBidCeiling(perceived, bot.cash, bot.loans, profile.params);
      const minBid = Math.max(0, maxBid - auctionOffset(profile, auction.cardUid, ctx.rng));
      const candidate = Math.max(minBid, auction.currentHigh + 1);
      if (candidate <= maxBid) {
        return { kind: 'auction_bid', action: { type: 'bid', amount: candidate } };
      }
      return { kind: 'auction_bid', action: { type: 'pass' } };
    }

    case 'peek_ack': {
      // Capture any revealed market-movement card into the bot's knowledge for
      // future valuation (peeked goal cards are ignored -- the bot already
      // knows its own private goals directly, and a peeked-but-not-yet-drawn
      // goal has little actionable value for a heuristic bot).
      const cards = payload.cards as Array<{ uid: string; kind: string }> | undefined;
      if (cards) {
        for (const c of cards) {
          if (c.kind !== 'market_movement') continue;
          const found = state.eventDeck.find(d => d.uid === c.uid) as InsiderTipCard | undefined;
          if (found && !profile.knownPeekedTips.some(t => t.uid === found.uid)) {
            profile.knownPeekedTips.push(found);
          }
        }
      }
      return { kind: 'prompt_response', promptId: prompt.promptId, response: {} };
    }

    case 'peek_bottom_choice': {
      // Peek the top N event cards; optionally send ONE market-movement card to
      // the bottom. Move the worst one (most negative effect on our held
      // stocks) iff it would drop our net worth by $3 or more (score <= -3).
      const count = payload.count as number;
      const top = state.eventDeck.slice(0, count);
      let worst: { uid: string; score: number } | null = null;
      for (const card of top) {
        if (card.category !== 'insider_tip') continue;
        const score = tipScoreForBot(state, card, botId);
        if (!worst || score < worst.score) worst = { uid: card.uid, score };
      }
      const bottomUid = worst && worst.score <= -3 ? worst.uid : undefined;
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: bottomUid ? { bottomUid } : {}
      };
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
        const choices: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
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
      // Reward: set one stock to exactly $X. Pick the color that yields the most
      // value. For a color the bot OWNS, value = (X − price) × count — raising a
      // cheap holding is good, slashing an expensive one is bad. For a color it
      // does NOT own, assume each opponent holds one, so lowering it hurts them
      // (value = price − X) and raising it helps them (negative value).
      const amount = payload.amount as number;
      const owned = countByColor(bot.hand);
      let pick: Color = 'Blue';
      let bestVal = -Infinity;
      for (const c of COLORS) {
        const delta = amount - state.stockPrices[c]; // >0 raises, <0 lowers
        const value = owned[c] > 0 ? delta * owned[c] : -delta;
        if (value > bestVal) {
          bestVal = value;
          pick = c;
        }
      }
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
      if (mode === 'sell_same_bonus') {
        // Liquidation: locked to one color. If not yet locked, pick the color
        // the bot owns the most of (most +bonus payouts). Then sell one of the
        // locked color per call until none remain.
        const locked = payload.lockedColor as Color | undefined;
        let targetColor = locked;
        if (!targetColor) {
          const counts: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
          for (const c of bot.hand) {
            if (c.category === 'stock' && c.color !== 'Wild') counts[c.color]++;
          }
          let bestN = 0;
          for (const col of COLORS) {
            if (counts[col] > bestN) {
              bestN = counts[col];
              targetColor = col;
            }
          }
        }
        const next = targetColor
          ? bot.hand.find(c => c.category === 'stock' && c.color === targetColor)
          : undefined;
        if (!next) {
          return {
            kind: 'prompt_response',
            promptId: prompt.promptId,
            response: { done: true }
          };
        }
        return {
          kind: 'prompt_response',
          promptId: prompt.promptId,
          response: { stockUid: next.uid }
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
      const mode = payload.mode as string | undefined;
      const auctionedUid = state.auction?.cardUid;
      if (mode === 'fire_sale') {
        // Fire Sale must buy a colored stock — restrict candidates accordingly.
        let best: { uid: string; value: number } | null = null;
        for (const c of state.market) {
          if (c.category !== 'stock' || c.color === 'Wild' || c.uid === auctionedUid) continue;
          const v = perceivedStockCardValue(state, profile, c as StockCard, botId);
          if (!best || v > best.value) best = { uid: c.uid, value: v };
        }
        // No eligible colored stock left (bought out from under this pending
        // prompt) -- respond anyway with an empty payload so the engine's
        // fire_sale fizzle path clears the prompt, instead of returning null
        // and leaving it stuck forever.
        return {
          kind: 'prompt_response',
          promptId: prompt.promptId,
          response: best ? { cardUid: best.uid } : {}
        };
      }
      // Corner the Market / swap_with_market / Backroom Deal: pick the market
      // card with the highest perceived value. Exclude the card currently
      // under auction — the engine forbids grabbing it.
      const eligible = state.market.filter(c => c.uid !== auctionedUid);
      let best: { uid: string; value: number } | null = null;
      for (const c of eligible) {
        const v = marketCardValue(c, state, profile, botId);
        if (!best || v > best.value) best = { uid: c.uid, value: v };
      }
      const cardUid = best?.uid ?? eligible[0]?.uid;
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { cardUid }
      };
    }

    case 'pick_hand_stock_for_swap': {
      // Swap one of my cards for a chosen market card. Give up the
      // LOWEST-value one (bonus cards are never eligible here).
      const stockUid = worstTradeableHandCardUid(state, profile, bot, botId);
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { stockUid }
      };
    }

    case 'draw_and_keep': {
      // Keep the highest-perceived-value drawn cards. Drawn cards come from the
      // market deck so they're stocks or actions (never event-deck cards).
      const drawn = (payload.drawn as Array<{ uid: string; card: StockCard | ActionCard }>) ?? [];
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

    case 'setup_draft_pick': {
      // Always keep whichever candidate ranks highest on the static
      // best-to-worst draft value table (see draftCardRanking.ts) -- a
      // deliberately simple heuristic, not a contextual one. Look candidates
      // up from the true (unsanitized) draft state, not the prompt payload.
      const candidates = state.draft?.hands[botId] ?? [];
      if (candidates.length === 0) return null;
      let best: { uid: string; value: number } | null = null;
      for (const c of candidates) {
        const value = staticDraftCardValue(c);
        if (!best || value > best.value) best = { uid: c.uid, value };
      }
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { keepUid: best!.uid }
      };
    }

    case 'foresight_reorder': {
      // Sort the peeked cards by the bot's own benefit (market-movement cards
      // scored by tipScoreForBot; goals/others treated as neutral), keep the
      // best on top, and bury the single worst one if it's actively bad.
      const candidateUids = payload.candidateUids as string[];
      const cards = state.eventDeck.slice(0, candidateUids.length);
      const scored = cards.map(c => ({
        uid: c.uid,
        score: c.category === 'insider_tip' ? tipScoreForBot(state, c as InsiderTipCard, botId) : 0
      }));
      scored.sort((a, b) => b.score - a.score);
      const worst = scored[scored.length - 1];
      const buryWorst = worst.score < 0;
      const kept = buryWorst ? scored.slice(0, -1) : scored;
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: buryWorst
          ? { keepOrder: kept.map(s => s.uid), buriedUid: worst.uid }
          : { keepOrder: kept.map(s => s.uid) }
      };
    }

    case 'backroom_deal_pick_own_card': {
      const stockUid = worstTradeableHandCardUid(state, profile, bot, botId);
      // Respond even with nothing tradeable (empty payload) so the engine's
      // fizzle path clears the prompt -- returning null here would leave it
      // open forever, since only this bot can ever respond to it.
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: stockUid ? { cardUid: stockUid } : {}
      };
    }

    case 'double_down_pick_card': {
      const eligibleUids = (payload.eligibleUids as string[]) ?? [];
      let best: { uid: string; value: number } | null = null;
      for (const uid of eligibleUids) {
        const card = bot.hand.find(c => c.uid === uid);
        if (!card || card.category !== 'action') continue;
        const v = perceivedActionCardValue(card as ActionCard, state, profile, botId);
        if (!best || v > best.value) best = { uid, value: v };
      }
      if (!best) return null;
      return {
        kind: 'prompt_response',
        promptId: prompt.promptId,
        response: { cardUid: best.uid }
      };
    }

    case 'final_goal_offer': {
      // Free value at the very end of the game -- always claim.
      return { kind: 'prompt_response', promptId: prompt.promptId, response: { claim: true } };
    }
  }
  return null;
}

// ---- small helpers -----------------------------------------------------------

/**
 * Perceived value of a face-up market card for bidding/picking. Stocks and
 * action cards use the normal valuation; a market-movement or goal card
 * swapped into the market (via Backroom Deal or swap_with_market) is valued
 * by what it's worth to the bot if drawn (floored at 0 for a bad tip).
 */
function marketCardValue(
  card: StockCard | ActionCard | InsiderTipCard | GoalCard,
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): number {
  if (card.category === 'insider_tip') return Math.max(0, tipScoreForBot(state, card, botId));
  if (card.category === 'goal') return perceivedGoalCardValue(state, card, profile.params);
  return perceivedCardValue(card, state, profile, botId);
}

/** Value of a hand card for "what am I willing to give away" purposes (swap_with_market, Backroom Deal). Bonus cards are never eligible. */
function worstTradeableHandCardUid(
  state: GameState,
  profile: BotProfile,
  bot: { hand: HandCard[] },
  botId: PlayerId
): string | undefined {
  let worst: { uid: string; value: number } | null = null;
  for (const c of bot.hand) {
    if (c.category === 'bonus') continue;
    let v: number;
    if (c.category === 'stock') {
      v =
        c.color === 'Wild'
          ? perceivedWildShareValue(state, profile, botId)
          : perceivedStockCardValue(state, profile, c as StockCard, botId);
    } else if (c.category === 'action') {
      v = perceivedActionCardValue(c as ActionCard, state, profile, botId);
    } else if (c.category === 'insider_tip') {
      v = Math.max(0, tipScoreForBot(state, c as InsiderTipCard, botId));
    } else {
      v = perceivedGoalCardValue(state, c as GoalCard, profile.params);
    }
    if (!worst || v < worst.value) worst = { uid: c.uid, value: v };
  }
  return worst?.uid;
}

function countByColor(hand: HandCard[]): Record<Color, number> {
  const out: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
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

// Auction-targeting boosts (heuristic action-selection, not pricing): how much
// to prefer starting an auction on a color, by its goal usefulness.
const COMPLETE_TARGET_BOOST = 12; // color would finish a goal now
const ADVANCE_TARGET_BOOST = 4; // color brings a near goal one card closer

/**
 * Per-color weight boost for choosing which market card to auction: high if
 * acquiring that color would complete a goal (public or the bot's own
 * private goals), smaller if it advances a near goal (down to ≤1 card away).
 * Colors the bot doesn't need score 0.
 */
function goalTargetBoostByColor(state: GameState, botId: PlayerId): Record<Color, number> {
  const out: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return out;
  const owned: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
  let wild = 0;
  for (const c of bot.hand) {
    if (c.category !== 'stock') continue;
    if (c.color === 'Wild') wild++;
    else owned[c.color]++;
  }
  const relevantGoals: GoalCard[] = [
    ...state.goalRow,
    ...bot.hand.filter((c): c is GoalCard => c.category === 'goal')
  ];
  for (const g of relevantGoals) {
    const req = g.goal.parsed.requirements;
    let rawGap = 0;
    for (const col of COLORS) {
      const r = req[col] ?? 0;
      if (r > owned[col]) rawGap += r - owned[col];
    }
    const gapNow = Math.max(0, rawGap - wild);
    if (gapNow === 0) continue;
    const gapAfter = gapNow - 1;
    for (const col of COLORS) {
      if ((req[col] ?? 0) <= owned[col]) continue; // don't need this color
      if (gapAfter === 0) out[col] = Math.max(out[col], COMPLETE_TARGET_BOOST);
      else if (gapAfter <= 1) out[col] = Math.max(out[col], ADVANCE_TARGET_BOOST);
    }
  }
  return out;
}

/**
 * Per-color "don't sell this" usefulness: how much a HELD stock of each color is
 * committed to a goal (public or private) the bot can complete or is one card
 * away from. Used by emergency-sell to dump the least goal-useful stock
 * instead of the priciest. A color counts as useful only if the bot isn't
 * already holding surplus of it beyond what a near goal needs.
 */
function goalHoldUsefulnessByColor(state: GameState, botId: PlayerId): Record<Color, number> {
  const out: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return out;
  const owned: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
  let wild = 0;
  for (const c of bot.hand) {
    if (c.category !== 'stock') continue;
    if (c.color === 'Wild') wild++;
    else owned[c.color]++;
  }
  const relevantGoals: GoalCard[] = [
    ...state.goalRow,
    ...bot.hand.filter((c): c is GoalCard => c.category === 'goal')
  ];
  for (const g of relevantGoals) {
    const req = g.goal.parsed.requirements;
    let rawGap = 0;
    for (const col of COLORS) {
      const r = req[col] ?? 0;
      if (r > owned[col]) rawGap += r - owned[col];
    }
    const gapNow = Math.max(0, rawGap - wild);
    if (gapNow > 1) continue; // only protect completable / one-away goals
    const closeness = gapNow === 0 ? 3 : 2;
    for (const col of COLORS) {
      const r = req[col] ?? 0;
      if (r > 0 && owned[col] <= r) out[col] = Math.max(out[col], closeness);
    }
  }
  return out;
}
