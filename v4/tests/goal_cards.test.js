const data = require('../cards/goal_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'];
const VALID_DIFFICULTIES = ['easy', 'hard'];
const VALID_GOAL_TYPES = ['pair', 'three_of_a_kind', 'two_pair'];

describe('Goal Cards', () => {
  const cards = data.cards;

  test('should have exactly 14 cards', () => {
    expect(cards).toHaveLength(14);
  });

  test('should have unique ids', () => {
    const ids = cards.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('should have goal with text and parsed fields', () => {
    for (const card of cards) {
      expect(card).toHaveProperty('goal');
      expect(card.goal).toHaveProperty('text');
      expect(card.goal).toHaveProperty('parsed');
      expect(card.goal.parsed).toHaveProperty('type');
      expect(card.goal.parsed).toHaveProperty('requirements');
    }
  });

  test('should have reward with text and parsed fields', () => {
    for (const card of cards) {
      expect(card).toHaveProperty('reward');
      expect(card.reward).toHaveProperty('text');
      expect(card.reward).toHaveProperty('parsed');
    }
  });

  test('should have a valid difficulty tier', () => {
    for (const card of cards) {
      expect(card).toHaveProperty('difficulty');
      expect(VALID_DIFFICULTIES).toContain(card.difficulty);
    }
  });

  test('should only use valid goal types', () => {
    for (const card of cards) {
      expect(VALID_GOAL_TYPES).toContain(card.goal.parsed.type);
    }
  });

  test('should only reference valid colors in requirements', () => {
    for (const card of cards) {
      const colors = Object.keys(card.goal.parsed.requirements);
      for (const color of colors) {
        expect(VALID_COLORS).toContain(color);
      }
    }
  });

  test('requirement quantities should be positive integers', () => {
    for (const card of cards) {
      for (const qty of Object.values(card.goal.parsed.requirements)) {
        expect(Number.isInteger(qty)).toBe(true);
        expect(qty).toBeGreaterThan(0);
      }
    }
  });

  test('each color should have exactly equal total cards required across all goals', () => {
    const colorTotals = {};
    for (const color of VALID_COLORS) {
      colorTotals[color] = 0;
    }

    for (const card of cards) {
      for (const [color, qty] of Object.entries(card.goal.parsed.requirements)) {
        colorTotals[color] += qty;
      }
    }

    const values = Object.values(colorTotals);
    const expected = values[0];
    for (const color of VALID_COLORS) {
      expect(colorTotals[color]).toBe(expected);
    }
  });

  test('should have 14 unique rewards', () => {
    const rewardTexts = cards.map(c => c.reward.text);
    expect(new Set(rewardTexts).size).toBe(14);
  });

  test('pair goals should have difficulty easy', () => {
    const pairs = cards.filter(c => c.goal.parsed.type === 'pair');
    for (const card of pairs) {
      expect(card.difficulty).toBe('easy');
    }
  });

  test('three_of_a_kind and two_pair goals should have difficulty hard', () => {
    const hardGoals = cards.filter(c =>
      c.goal.parsed.type === 'three_of_a_kind' || c.goal.parsed.type === 'two_pair'
    );
    for (const card of hardGoals) {
      expect(card.difficulty).toBe('hard');
    }
  });

  test('should have 4 pairs, 4 three-of-a-kind, and 6 two-pair goals', () => {
    const typeCounts = {};
    for (const card of cards) {
      const type = card.goal.parsed.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    expect(typeCounts['pair']).toBe(4);
    expect(typeCounts['three_of_a_kind']).toBe(4);
    expect(typeCounts['two_pair']).toBe(6);
  });

  test('should have one pair per color', () => {
    const pairs = cards.filter(c => c.goal.parsed.type === 'pair');
    const pairColors = pairs.map(c => Object.keys(c.goal.parsed.requirements)[0]);
    expect(pairColors.sort()).toEqual([...VALID_COLORS].sort());
  });

  test('should have one three-of-a-kind per color', () => {
    const threes = cards.filter(c => c.goal.parsed.type === 'three_of_a_kind');
    const threeColors = threes.map(c => Object.keys(c.goal.parsed.requirements)[0]);
    expect(threeColors.sort()).toEqual([...VALID_COLORS].sort());
  });

  test('should have all 6 possible two-pair color combinations', () => {
    const twoPairs = cards.filter(c => c.goal.parsed.type === 'two_pair');
    const combos = twoPairs.map(c => Object.keys(c.goal.parsed.requirements).sort().join('+'));
    const expectedCombos = [
      'Blue+Orange', 'Blue+Purple', 'Blue+Yellow',
      'Orange+Purple', 'Orange+Yellow', 'Purple+Yellow'
    ];
    expect(combos.sort()).toEqual(expectedCombos.sort());
  });
});
