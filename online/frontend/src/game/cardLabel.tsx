import type { HandCard, StockCard } from '@insider-trading/shared';
import { INDUSTRY, industryClass, relabelColors } from './theme.js';

/**
 * User-facing label for a card. For stocks we display the industry name
 * ("Steel Common Share") rather than the data color ("Blue Common Share").
 * The sub-line gets a colors→industries pass on any ability text that mentions
 * Blue/Orange/Green/Purple.
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
    return { title: 'Market Movement', sub: relabelColors(c.text) };
  }
  if (c.category === 'goal') {
    return { title: relabelColors(c.goal.text), sub: relabelColors(c.reward.text) };
  }
  if (c.category === 'bonus') {
    return { title: c.name, sub: relabelColors(c.description) };
  }
  return { title: c.name, sub: relabelColors(c.description) };
}

/** ind-blue / ind-orange / ind-green / ind-purple / ind-wild / ind-goal / ind-bonus — drives CSS var. */
export function colorClass(c: HandCard): string {
  if (c.category === 'stock') return industryClass((c as StockCard).color);
  if (c.category === 'insider_tip') return 'ind-tip';
  if (c.category === 'goal') return 'ind-goal';
  if (c.category === 'bonus') return 'ind-bonus';
  return 'ind-action';
}
