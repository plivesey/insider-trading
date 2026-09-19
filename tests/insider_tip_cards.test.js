const data = require('../cards/insider_tip_cards.json');

const VALID_COLORS = ['Blue', 'Orange', 'Green', 'Purple'];
const VALID_TYPES = ['crash', 'surge', 'slump', 'shift'];

describe('Insider Tip Cards', () => {
  const cards = data.cards;

  test('should have exactly 28 cards', () => {
    expect(cards).toHaveLength(28);
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

  test('should have expected counts: 12 crash, 4 surge, 6 slump, 6 shift', () => {
    const counts = {};
    for (const card of cards) counts[card.type] = (counts[card.type] || 0) + 1;
    expect(counts.crash).toBe(12);
    expect(counts.surge).toBe(4);
    expect(counts.slump).toBe(6);
    expect(counts.shift).toBe(6);
  });

  test('crash cards should halve each color exactly 3 times', () => {
    const crashes = cards.filter(c => c.type === 'crash');
    const perColor = {};
    for (const color of VALID_COLORS) perColor[color] = 0;
    for (const card of crashes) {
      expect(card.effect.type).toBe('halve');
      expect(VALID_COLORS).toContain(card.effect.color);
      perColor[card.effect.color]++;
    }
    for (const color of VALID_COLORS) {
      expect(perColor[color]).toBe(3);
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

  test('slump cards should be -2 to two colors, covering all 6 color pairs, each color appearing exactly 3 times', () => {
    const slumps = cards.filter(c => c.type === 'slump');
    expect(slumps).toHaveLength(6);
    const perColor = {};
    for (const color of VALID_COLORS) perColor[color] = 0;
    const pairs = new Set();
    for (const card of slumps) {
      const entries = Object.entries(card.effect.changes);
      expect(entries).toHaveLength(2);
      for (const [color, amount] of entries) {
        expect(VALID_COLORS).toContain(color);
        expect(amount).toBe(-2);
        perColor[color]++;
      }
      pairs.add(entries.map(([c]) => c).sort().join('-'));
    }
    for (const color of VALID_COLORS) {
      expect(perColor[color]).toBe(3);
    }
    expect(pairs.size).toBe(6); // all 6 possible color pairs represented
  });

  test('shift cards should be +2 to one color and -2 to another, covering all 6 color pairs, each color appearing exactly 3 times', () => {
    const shifts = cards.filter(c => c.type === 'shift');
    expect(shifts).toHaveLength(6);
    const perColor = {};
    for (const color of VALID_COLORS) perColor[color] = 0;
    const pairs = new Set();
    for (const card of shifts) {
      const entries = Object.entries(card.effect.changes);
      expect(entries).toHaveLength(2);
      const amounts = entries.map(([, a]) => a).sort((a, b) => a - b);
      expect(amounts).toEqual([-2, 2]);
      for (const [color] of entries) {
        expect(VALID_COLORS).toContain(color);
        perColor[color]++;
      }
      pairs.add(entries.map(([c]) => c).sort().join('-'));
    }
    for (const color of VALID_COLORS) {
      expect(perColor[color]).toBe(3);
    }
    expect(pairs.size).toBe(6); // all 6 possible color pairs represented
  });

  test('non-crash cards (surge + slump + shift): Blue/Orange net 0, Green/Purple net -4', () => {
    // With 12 crash (was 8, per-color drag now scales further with price) and
    // no added surge (per design decision), Slump now hitting every color 3x
    // (-6) can't be fully offset by Surge's single +4 -- Shift (net 0 overall,
    // but only 6 cards for 4 colors) can rebalance at most 2 of the 4 colors
    // back to 0; the other 2 unavoidably absorb double the deficit. This is a
    // structural consequence of the card counts, not a bug -- see
    // v5_tuning_notes.md.
    const net = {};
    for (const color of VALID_COLORS) net[color] = 0;
    for (const card of cards) {
      if (card.type === 'surge' || card.type === 'slump' || card.type === 'shift') {
        for (const [color, amount] of Object.entries(card.effect.changes)) {
          net[color] += amount;
        }
      }
    }
    expect(net.Blue).toBe(0);
    expect(net.Orange).toBe(0);
    expect(net.Green).toBe(-4);
    expect(net.Purple).toBe(-4);
  });
});
