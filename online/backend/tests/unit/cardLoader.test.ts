import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');

describe('cardLoader', () => {
  const catalog = loadCards(CARDS_DIR);

  it('loads the correct number of cards in each category', () => {
    expect(catalog.stocks).toHaveLength(36);
    expect(catalog.actions).toHaveLength(15);
    expect(catalog.insiderTips).toHaveLength(16);
    expect(catalog.goals).toHaveLength(14);
    expect(catalog.loans).toHaveLength(6);
    expect(catalog.starterDeck).toHaveLength(24);
  });

  it('assigns globally-unique uids across all categories', () => {
    const all = [
      ...catalog.stocks.map(c => c.uid),
      ...catalog.actions.map(c => c.uid),
      ...catalog.insiderTips.map(c => c.uid),
      ...catalog.goals.map(c => c.uid),
      ...catalog.loans.map(c => c.uid),
      ...catalog.starterDeck.map(c => c.uid)
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('preserves category discriminator on every card', () => {
    expect(catalog.stocks.every(c => c.category === 'stock')).toBe(true);
    expect(catalog.actions.every(c => c.category === 'action')).toBe(true);
    expect(catalog.insiderTips.every(c => c.category === 'insider_tip')).toBe(true);
    expect(catalog.goals.every(c => c.category === 'goal')).toBe(true);
    expect(catalog.loans.every(c => c.category === 'loan')).toBe(true);
    expect(catalog.starterDeck.every(c => ['stock', 'action', 'bonus'].includes(c.category))).toBe(true);
  });

  it('parses all 4 stock specials per color, using Green (not Yellow)', () => {
    const colors = ['Blue', 'Orange', 'Green', 'Purple'] as const;
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
    expect(catalog.stocks.some(s => (s.color as string) === 'Yellow')).toBe(false);
  });

  it('starter deck has 12 basic stocks (3/color) and 12 starter action cards (7 playable + 5 hidden bonus)', () => {
    const starterStocks = catalog.starterDeck.filter(c => c.category === 'stock');
    expect(starterStocks).toHaveLength(12);
    for (const color of ['Blue', 'Orange', 'Green', 'Purple'] as const) {
      expect(starterStocks.filter(c => c.category === 'stock' && c.color === color)).toHaveLength(3);
    }
    const actions = catalog.starterDeck.filter(c => c.category === 'action');
    const bonuses = catalog.starterDeck.filter(c => c.category === 'bonus');
    expect(actions).toHaveLength(7);
    expect(bonuses).toHaveLength(5);
  });

  it('has no Black Market card and no Hot Tip cards left in V5', () => {
    expect(catalog.actions.find(c => c.name === 'Black Market')).toBeUndefined();
    expect(() => require('node:fs').readFileSync(path.join(CARDS_DIR, 'peek_cards.json'))).toThrow();
  });
});
