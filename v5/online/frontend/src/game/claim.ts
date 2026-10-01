import type { Color, HandCard, StockCard } from '@insider-trading/shared';
import { INDUSTRY_ORDER } from './theme.js';

const COLORS: Color[] = INDUSTRY_ORDER;

/**
 * Build the stock-assignment for this goal from the player's hand, using as
 * few Wild Shares as possible: real stock of the required color first, Wild
 * Shares only to fill whatever gap remains. Returns null if unsatisfiable.
 *
 * Which specific card covers a given color is never a meaningful choice --
 * non-Wild cards aren't consumed by claiming (so owning a surplus changes
 * nothing) and Wild Shares are interchangeable -- so there's exactly one
 * canonical assignment whenever the goal is satisfiable at all. `wildsUsed`
 * tells the caller how many Wild Shares this claim would spend, so it can
 * warn the player before they commit.
 */
export function buildCanonicalAssignment(
  hand: HandCard[],
  requirements: Partial<Record<Color, number>>
): { assignment: Record<string, Color>; wildsUsed: number } | null {
  const stocks = hand.filter((c): c is StockCard => c.category === 'stock');
  const wilds = stocks.filter(c => c.color === 'Wild');
  const byColor: Partial<Record<Color, StockCard[]>> = {};
  for (const c of stocks) {
    if (c.color === 'Wild') continue;
    const arr = byColor[c.color] ?? [];
    arr.push(c);
    byColor[c.color] = arr;
  }
  const assignment: Record<string, Color> = {};
  let wildsUsed = 0;
  for (const color of COLORS) {
    const need = requirements[color] ?? 0;
    if (need <= 0) continue;
    const available = byColor[color] ?? [];
    for (let i = 0; i < Math.min(need, available.length); i++) assignment[available[i].uid] = color;
    const gap = need - available.length;
    if (gap > 0) {
      if (wilds.length - wildsUsed < gap) return null;
      for (let i = 0; i < gap; i++) {
        assignment[wilds[wildsUsed + i].uid] = color;
      }
      wildsUsed += gap;
    }
  }
  return { assignment, wildsUsed };
}
