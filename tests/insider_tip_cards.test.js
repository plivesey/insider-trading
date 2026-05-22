const data = require('../cards/insider_tip_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'];
const VALID_TYPES = ['crash', 'surge', 'slump'];

describe('Insider Tip Cards', () => {
  const cards = data.cards;

  test('should have exactly 16 cards', () => {
    expect(cards).toHaveLength(16);
  });

  test('should have unique ids', () => {
    const ids = cards.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every card should have type, text, and effect', () => {
    for (const card of cards) {
      expect(VALID_TYPES).toContain(card.type);
      expect(typeof card.text).toBe('string');
      expect(card.text.length).toBeGreaterThan(0);
      expect(card.effect).toHaveProperty('type');
    }
  });

  test('should have expected counts: 8 crash, 4 surge, 4 slump', () => {
    const counts = {};
    for (const card of cards) counts[card.type] = (counts[card.type] || 0) + 1;
    expect(counts.crash).toBe(8);
    expect(counts.surge).toBe(4);
    expect(counts.slump).toBe(4);
  });

  test('crash cards should halve each color exactly twice', () => {
    const crashes = cards.filter(c => c.type === 'crash');
    const perColor = {};
    for (const color of VALID_COLORS) perColor[color] = 0;
    for (const card of crashes) {
      expect(card.effect.type).toBe('halve');
      expect(VALID_COLORS).toContain(card.effect.color);
      perColor[card.effect.color]++;
    }
    for (const color of VALID_COLORS) {
      expect(perColor[color]).toBe(2);
    }
  });

  test('surge cards should be +4 to one color, one per color', () => {
    const surges = cards.filter(c => c.type === 'surge');
    const colors = [];
    for (const card of surges) {
      const entries = Object.entries(card.effect.changes);
      expect(entries).toHaveLength(1);
      expect(entries[0][1]).toBe(4);
      colors.push(entries[0][0]);
    }
    expect(colors.sort()).toEqual([...VALID_COLORS].sort());
  });

  test('slump cards should be -2 to two colors, each color appearing exactly twice', () => {
    const slumps = cards.filter(c => c.type === 'slump');
    expect(slumps).toHaveLength(4);
    const perColor = {};
    for (const color of VALID_COLORS) perColor[color] = 0;
    for (const card of slumps) {
      const entries = Object.entries(card.effect.changes);
      expect(entries).toHaveLength(2);
      for (const [color, amount] of entries) {
        expect(VALID_COLORS).toContain(color);
        expect(amount).toBe(-2);
        perColor[color]++;
      }
    }
    for (const color of VALID_COLORS) {
      expect(perColor[color]).toBe(2);
    }
  });

  test('the 8 non-crash cards should be color-balanced (each color nets 0)', () => {
    const net = {};
    for (const color of VALID_COLORS) net[color] = 0;
    for (const card of cards) {
      if (card.type === 'surge' || card.type === 'slump') {
        for (const [color, amount] of Object.entries(card.effect.changes)) {
          net[color] += amount;
        }
      }
    }
    for (const color of VALID_COLORS) {
      expect(net[color]).toBe(0);
    }
  });
});
