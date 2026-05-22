const cards = require('../cards/stock_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'];
const SPECIAL_TYPES = ['extra_up', 'other_up', 'peek_buy', 'peek_sell'];
const COLORED_TYPES = ['blank', ...SPECIAL_TYPES];

describe('Stock Cards', () => {
  const colored = cards.filter(c => c.color !== 'Wild');
  const wild = cards.filter(c => c.color === 'Wild');

  test('should have exactly 36 cards (32 colored + 4 wild)', () => {
    expect(cards).toHaveLength(36);
  });

  test('should have exactly 32 colored stock cards', () => {
    expect(colored).toHaveLength(32);
  });

  test('should have exactly 4 Wild Share cards', () => {
    expect(wild).toHaveLength(4);
  });

  test('should have exactly 8 colored cards per color', () => {
    for (const color of VALID_COLORS) {
      const colorCards = cards.filter(c => c.color === color);
      expect(colorCards).toHaveLength(8);
    }
  });

  test('colored cards should only use valid colors and types', () => {
    for (const card of colored) {
      expect(VALID_COLORS).toContain(card.color);
      expect(COLORED_TYPES).toContain(card.type);
    }
  });

  test('wild cards should have type "wild" and no usable color', () => {
    for (const card of wild) {
      expect(card.type).toBe('wild');
      expect(card.color).toBe('Wild');
    }
  });

  test('should have 4 blank cards per color', () => {
    for (const color of VALID_COLORS) {
      const blanks = cards.filter(c => c.color === color && c.type === 'blank');
      expect(blanks).toHaveLength(4);
    }
  });

  test('should have exactly 1 of each special type per color', () => {
    for (const color of VALID_COLORS) {
      for (const type of SPECIAL_TYPES) {
        const matching = cards.filter(c => c.color === color && c.type === type);
        expect(matching).toHaveLength(1);
      }
    }
  });

  test('blank cards should not have an ability field', () => {
    const blanks = cards.filter(c => c.type === 'blank');
    for (const card of blanks) {
      expect(card.ability).toBeUndefined();
    }
  });

  test('non-blank cards should have an ability description', () => {
    const specials = cards.filter(c => c.type !== 'blank');
    for (const card of specials) {
      expect(typeof card.ability).toBe('string');
      expect(card.ability.length).toBeGreaterThan(0);
    }
  });

  test('extra_up (Boom) cards should reference their own color', () => {
    const booms = cards.filter(c => c.type === 'extra_up');
    expect(booms).toHaveLength(4);
    for (const card of booms) {
      expect(card.ability).toContain(card.color);
    }
  });

  test('peek specials should mention Insider Tip', () => {
    const peeks = cards.filter(c => c.type === 'peek_buy' || c.type === 'peek_sell');
    expect(peeks).toHaveLength(8);
    for (const card of peeks) {
      expect(card.ability).toContain('Insider Tip');
    }
  });
});
