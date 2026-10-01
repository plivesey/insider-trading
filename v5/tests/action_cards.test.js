const cards = require('../cards/action_cards.json');

describe('Action Cards', () => {
  test('should have exactly 11 cards', () => {
    expect(cards).toHaveLength(11);
  });

  test('should have unique ids', () => {
    const ids = cards.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('names are unique', () => {
    const names = cards.map(c => c.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates).toEqual([]);
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

  test('should have exactly 5 persistent cards (Preferred Bidder + 4 Brokers)', () => {
    const persistent = cards.filter(c => c.persistent === true);
    expect(persistent).toHaveLength(5);
  });

  test('should have exactly 6 single-use cards', () => {
    const singleUse = cards.filter(c => c.persistent === false);
    expect(singleUse).toHaveLength(6);
  });

  test('the persistent cards should be Preferred Bidder and the 4 Brokers', () => {
    const persistentNames = cards.filter(c => c.persistent).map(c => c.name).sort();
    expect(persistentNames).toEqual(
      ['Bank Broker', 'Oil Broker', 'Preferred Bidder', 'Rail Broker', 'Steel Broker'].sort()
    );
  });

  test('Connected Broker should no longer exist', () => {
    expect(cards.find(c => c.name === 'Connected Broker')).toBeUndefined();
  });

  test('Black Market should no longer exist in V5', () => {
    expect(cards.find(c => c.name === 'Black Market')).toBeUndefined();
    expect(cards.find(c => c.effect.type === 'auction_unused_tip')).toBeUndefined();
  });

  test('should include exactly one Insider Source card that draws 2 (draw_tip)', () => {
    const draw = cards.filter(c => c.effect.type === 'draw_tip');
    expect(draw).toHaveLength(1);
    expect(draw[0].name).toBe('Insider Source');
    expect(draw[0].effect.count).toBe(2);
  });

  test('Tipster\'s Choice, The Squeeze, and Wild Speculation should no longer exist', () => {
    for (const name of ["Tipster's Choice", 'The Squeeze', 'Wild Speculation']) {
      expect(cards.find(c => c.name === name)).toBeUndefined();
    }
  });

  test('should include exactly one Broker card per color', () => {
    const brokers = cards.filter(c => c.effect.type === 'broker_discount');
    expect(brokers).toHaveLength(4);
    const colors = brokers.map(c => c.effect.color).sort();
    expect(colors).toEqual(['Blue', 'Green', 'Orange', 'Purple']);
    for (const card of brokers) {
      expect(card.persistent).toBe(true);
    }
  });

  test('effect should have a type field', () => {
    for (const card of cards) {
      expect(card.effect).toHaveProperty('type');
      expect(typeof card.effect.type).toBe('string');
    }
  });
});
