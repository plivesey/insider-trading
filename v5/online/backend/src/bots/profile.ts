import type { InsiderTipCard, PlayerId } from '@insider-trading/shared';
import type { Rng } from '../domain/rng.js';
import type { ValueNetWeights } from './valueNet.js';
import { defaultBotParams, type BotParams } from './botParams.js';

/**
 * Per-bot runtime state. Lives in-memory on the ServerHub, keyed by playerId.
 * Not persisted with game state — recreated if the server restarts.
 */
export interface BotProfile {
  /** Stock-perception offset. Randomized for variety, or a single tuned value. */
  stockOffset: number;
  /** Action-card-perception offset. Randomized for variety, or a single tuned value. */
  actionOffset: number;
  /** Bot uses Hot Tip after this many insider tips have resolved. */
  hotTipThreshold: number;
  /**
   * Per-bot valuation of a Wild Share. Wild Shares can't be sold and only matter
   * for substituting into goal claims, so the goal-bump model under-rates them
   * when no near-term goal exists.
   */
  wildShareValue: number;
  /**
   * Insider Tip cards the bot has peeked at and which have not yet been
   * resolved. Pruned when the engine moves them to resolvedInsiderTips.
   */
  knownPeekedTips: InsiderTipCard[];
  /**
   * Per-auction cached perceived value, computed once when the bot first acts in
   * that auction. Keyed by `auction.cardUid` since auctions don't have their own id.
   */
  auctionCeilings: Record<string, number>;
  /**
   * Per-auction random bid offset r∈{0..3}, drawn once when the bot first engages
   * an auction. The bot opens at `maxBid - r` and climbs by the minimum legal
   * raise up to `maxBid`, so it tries to win below its ceiling. Keyed by
   * `auction.cardUid`.
   */
  auctionBidOffsets: Record<string, number>;
  /**
   * Optional trained stock-valuation net. When present, the bot values stock
   * cards (and Wild Shares) with the net instead of the hand-written heuristic;
   * everything downstream (bid ceiling, loans) is unchanged. Immutable — carries
   * no per-game state, so it is safe to share an object across games. Absent ⇒
   * pure-heuristic bot.
   */
  valueNet?: ValueNetWeights;
  /**
   * All other tunable bot constants (bidding, action-card valuation, goal
   * weighting, etc.). The four personality fields above mirror `params`. Defaults
   * reproduce today's behavior; the optimizer (scripts/trainBotParams.ts) searches
   * over these.
   */
  params: BotParams;
  /**
   * Strategy for the experimental "Market Order" buy-from-market card (only
   * relevant when rules.startingBuyCard is on). 'pairs' = buy when the market
   * shows two of a color; 'goal' = buy a stock that completes a goal. Assigned
   * 50/50 per bot. Undefined ⇒ never plays the card.
   */
  buyCardStrategy?: 'pairs' | 'goal';
  /**
   * Emergency-sell trigger: sell a stock for cash when `cash < emergencySellCash`
   * (a param) AND `loans >= emergencySellMinLoans`. Defaults to 1 (today's
   * behavior). Exposed so the sell threshold can be A/B-tested.
   */
  emergencySellMinLoans?: number;
  /**
   * Stagnation tracking for the "force-play a market-movement card" endgame
   * fallback. A bot normally only plays a market-movement card from its hand
   * when it's currently beneficial to itself -- rational in isolation, but if
   * every remaining holder of an event-deck-origin card in every player's
   * hand is simultaneously in that position, the progress tracker can never
   * reach its threshold and the game never ends. Keyed off `state.turnNumber`
   * (a global counter) rather than a per-bot call count, since bots earlier
   * in turn order can starve later bots of decision calls for long stretches
   * (e.g. a multi-round auction only ever asks the awaiting bidder). Reset
   * per game.
   */
  lastSeenProgressTracker: number;
  /** `state.turnNumber` as of the last time `lastSeenProgressTracker` changed. */
  lastProgressTurn: number;
  /**
   * How many action cards this bot has played in a row during its own
   * still-pending turn action (see decide.ts's MAX_OWN_TURN_ACTION_CARDS
   * cap), and the `state.turnNumber` this streak applies to. Reset per game
   * and whenever `state.turnNumber` moves.
   */
  ownTurnActionCardStreak: number;
  ownTurnStreakTurnNumber: number;
}

export function createBotProfile(rng: Rng): BotProfile {
  // Randomized personality for variety; all other constants are the defaults.
  const stockOffset = rng.int(3); // 0..2
  const actionOffset = rng.int(3) - 2; // -2..0
  const hotTipThreshold = rng.int(3); // 0..2
  const wildShareValue = rng.int(4) + 3; // 3..6
  return {
    stockOffset,
    actionOffset,
    hotTipThreshold,
    wildShareValue,
    knownPeekedTips: [],
    auctionCeilings: {},
    auctionBidOffsets: {},
    params: { ...defaultBotParams(), stockOffset, actionOffset, hotTipThreshold, wildShareValue },
    buyCardStrategy: rng.int(2) === 0 ? 'pairs' : 'goal',
    lastSeenProgressTracker: -1,
    lastProgressTurn: 0,
    ownTurnActionCardStreak: 0,
    ownTurnStreakTurnNumber: -1
  };
}

/**
 * Return a fresh profile that uses `net` for stock valuation, with the two
 * mutable per-game fields (`knownPeekedTips`, `auctionCeilings`) reset. Use this
 * to seat a bot for one game/episode — reusing a profile across games would leak
 * stale ceilings and peeked tips and corrupt training fitness.
 */
export function withValueNet(base: BotProfile, net?: ValueNetWeights): BotProfile {
  return {
    ...base,
    valueNet: net,
    knownPeekedTips: [],
    auctionCeilings: {},
    auctionBidOffsets: {},
    lastSeenProgressTracker: -1,
    lastProgressTurn: 0,
    ownTurnActionCardStreak: 0,
    ownTurnStreakTurnNumber: -1
  };
}

const BOT_NAME_POOL = [
  'Rockefeller',
  'Vanderbilt',
  'Carnegie',
  'Morgan',
  'Astor',
  'Getty',
  'Hearst',
  'Du Pont',
  'Mellon',
  'Frick'
];

export function pickBotName(taken: Set<string>, rng: Rng): string {
  const available = BOT_NAME_POOL.filter(n => !taken.has(n));
  if (available.length > 0) return rng.pick(available);
  // Fallback: append a digit.
  for (let i = 2; i < 100; i++) {
    for (const base of BOT_NAME_POOL) {
      const candidate = `${base} ${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
  return `Bot-${Math.floor(Math.random() * 10000)}`;
}
