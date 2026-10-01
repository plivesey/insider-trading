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

  test('action cards should be 11 (15 minus Tipster\'s Choice/The Squeeze/Wild Speculation, with the two Insider Source copies merged into one)', () => {
    expect(actionCards.length).toBe(11);
  });

  test('market deck should be 47 cards (36 stock + 11 action)', () => {
    expect(stockCards.length + actionCards.length).toBe(47);
  });

  test('insider tip pool should be 28 (12 crash, 4 surge, 6 slump, 6 shift)', () => {
    expect(insiderTipData.cards.length).toBe(28);
  });

  test('goal cards should be 19 (4 pair, 4 three-of-a-kind, 6 two-pair, 4 four-of-a-kind, 1 full-spread)', () => {
    expect(goalData.cards.length).toBe(19);
  });

  test('event deck should be 47 cards (28 insider tips + 19 goals)', () => {
    expect(insiderTipData.cards.length + goalData.cards.length).toBe(47);
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

  test('total component cards should be 124 (47 market + 47 event + 6 loan + 24 starter)', () => {
    const total = stockCards.length + actionCards.length
      + insiderTipData.cards.length + goalData.cards.length
      + loanData.cards.length + starterDeck.length;
    expect(total).toBe(124);
  });

  test('loan card data: $10 cash on take (the -12/-14 tiered end-game penalty is computed by the engine, not stored per-card)', () => {
    for (const loan of loanData.cards) {
      expect(loan.endGameValue).toBe(-12);
      expect(loan.cashOnTake).toBe(10);
    }
  });
});
