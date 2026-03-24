const data = require('../cards/market_manipulation_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'];
const VALID_TYPES = ['single_down', 'double_up', 'mixed_up', 'mixed_down'];

describe('Market Manipulation Cards (Type A)', () => {
  const cards = data.cards;

  test('should have exactly 14 cards', () => {
    expect(cards).toHaveLength(14);
  });

  test('should have unique ids', () => {
    const ids = cards.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('should have stockChange with text and parsed fields', () => {
    for (const card of cards) {
      expect(card).toHaveProperty('stockChange');
      expect(card.stockChange).toHaveProperty('text');
      expect(card.stockChange).toHaveProperty('parsed');
      expect(typeof card.stockChange.text).toBe('string');
      expect(typeof card.stockChange.parsed).toBe('object');
    }
  });

  test('should only use valid card types', () => {
    for (const card of cards) {
      expect(VALID_TYPES).toContain(card.type);
    }
  });

  test('should only reference valid colors in stock changes', () => {
    for (const card of cards) {
      const colors = Object.keys(card.stockChange.parsed);
      for (const color of colors) {
        expect(VALID_COLORS).toContain(color);
      }
    }
  });

  test('stock changes should be integers', () => {
    for (const card of cards) {
      for (const change of Object.values(card.stockChange.parsed)) {
        expect(Number.isInteger(change)).toBe(true);
      }
    }
  });

  test('should have net-zero stock changes per color when all cards are played', () => {
    const netChanges = {};
    for (const color of VALID_COLORS) {
      netChanges[color] = 0;
    }

    for (const card of cards) {
      for (const [color, change] of Object.entries(card.stockChange.parsed)) {
        netChanges[color] += change;
      }
    }

    for (const color of VALID_COLORS) {
      expect(netChanges[color]).toBe(0);
    }
  });

  test('should have no more than 4 cards of any single type', () => {
    const typeCounts = {};
    for (const card of cards) {
      typeCounts[card.type] = (typeCounts[card.type] || 0) + 1;
    }

    for (const [type, count] of Object.entries(typeCounts)) {
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  test('each color should appear on between 5 and 7 cards (inclusive)', () => {
    const colorAppearances = {};
    for (const color of VALID_COLORS) {
      colorAppearances[color] = 0;
    }

    for (const card of cards) {
      const colors = Object.keys(card.stockChange.parsed);
      for (const color of colors) {
        colorAppearances[color]++;
      }
    }

    for (const color of VALID_COLORS) {
      expect(colorAppearances[color]).toBeGreaterThanOrEqual(5);
      expect(colorAppearances[color]).toBeLessThanOrEqual(7);
    }
  });
});
