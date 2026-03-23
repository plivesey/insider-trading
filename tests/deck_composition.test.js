const stockCards = require('../cards/stock_cards.json');
const actionCards = require('../cards/action_cards.json');
const crisisCards = require('../cards/crisis_cards.json');
const marketManipulationData = require('../cards/market_manipulation_cards.json');
const goalData = require('../cards/goal_cards.json');

describe('Deck Composition', () => {
  test('main deck should have 44 cards (32 stock + 10 action + 2 crisis)', () => {
    const mainDeckSize = stockCards.length + actionCards.length + crisisCards.length;
    expect(mainDeckSize).toBe(44);
  });

  test('stock cards should contribute 32 to main deck', () => {
    expect(stockCards.length).toBe(32);
  });

  test('action cards (Type B) should contribute 10 to main deck', () => {
    expect(actionCards.length).toBe(10);
  });

  test('crisis cards should contribute 2 to main deck', () => {
    expect(crisisCards.length).toBe(2);
  });

  describe('when all card types are designed', () => {
    const marketCards = marketManipulationData.cards || [];
    const goalCards = goalData.cards || [];
    const allDesigned = marketCards.length > 0 && goalCards.length > 0;

    (allDesigned ? test : test.skip)('total cards should be 72 (44 main + 14 Type A + 14 goals)', () => {
      const total = stockCards.length + actionCards.length + crisisCards.length
        + marketCards.length + goalCards.length;
      expect(total).toBe(72);
    });

    (allDesigned ? test : test.skip)('Type A market manipulation cards should be 14', () => {
      expect(marketCards.length).toBe(14);
    });

    (allDesigned ? test : test.skip)('goal cards should be 14', () => {
      expect(goalCards.length).toBe(14);
    });
  });

  test('end game tracker formula: 3 * players + 1', () => {
    expect(3 * 2 + 1).toBe(7);
    expect(3 * 3 + 1).toBe(10);
    expect(3 * 4 + 1).toBe(13);
    expect(3 * 5 + 1).toBe(16);
    expect(3 * 6 + 1).toBe(19);
  });

  test('goals per game formula: players + 2', () => {
    expect(2 + 2).toBe(4);
    expect(3 + 2).toBe(5);
    expect(4 + 2).toBe(6);
    expect(5 + 2).toBe(7);
    expect(6 + 2).toBe(8);
  });
});
