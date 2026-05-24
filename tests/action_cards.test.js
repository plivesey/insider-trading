const cards = require('../cards/action_cards.json');

describe('Action Cards', () => {
  // 11th slot is open — Stock Certificate Forgery removed pending replacement.
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

  test('should have exactly 1 persistent card', () => {
    const persistent = cards.filter(c => c.persistent === true);
    expect(persistent).toHaveLength(1);
  });

  test('should have exactly 9 single-use cards', () => {
    const singleUse = cards.filter(c => c.persistent === false);
    expect(singleUse).toHaveLength(9);
  });

  test('the persistent card should be Preferred Bidder', () => {
    const persistentNames = cards.filter(c => c.persistent).map(c => c.name);
    expect(persistentNames).toEqual(['Preferred Bidder']);
  });

  test('Connected Broker should no longer exist', () => {
    expect(cards.find(c => c.name === 'Connected Broker')).toBeUndefined();
  });

  test('should include two tip-reorder cards', () => {
    const reorder = cards.filter(c => c.effect.type === 'peek_reorder_tips');
    expect(reorder).toHaveLength(2);
  });

  test('effect should have a type field', () => {
    for (const card of cards) {
      expect(card.effect).toHaveProperty('type');
      expect(typeof card.effect.type).toBe('string');
    }
  });
});
