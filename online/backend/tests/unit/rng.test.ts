import { makeRng } from '../../src/domain/rng.js';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = makeRng(1234);
    const b = makeRng(1234);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
  it('diverges for different seeds', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a.next()).not.toBe(b.next());
  });
  it('int(max) returns values in [0, max)', () => {
    const r = makeRng(42);
    for (let i = 0; i < 200; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});
