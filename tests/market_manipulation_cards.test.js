const data = require('../cards/market_manipulation_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'];

describe('Market Manipulation Cards (Type A)', () => {
  // Cards are not yet designed - these tests validate the structure once cards are added
  const cards = data.cards || [];

  test('TODO placeholder should exist until cards are designed', () => {
    // This test passes whether cards are designed or not
    expect(data).toBeDefined();
  });

  // The following tests will activate once cards are populated
  describe('when cards are designed', () => {
    const skip = cards.length === 0;

    (skip ? test.skip : test)('should have exactly 14 cards', () => {
      expect(cards).toHaveLength(14);
    });

    (skip ? test.skip : test)('should have unique ids', () => {
      const ids = cards.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    (skip ? test.skip : test)('should have stockChange with text and parsed fields', () => {
      for (const card of cards) {
        expect(card).toHaveProperty('stockChange');
        expect(card.stockChange).toHaveProperty('text');
        expect(card.stockChange).toHaveProperty('parsed');
        expect(typeof card.stockChange.text).toBe('string');
        expect(typeof card.stockChange.parsed).toBe('object');
      }
    });

    (skip ? test.skip : test)('should only reference valid colors', () => {
      for (const card of cards) {
        const colors = Object.keys(card.stockChange.parsed);
        for (const color of colors) {
          expect(VALID_COLORS).toContain(color);
        }
      }
    });

    (skip ? test.skip : test)('should have net-zero stock changes per color', () => {
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

    (skip ? test.skip : test)('stock changes should be integers', () => {
      for (const card of cards) {
        for (const change of Object.values(card.stockChange.parsed)) {
          expect(Number.isInteger(change)).toBe(true);
        }
      }
    });
  });
});
