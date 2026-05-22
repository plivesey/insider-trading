const cards = require('../cards/action_cards.json');

describe('Action Cards (Type B)', () => {
  test('should have exactly 10 cards', () => {
    expect(cards).toHaveLength(10);
  });

  test('should have unique ids', () => {
    const ids = cards.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('should have unique names', () => {
    const names = cards.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('should have required fields on every card', () => {
    for (const card of cards) {
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('description');
      expect(card).toHaveProperty('persistent');
      expect(card).toHaveProperty('effect');
      expect(typeof card.name).toBe('string');
      expect(typeof card.description).toBe('string');
      expect(typeof card.persistent).toBe('boolean');
    }
  });

  test('should have exactly 2 persistent cards', () => {
    const persistent = cards.filter(c => c.persistent === true);
    expect(persistent).toHaveLength(2);
  });

  test('should have exactly 8 single-use cards', () => {
    const singleUse = cards.filter(c => c.persistent === false);
    expect(singleUse).toHaveLength(8);
  });

  test('persistent cards should be Connected Broker and Preferred Bidder', () => {
    const persistentNames = cards.filter(c => c.persistent).map(c => c.name).sort();
    expect(persistentNames).toEqual(['Connected Broker', 'Preferred Bidder']);
  });

  test('effect should have a type field', () => {
    for (const card of cards) {
      expect(card.effect).toHaveProperty('type');
      expect(typeof card.effect.type).toBe('string');
    }
  });
});
