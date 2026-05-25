import type { InsiderTipCard, PlayerId } from '@insider-trading/shared';
import type { Rng } from '../domain/rng.js';

/**
 * Per-bot runtime state. Lives in-memory on the ServerHub, keyed by playerId.
 * Not persisted with game state — recreated if the server restarts.
 */
export interface BotProfile {
  /** Uniform on {-2, -1, 0}; offsets every stock perception. */
  stockOffset: -2 | -1 | 0;
  /** Uniform on {-2, -1, 0}; offsets every action-card perception. */
  actionOffset: -2 | -1 | 0;
  /** N in {0,1,2}: bot uses Hot Tip after exactly N insider tips have resolved. */
  hotTipThreshold: 0 | 1 | 2;
  /**
   * Per-bot valuation of a Wild Share, drawn at profile creation. Wild Shares
   * can't be sold and only matter for substituting into goal claims, so the
   * goal-bump model under-rates them when no near-term goal exists. A flat
   * 2–4 captures "they're useful eventually" without overthinking.
   */
  wildShareValue: 2 | 3 | 4;
  /**
   * Insider Tip cards the bot has peeked at and which have not yet been
   * resolved. Pruned when the engine moves them to resolvedInsiderTips.
   */
  knownPeekedTips: InsiderTipCard[];
  /**
   * Per-auction ceiling, drawn once when the bot first acts in that auction
   * (auctioneer = perceivedValue - randInt(0,3); responder = perceivedValue).
   * Keyed by `auction.cardUid` since auctions don't have their own id.
   */
  auctionCeilings: Record<string, number>;
}

export function createBotProfile(rng: Rng): BotProfile {
  const triadic = () => (rng.int(3) - 2) as -2 | -1 | 0;
  return {
    stockOffset: triadic(),
    actionOffset: triadic(),
    hotTipThreshold: rng.int(3) as 0 | 1 | 2,
    wildShareValue: (rng.int(3) + 2) as 2 | 3 | 4,
    knownPeekedTips: [],
    auctionCeilings: {}
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
