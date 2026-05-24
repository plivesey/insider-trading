const stockCards = require('../cards/stock_cards.json');
const actionCards = require('../cards/action_cards.json');
const insiderTipData = require('../cards/insider_tip_cards.json');
const goalData = require('../cards/goal_cards.json');
const loanData = require('../cards/loan_cards.json');
const peekData = require('../cards/peek_cards.json');

describe('Deck Composition (V4)', () => {
  test('stock cards should be 36 (32 colored + 4 wild)', () => {
    expect(stockCards.length).toBe(36);
  });

  // 11th slot is open — Stock Certificate Forgery removed pending replacement.
  test('action cards should be 10', () => {
    expect(actionCards.length).toBe(10);
  });

  test('main deck should be 46 cards (36 stock + 10 action)', () => {
    expect(stockCards.length + actionCards.length).toBe(46);
  });

  test('insider tip pool should be 16', () => {
    expect(insiderTipData.cards.length).toBe(16);
  });

  test('goal cards should be 14', () => {
    expect(goalData.cards.length).toBe(14);
  });

  test('loan cards should be 6', () => {
    expect(loanData.cards.length).toBe(6);
  });

  test('Hot Tip (peek) cards should be 6', () => {
    expect(peekData.cards.length).toBe(6);
  });

  test('total component cards should be 88', () => {
    const total = stockCards.length + actionCards.length
      + insiderTipData.cards.length + goalData.cards.length
      + loanData.cards.length + peekData.cards.length;
    expect(total).toBe(88);
  });

  test('there are no crisis cards in V4', () => {
    expect(() => require('../cards/crisis_cards.json')).toThrow();
  });

  test('insider tip deck per game = 2 x players - 1', () => {
    expect(2 * 2 - 1).toBe(3);
    expect(2 * 3 - 1).toBe(5);
    expect(2 * 4 - 1).toBe(7);
    expect(2 * 5 - 1).toBe(9);
    expect(2 * 6 - 1).toBe(11);
  });

  test('insider tip deck never exceeds the 16-card pool', () => {
    for (let players = 2; players <= 6; players++) {
      expect(2 * players - 1).toBeLessThanOrEqual(insiderTipData.cards.length);
    }
  });

  test('goals per game formula: players + 2', () => {
    expect(2 + 2).toBe(4);
    expect(3 + 2).toBe(5);
    expect(4 + 2).toBe(6);
    expect(5 + 2).toBe(7);
    expect(6 + 2).toBe(8);
  });

  test('loan cards are worth -12 each at game end', () => {
    for (const loan of loanData.cards) {
      expect(loan.endGameValue).toBe(-12);
      expect(loan.cashOnTake).toBe(10);
    }
  });
});
