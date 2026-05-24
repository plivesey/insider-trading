import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');

describe('cardLoader', () => {
  const catalog = loadCards(CARDS_DIR);

  it('loads the correct number of cards in each category', () => {
    expect(catalog.stocks).toHaveLength(36);
    expect(catalog.actions).toHaveLength(10);
    expect(catalog.insiderTips).toHaveLength(16);
    expect(catalog.goals).toHaveLength(14);
    expect(catalog.loans).toHaveLength(6);
    expect(catalog.hotTips).toHaveLength(6);
  });

  it('assigns globally-unique uids across all categories', () => {
    const all = [
      ...catalog.stocks.map(c => c.uid),
      ...catalog.actions.map(c => c.uid),
      ...catalog.insiderTips.map(c => c.uid),
      ...catalog.goals.map(c => c.uid),
      ...catalog.loans.map(c => c.uid),
      ...catalog.hotTips.map(c => c.uid)
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('preserves category discriminator on every card', () => {
    expect(catalog.stocks.every(c => c.category === 'stock')).toBe(true);
    expect(catalog.actions.every(c => c.category === 'action')).toBe(true);
    expect(catalog.insiderTips.every(c => c.category === 'insider_tip')).toBe(true);
    expect(catalog.goals.every(c => c.category === 'goal')).toBe(true);
    expect(catalog.loans.every(c => c.category === 'loan')).toBe(true);
    expect(catalog.hotTips.every(c => c.category === 'hot_tip')).toBe(true);
  });

  it('parses all 4 stock specials per color', () => {
    const colors = ['Blue', 'Orange', 'Yellow', 'Purple'] as const;
    for (const c of colors) {
      const here = catalog.stocks.filter(s => s.color === c);
      expect(here).toHaveLength(8);
      expect(here.filter(s => s.type === 'blank')).toHaveLength(4);
      expect(here.filter(s => s.type === 'extra_up')).toHaveLength(1);
      expect(here.filter(s => s.type === 'other_up')).toHaveLength(1);
      expect(here.filter(s => s.type === 'peek_buy')).toHaveLength(1);
      expect(here.filter(s => s.type === 'peek_sell')).toHaveLength(1);
    }
    expect(catalog.stocks.filter(s => s.color === 'Wild')).toHaveLength(4);
  });
});
