const data = require('../cards/goal_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Green', 'Purple'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'];
const VALID_GOAL_TYPES = ['pair', 'three_of_a_kind', 'two_pair', 'four_of_a_kind', 'full_spread'];

describe('Goal Cards', () => {
  const cards = data.cards;

  test('should have exactly 19 cards', () => {
    expect(cards).toHaveLength(19);
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

  test('should have 16 unique rewards (the 4 Four of a Kind goals share one reward text by design)', () => {
    const rewardTexts = cards.map(c => c.reward.text);
    expect(new Set(rewardTexts).size).toBe(16);
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

  test('full_spread goals should have difficulty medium', () => {
    const fullSpreads = cards.filter(c => c.goal.parsed.type === 'full_spread');
    for (const card of fullSpreads) {
      expect(card.difficulty).toBe('medium');
    }
  });

  test('four_of_a_kind goals should have difficulty very_hard', () => {
    const fours = cards.filter(c => c.goal.parsed.type === 'four_of_a_kind');
    for (const card of fours) {
      expect(card.difficulty).toBe('very_hard');
    }
  });

  test('should have 4 pairs, 4 three-of-a-kind, 6 two-pair, 4 four-of-a-kind, and 1 full-spread goal', () => {
    const typeCounts = {};
    for (const card of cards) {
      const type = card.goal.parsed.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    expect(typeCounts['pair']).toBe(4);
    expect(typeCounts['three_of_a_kind']).toBe(4);
    expect(typeCounts['two_pair']).toBe(6);
    expect(typeCounts['four_of_a_kind']).toBe(4);
    expect(typeCounts['full_spread']).toBe(1);
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

  test('should have one four-of-a-kind per color, requiring 4', () => {
    const fours = cards.filter(c => c.goal.parsed.type === 'four_of_a_kind');
    const fourColors = fours.map(c => Object.keys(c.goal.parsed.requirements)[0]);
    expect(fourColors.sort()).toEqual([...VALID_COLORS].sort());
    for (const card of fours) {
      expect(Object.values(card.goal.parsed.requirements)).toEqual([4]);
    }
  });

  test('full_spread should require exactly 1 of each of the 4 colors', () => {
    const fullSpreads = cards.filter(c => c.goal.parsed.type === 'full_spread');
    expect(fullSpreads).toHaveLength(1);
    const reqs = fullSpreads[0].goal.parsed.requirements;
    expect(Object.keys(reqs).sort()).toEqual([...VALID_COLORS].sort());
    for (const qty of Object.values(reqs)) expect(qty).toBe(1);
  });

  test('should have all 6 possible two-pair color combinations', () => {
    const twoPairs = cards.filter(c => c.goal.parsed.type === 'two_pair');
    const combos = twoPairs.map(c => Object.keys(c.goal.parsed.requirements).sort().join('+'));
    const expectedCombos = [
      'Blue+Orange', 'Blue+Purple', 'Blue+Green',
      'Orange+Purple', 'Green+Orange', 'Green+Purple'
    ];
    expect(combos.sort()).toEqual(expectedCombos.sort());
  });
});
