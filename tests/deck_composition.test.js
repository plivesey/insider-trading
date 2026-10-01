const stockCards = require('../cards/stock_cards.json');
const actionCards = require('../cards/action_cards.json');
const insiderTipData = require('../cards/insider_tip_cards.json');
const goalData = require('../cards/goal_cards.json');
const loanData = require('../cards/loan_cards.json');
const starterDeck = require('../cards/starter_deck.json');

describe('Deck Composition (V6)', () => {
  test('stock cards should be 36 (32 colored + 4 wild)', () => {
    expect(stockCards.length).toBe(36);
  });

  test('action cards should be 14 (11 original + Foresight/Backroom Deal/Double Down, folded in from the old Starter Deck)', () => {
    expect(actionCards.length).toBe(14);
  });

  test('market deck should be 50 cards (36 stock + 14 action)', () => {
    expect(stockCards.length + actionCards.length).toBe(50);
  });

  test('tip deck should be 28 cards (12 crash, 4 surge, 6 slump, 6 shift)', () => {
    expect(insiderTipData.cards.length).toBe(28);
  });

  test('goal pool should be 19 cards (4 pair, 4 three-of-a-kind, 6 two-pair, 4 four-of-a-kind, 1 full-spread)', () => {
    expect(goalData.cards.length).toBe(19);
  });

  test('loan cards should be 6', () => {
    expect(loanData.cards.length).toBe(6);
  });

  test('starter deck should be 8 cards (2 basic stocks per color) -- nothing else lives here anymore', () => {
    expect(starterDeck.length).toBe(8);
    for (const color of ['Blue', 'Orange', 'Green', 'Purple']) {
      expect(starterDeck.filter(c => c.color === color)).toHaveLength(2);
    }
    expect(starterDeck.every(c => c.type === 'blank')).toBe(true);
  });

  test('there are no Hot Tip (peek_cards) or crisis cards', () => {
    expect(() => require('../cards/peek_cards.json')).toThrow();
    expect(() => require('../cards/crisis_cards.json')).toThrow();
  });

  test('there is no Black Market card', () => {
    expect(actionCards.find(c => c.name === 'Black Market')).toBeUndefined();
    expect(actionCards.find(c => c.effect.type === 'auction_unused_tip')).toBeUndefined();
  });

  test('Fire Sale, First Look, Windfall, Market Panic, and all 5 hidden bonus cards no longer exist anywhere', () => {
    const dead = ['Fire Sale', 'First Look', 'Windfall', 'Market Panic', 'Nest Egg', 'Portfolio', 'Trophy Case', 'Clean Ledger', 'Easy Credit'];
    const all = [...stockCards, ...actionCards, ...starterDeck];
    for (const name of dead) {
      expect(all.find(c => c.name === name)).toBeUndefined();
    }
  });

  test('total component cards should be 111 (50 market + 28 tip + 19 goal + 6 loan + 8 starter)', () => {
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
