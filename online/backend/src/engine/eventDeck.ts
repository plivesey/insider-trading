import type { Color, GameLogEntry, GameState, InsiderTipCard } from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import { adjust, halve } from '../domain/prices.js';
import { event } from './events.js';

/**
 * Resolve a market-movement (Insider Tip) card: apply its price effect, log
 * it, move it to resolvedEventCards, and bump the progress tracker by 1.
 * `source` distinguishes a dice-bag draw from a card played out of hand
 * (Insider Source, or a market-movement card drafted at setup) for the log
 * message only -- both bump the tracker identically.
 */
export function resolveMarketMovementCard(
  state: GameState,
  tip: InsiderTipCard,
  events: GameLogEntry[],
  source: 'drawn' | 'played_from_hand'
): void {
  const before = { ...state.stockPrices };
  applyTipEffect(state, tip);
  state.resolvedEventCards.push(tip);
  state.progressTracker += 1;
  const verb = source === 'drawn' ? 'drawn' : 'played from hand';
  events.push(
    event('market_movement_resolved', `Market movement ${verb}: ${tip.text}`, {
      payload: {
        uid: tip.uid,
        tipType: tip.type,
        text: tip.text,
        source,
        before,
        after: { ...state.stockPrices },
        progressTracker: state.progressTracker
      }
    })
  );
}

export function applyTipEffect(state: GameState, tip: InsiderTipCard): void {
  if (tip.effect.type === 'halve') {
    halve(state.stockPrices, tip.effect.color);
  } else {
    for (const [color, delta] of Object.entries(tip.effect.changes) as [Color, number][]) {
      adjust(state.stockPrices, color, delta);
    }
  }
}

export function adjustAllStocks(state: GameState, delta: number): void {
  for (const c of COLORS) {
    adjust(state.stockPrices, c, delta);
  }
}

/**
 * Draw up to `n` cards from the top of the tip deck, resolving each in
 * sequence (order matters -- e.g. a same-color crash and surge drawn
 * together resolve in the order they came up) before moving to the next.
 * Dice "draw" faces are tip-only in V6 -- goals are never drawn mid-game,
 * only revealed at setup (see domain/setup.ts) -- so there's no goal branch
 * here anymore. Stops early only if the deck runs out (expected to be
 * essentially unreachable given its size) -- no other special handling.
 */
export function drawFromTipDeck(state: GameState, n: number, events: GameLogEntry[]): void {
  for (let i = 0; i < n; i++) {
    const card = state.tipDeck.shift();
    if (!card) return;
    resolveMarketMovementCard(state, card, events, 'drawn');
  }
}

/**
 * Draw `n` cards off the top of the tip deck directly into a player's hand,
 * unresolved (used by Insider Source and the `draw_tips`/`draw_deck_tip`
 * goal rewards). Playable later as a free action.
 */
export function drawTipCardsIntoHand(state: GameState, n: number): InsiderTipCard[] {
  return state.tipDeck.splice(0, Math.min(n, state.tipDeck.length));
}
