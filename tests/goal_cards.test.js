const data = require('../cards/goal_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

describe('Goal Cards', () => {
  // Cards are not yet designed - these tests validate the structure once cards are added
  const cards = data.cards || [];

  test('TODO placeholder should exist until cards are designed', () => {
    expect(data).toBeDefined();
  });

  // The following tests will activate once cards are populated
  describe('when cards are designed', () => {
    const skip = cards.length === 0;

    (skip ? test.skip : test)('should have exactly 14 cards', () => {
      expect(cards).toHaveLength(14);
    });

    (skip ? test.skip : test)('should have unique ids', () => {
      const ids = cards.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    (skip ? test.skip : test)('should have goal with text and parsed fields', () => {
      for (const card of cards) {
        expect(card).toHaveProperty('goal');
        expect(card.goal).toHaveProperty('text');
        expect(card.goal).toHaveProperty('parsed');
        expect(card.goal.parsed).toHaveProperty('type');
        expect(card.goal.parsed).toHaveProperty('requirements');
      }
    });

    (skip ? test.skip : test)('should have reward with text and parsed fields', () => {
      for (const card of cards) {
        expect(card).toHaveProperty('reward');
        expect(card.reward).toHaveProperty('text');
        expect(card.reward).toHaveProperty('parsed');
      }
    });

    (skip ? test.skip : test)('should have a valid difficulty tier', () => {
      for (const card of cards) {
        expect(card).toHaveProperty('difficulty');
        expect(VALID_DIFFICULTIES).toContain(card.difficulty);
      }
    });

    (skip ? test.skip : test)('should only reference valid colors in requirements', () => {
      for (const card of cards) {
        const colors = Object.keys(card.goal.parsed.requirements);
        for (const color of colors) {
          expect(VALID_COLORS).toContain(color);
        }
      }
    });

    (skip ? test.skip : test)('requirement quantities should be positive integers', () => {
      for (const card of cards) {
        for (const qty of Object.values(card.goal.parsed.requirements)) {
          expect(Number.isInteger(qty)).toBe(true);
          expect(qty).toBeGreaterThan(0);
        }
      }
    });
  });
});
