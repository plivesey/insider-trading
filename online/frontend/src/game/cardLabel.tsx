import type { HandCard, StockCard } from '@insider-trading/shared';

export function describeCard(c: HandCard): { title: string; sub: string } {
  if (c.category === 'stock') {
    return {
      title: `${c.color}${c.name ? ` ${c.name}` : ''}`,
      sub: c.ability ?? ''
    };
  }
  return { title: c.name, sub: c.description };
}

export function colorClass(c: HandCard): string {
  if (c.category === 'stock') return `card stock ${(c as StockCard).color}`;
  return 'card action';
}
