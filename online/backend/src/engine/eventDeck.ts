import type { Color, GameLogEntry, GameState, GoalCard, InsiderTipCard } from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import { adjust, halve } from '../domain/prices.js';
import { event } from './events.js';
import { checkSimultaneousGoalClaims } from './goals.js';

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
 * Resolve one card popped off the top of the event deck (via a dice draw):
 * a market-movement card resolves immediately; a goal card is placed
 * face-up in the public goal row (does NOT bump the tracker on its own --
 * only claiming it later does) and is immediately checked for the rare
 * simultaneous-claim case.
 */
function resolveEventCard(state: GameState, card: InsiderTipCard | GoalCard, events: GameLogEntry[]): void {
  if (card.category === 'insider_tip') {
    resolveMarketMovementCard(state, card, events, 'drawn');
    return;
  }
  state.goalRow.push(card);
  events.push(
    event('goal_revealed', `A new public goal is revealed: "${card.goal.text}" (reward: ${card.reward.text})`, {
      payload: { goalUid: card.uid, goalText: card.goal.text, rewardText: card.reward.text }
    })
  );
  checkSimultaneousGoalClaims(state, card, events);
}

/**
 * Draw up to `n` cards from the top of the event deck, resolving each in
 * sequence (order matters -- e.g. a same-color crash and surge drawn
 * together resolve in the order they came up) before moving to the next.
 * Stops early only if the deck runs out (expected to be essentially
 * unreachable given its size) -- no other special handling.
 */
export function drawFromEventDeck(state: GameState, n: number, events: GameLogEntry[]): void {
  for (let i = 0; i < n; i++) {
    const card = state.eventDeck.shift();
    if (!card) return;
    resolveEventCard(state, card, events);
  }
}

/**
 * Draw `n` cards off the top of the event deck directly into a player's
 * hand, unresolved (used by Insider Source and the `draw_tips`/`draw_deck_tip`
 * goal rewards). A market-movement card drawn this way is playable later as
 * a free action; a goal card drawn this way is simply a private goal from
 * that point on -- privacy is purely positional (in a hand = private), so no
 * extra bookkeeping is needed.
 */
export function drawEventCardsIntoHand(state: GameState, n: number): (InsiderTipCard | GoalCard)[] {
  return state.eventDeck.splice(0, Math.min(n, state.eventDeck.length));
}
