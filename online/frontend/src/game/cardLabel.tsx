import type { HandCard, StockCard } from '@insider-trading/shared';
import { INDUSTRY, industryClass, relabelColors } from './theme.js';

/**
 * User-facing label for a card. For stocks we display the industry name
 * ("Steel Common Share") rather than the data color ("Blue Common Share").
 * The sub-line gets a colors→industries pass on any ability text that mentions
 * Blue/Orange/Yellow/Purple.
 */
export function describeCard(c: HandCard): { title: string; sub: string } {
  if (c.category === 'stock') {
    const industry = INDUSTRY[c.color].label;
    return {
      title: `${industry}${c.name ? ` ${c.name}` : ''}`,
      sub: relabelColors(c.ability ?? '')
    };
  }
  if (c.category === 'insider_tip') {
    return { title: 'Insider Tip', sub: relabelColors(c.text) };
  }
  return { title: c.name, sub: relabelColors(c.description) };
}

/** ind-blue / ind-orange / ind-yellow / ind-purple / ind-wild — drives CSS var. */
export function colorClass(c: HandCard): string {
  if (c.category === 'stock') return industryClass((c as StockCard).color);
  if (c.category === 'insider_tip') return 'ind-tip';
  return 'ind-action';
}
