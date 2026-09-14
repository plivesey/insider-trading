const stockCards = require('../cards/stock_cards.json');
const actionCards = require('../cards/action_cards.json');
const insiderTipData = require('../cards/insider_tip_cards.json');
const goalData = require('../cards/goal_cards.json');
const loanData = require('../cards/loan_cards.json');
const starterDeck = require('../cards/starter_deck.json');

describe('Deck Composition (V5)', () => {
  test('stock cards should be 36 (32 colored + 4 wild)', () => {
    expect(stockCards.length).toBe(36);
  });

  test('action cards should be 15 (11 carried over from V4 + 4 new Broker cards)', () => {
    expect(actionCards.length).toBe(15);
  });

  test('market deck should be 51 cards (36 stock + 15 action)', () => {
    expect(stockCards.length + actionCards.length).toBe(51);
  });

  test('insider tip pool should be 16', () => {
    expect(insiderTipData.cards.length).toBe(16);
  });

  test('goal cards should be 14', () => {
    expect(goalData.cards.length).toBe(14);
  });

  test('event deck should be 30 cards (16 insider tips + 14 goals)', () => {
    expect(insiderTipData.cards.length + goalData.cards.length).toBe(30);
  });

  test('loan cards should be 6', () => {
    expect(loanData.cards.length).toBe(6);
  });

  test('starter deck should be 24 cards (12 basic stocks + 12 starter actions)', () => {
    expect(starterDeck.length).toBe(24);
  });

  test('starter deck should have 12 basic stock cards, 3 per color', () => {
    const stocks = starterDeck.filter(c => c.color !== undefined);
    expect(stocks).toHaveLength(12);
    for (const color of ['Blue', 'Orange', 'Green', 'Purple']) {
      expect(stocks.filter(c => c.color === color)).toHaveLength(3);
    }
  });

  test('starter deck should have 12 action cards: 7 playable + 5 hidden bonus', () => {
    const actions = starterDeck.filter(c => c.effect !== undefined);
    expect(actions).toHaveLength(12);
    expect(actions.filter(c => c.hidden === false)).toHaveLength(7);
    expect(actions.filter(c => c.hidden === true)).toHaveLength(5);
  });

  test('there are no Hot Tip (peek_cards) or crisis cards in V5', () => {
    expect(() => require('../cards/peek_cards.json')).toThrow();
    expect(() => require('../cards/crisis_cards.json')).toThrow();
  });

  test('there is no Black Market card in V5', () => {
    expect(actionCards.find(c => c.name === 'Black Market')).toBeUndefined();
    expect(actionCards.find(c => c.effect.type === 'auction_unused_tip')).toBeUndefined();
  });

  test('total component cards should be 111 (51 market + 30 event + 6 loan + 24 starter)', () => {
    const total = stockCards.length + actionCards.length
      + insiderTipData.cards.length + goalData.cards.length
      + loanData.cards.length + starterDeck.length;
    expect(total).toBe(111);
  });

  test('loan card data: $10 cash on take (the -12/-14 tiered end-game penalty is computed by the engine, not stored per-card)', () => {
    for (const loan of loanData.cards) {
      expect(loan.endGameValue).toBe(-12);
      expect(loan.cashOnTake).toBe(10);
    }
  });
});
