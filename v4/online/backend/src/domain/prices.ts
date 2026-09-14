import type { Color, GameState, StockPrices } from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';

/** Adjust one color by delta, floored at 0. Mutates and returns the price. */
export function adjust(prices: StockPrices, color: Color, delta: number): number {
  prices[color] = Math.max(0, prices[color] + delta);
  return prices[color];
}

/** Halve one color (floor), price-floor 0. Mutates and returns the new price. */
export function halve(prices: StockPrices, color: Color): number {
  prices[color] = Math.max(0, Math.floor(prices[color] / 2));
  return prices[color];
}

/** Add `delta` to every color, floored at 0. */
export function adjustAll(prices: StockPrices, delta: number): void {
  for (const c of COLORS) adjust(prices, c, delta);
}

/** Set a color to an exact value (clamped at 0). */
export function setPrice(prices: StockPrices, color: Color, value: number): void {
  prices[color] = Math.max(0, value);
}

/** Compute the current price of a card by color. Wild Shares are always $0. */
export function priceOf(state: Pick<GameState, 'stockPrices'>, color: Color | 'Wild'): number {
  if (color === 'Wild') return 0;
  return state.stockPrices[color];
}
