import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');

describe('cardLoader', () => {
  const catalog = loadCards(CARDS_DIR);

  it('loads the correct number of cards in each category', () => {
    expect(catalog.stocks).toHaveLength(36);
    // 11 original + Foresight/Backroom Deal/Double Down, folded in directly
    // now that Classic (and the separate 24-card Starter Deck it needed) no
    // longer exists.
    expect(catalog.actions).toHaveLength(14);
    expect(catalog.insiderTips).toHaveLength(28);
    expect(catalog.goals).toHaveLength(19);
    expect(catalog.loans).toHaveLength(6);
  });

  it('derives the 8-card starter stock deck (2 per color)', () => {
    expect(catalog.starterStocks).toHaveLength(8);
    expect(catalog.starterStocks.every(c => c.category === 'stock')).toBe(true);
    for (const color of ['Blue', 'Orange', 'Green', 'Purple'] as const) {
      expect(catalog.starterStocks.filter(c => c.category === 'stock' && c.color === color)).toHaveLength(2);
    }
  });

  it('assigns globally-unique uids across all categories', () => {
    const all = [
      ...catalog.stocks.map(c => c.uid),
      ...catalog.actions.map(c => c.uid),
      ...catalog.insiderTips.map(c => c.uid),
      ...catalog.goals.map(c => c.uid),
      ...catalog.loans.map(c => c.uid),
      ...catalog.starterStocks.map(c => c.uid)
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('preserves category discriminator on every card', () => {
    expect(catalog.stocks.every(c => c.category === 'stock')).toBe(true);
    expect(catalog.actions.every(c => c.category === 'action')).toBe(true);
    expect(catalog.insiderTips.every(c => c.category === 'insider_tip')).toBe(true);
    expect(catalog.goals.every(c => c.category === 'goal')).toBe(true);
    expect(catalog.loans.every(c => c.category === 'loan')).toBe(true);
    expect(catalog.starterStocks.every(c => c.category === 'stock')).toBe(true);
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

  it('includes Foresight, Backroom Deal, and Double Down as ordinary action cards', () => {
    const names = catalog.actions.map(c => c.name);
    for (const n of ['Foresight', 'Backroom Deal', 'Double Down']) {
      expect(names).toContain(n);
    }
    expect(catalog.actions.every(c => c.persistent === false || c.persistent === true)).toBe(true);
  });

  it('has no Classic-only dead cards left anywhere -- Fire Sale, First Look, Windfall, Market Panic, or any hidden bonus card', () => {
    const forbidden = new Set([
      'Fire Sale',
      'First Look',
      'Windfall',
      'Market Panic',
      'Nest Egg',
      'Portfolio',
      'Trophy Case',
      'Clean Ledger',
      'Easy Credit'
    ]);
    const all = [...catalog.stocks, ...catalog.actions, ...catalog.starterStocks];
    for (const c of all) {
      if ('name' in c && c.name) expect(forbidden.has(c.name)).toBe(false);
    }
  });

  it('has no Black Market card and no Hot Tip cards left in V6', () => {
    expect(catalog.actions.find(c => c.name === 'Black Market')).toBeUndefined();
    expect(() => require('node:fs').readFileSync(path.join(CARDS_DIR, 'peek_cards.json'))).toThrow();
  });
});
