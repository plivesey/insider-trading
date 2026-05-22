const cards = require('../cards/crisis_cards.json');

describe('Crisis Cards', () => {
  test('should have exactly 2 cards', () => {
    expect(cards).toHaveLength(2);
  });

  test('should have type "crisis"', () => {
    for (const card of cards) {
      expect(card.type).toBe('crisis');
    }
  });

  test('should have required fields', () => {
    for (const card of cards) {
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('type');
      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('effect');
      expect(typeof card.name).toBe('string');
      expect(typeof card.effect).toBe('string');
    }
  });

  test('should have unique ids', () => {
    const ids = cards.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
