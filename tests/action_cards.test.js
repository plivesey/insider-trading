const cards = require('../cards/action_cards.json');

describe('Action Cards', () => {
  test('should have exactly 13 cards', () => {
    expect(cards).toHaveLength(13);
  });

  test('should have unique ids', () => {
    const ids = cards.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('names are unique except for duplicates explicitly allowed in the deck', () => {
    // Insider Source and Black Market each have two copies by design.
    const names = cards.map(c => c.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i).sort();
    expect(duplicates).toEqual(['Black Market', 'Insider Source']);
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

  test('should have exactly 12 single-use cards', () => {
    const singleUse = cards.filter(c => c.persistent === false);
    expect(singleUse).toHaveLength(12);
  });

  test('the persistent card should be Preferred Bidder', () => {
    const persistentNames = cards.filter(c => c.persistent).map(c => c.name);
    expect(persistentNames).toEqual(['Preferred Bidder']);
  });

  test('Connected Broker should no longer exist', () => {
    expect(cards.find(c => c.name === 'Connected Broker')).toBeUndefined();
  });

  test('should include two Insider Source cards (draw_tip)', () => {
    const draw = cards.filter(c => c.effect.type === 'draw_tip');
    expect(draw).toHaveLength(2);
    expect(draw.every(c => c.name === 'Insider Source')).toBe(true);
  });

  test('should include two Black Market cards (auction_unused_tip)', () => {
    const bm = cards.filter(c => c.effect.type === 'auction_unused_tip');
    expect(bm).toHaveLength(2);
    expect(bm.every(c => c.name === 'Black Market')).toBe(true);
  });

  test('effect should have a type field', () => {
    for (const card of cards) {
      expect(card.effect).toHaveProperty('type');
      expect(typeof card.effect.type).toBe('string');
    }
  });
});
