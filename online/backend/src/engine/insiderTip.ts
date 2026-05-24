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
  const before = { ...state.stockPrices };
  applyTipEffect(state, tip);
  state.resolvedInsiderTips.push(tip);
  events.push(
    event('insider_tip_resolved', `Insider Tip flipped: ${tip.text}`, {
      payload: { uid: tip.uid, tipType: tip.type, text: tip.text, before, after: { ...state.stockPrices } }
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
