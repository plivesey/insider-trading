import type { GameState, GameLogEntry, InsiderTipCard, Color } from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import { adjust, halve } from '../domain/prices.js';
import { event } from './events.js';

/**
 * Pop the top of the insider tip deck, resolve its effect, and move it to
 * resolvedInsiderTips. Returns the events emitted.
 */
export function flipAndResolveTopTip(state: GameState, events: GameLogEntry[]): void {
  if (state.insiderTipDeck.length === 0) return;
  const tip = state.insiderTipDeck.shift()!;
  resolveTip(state, tip, events, 'die_flip');
}

/**
 * Resolve a specific Insider Tip card (already removed from the deck), apply
 * its effect, and add it to resolvedInsiderTips. Used by both the end-of-turn
 * die flip and Insider Source plays from hand.
 */
export function resolveTip(
  state: GameState,
  tip: InsiderTipCard,
  events: GameLogEntry[],
  source: 'die_flip' | 'played_from_hand'
): void {
  const before = { ...state.stockPrices };
  applyTipEffect(state, tip);
  state.resolvedInsiderTips.push(tip);
  const verb = source === 'die_flip' ? 'flipped' : 'played from hand';
  events.push(
    event('insider_tip_resolved', `Insider Tip ${verb}: ${tip.text}`, {
      payload: { uid: tip.uid, tipType: tip.type, text: tip.text, source, before, after: { ...state.stockPrices } }
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
