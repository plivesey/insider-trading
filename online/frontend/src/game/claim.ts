import type { Color, HandCard, StockCard } from '@insider-trading/shared';
import { INDUSTRY_ORDER } from './theme.js';

const COLORS: Color[] = INDUSTRY_ORDER;

/**
 * Try to build the unique stock-assignment for this goal from the player's
 * hand. Returns the assignment plus a flag indicating whether the player has
 * any meaningful choice in how to satisfy it.
 *
 * "Unambiguous" means: for each required color the player owns *exactly* the
 * needed count of that color (no surplus to choose from), and Wild Shares are
 * either unused or used in full. In all other cases the player should pick.
 */
export function buildCanonicalAssignment(
  hand: HandCard[],
  requirements: Partial<Record<Color, number>>
): { assignment: Record<string, Color>; unambiguous: boolean } | null {
  const stocks = hand.filter((c): c is StockCard => c.category === 'stock');
  const wilds = stocks.filter(c => c.color === 'Wild');
  const byColor: Partial<Record<Color, StockCard[]>> = {};
  for (const c of stocks) {
    if (c.color === 'Wild') continue;
    const arr = byColor[c.color] ?? [];
    arr.push(c);
    byColor[c.color] = arr;
  }
  let ambiguous = false;
  const assignment: Record<string, Color> = {};
  let wildsUsed = 0;
  for (const color of COLORS) {
    const need = requirements[color] ?? 0;
    if (need <= 0) continue;
    const available = byColor[color] ?? [];
    if (available.length >= need) {
      if (available.length > need) ambiguous = true;
      for (let i = 0; i < need; i++) assignment[available[i].uid] = color;
    } else {
      for (const c of available) assignment[c.uid] = color;
      const gap = need - available.length;
      if (wilds.length - wildsUsed < gap) return null;
      for (let i = 0; i < gap; i++) {
        assignment[wilds[wildsUsed + i].uid] = color;
      }
      wildsUsed += gap;
    }
  }
  if (wildsUsed > 0 && wildsUsed < wilds.length) ambiguous = true;
  return { assignment, unambiguous: !ambiguous };
}
