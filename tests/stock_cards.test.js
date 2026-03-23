const cards = require('../cards/stock_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'];
const SPECIAL_TYPES = ['stock_up', 'stock_down', 'hype', 'insider'];
const ALL_TYPES = ['blank', ...SPECIAL_TYPES];

describe('Stock Cards', () => {
  test('should have exactly 32 cards', () => {
    expect(cards).toHaveLength(32);
  });

  test('should have exactly 8 cards per color', () => {
    for (const color of VALID_COLORS) {
      const colorCards = cards.filter(c => c.color === color);
      expect(colorCards).toHaveLength(8);
    }
  });

  test('should only use valid colors', () => {
    for (const card of cards) {
      expect(VALID_COLORS).toContain(card.color);
    }
  });

  test('should only use valid types', () => {
    for (const card of cards) {
      expect(ALL_TYPES).toContain(card.type);
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

  test('special cards should have an ability description', () => {
    const specials = cards.filter(c => c.type !== 'blank');
    for (const card of specials) {
      expect(typeof card.ability).toBe('string');
      expect(card.ability.length).toBeGreaterThan(0);
    }
  });

  test('hype cards should reference their own color', () => {
    const hypeCards = cards.filter(c => c.type === 'hype');
    for (const card of hypeCards) {
      expect(card.ability).toContain(card.color);
    }
  });
});
