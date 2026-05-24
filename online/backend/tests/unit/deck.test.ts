import { shuffle, draw, reshuffleDiscardIfNeeded } from '../../src/domain/deck.js';
import { makeRng } from '../../src/domain/rng.js';
import type { DeckCard } from '@insider-trading/shared';

const mk = (uid: string): DeckCard =>
  ({ category: 'stock', uid, color: 'Blue', type: 'blank' } as DeckCard);

describe('deck', () => {
  describe('shuffle', () => {
    it('returns a permutation of the input', () => {
      const input = ['a', 'b', 'c', 'd', 'e'];
      const out = shuffle(input, makeRng(1));
      expect(out.sort()).toEqual([...input].sort());
    });
    it('does not mutate the input', () => {
      const input = ['a', 'b', 'c'];
      shuffle(input, makeRng(1));
      expect(input).toEqual(['a', 'b', 'c']);
    });
    it('is deterministic for the same seed', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const out1 = shuffle(input, makeRng(99));
      const out2 = shuffle(input, makeRng(99));
      expect(out1).toEqual(out2);
    });
  });

  describe('draw', () => {
    it('removes and returns the top n cards', () => {
      const deck = ['a', 'b', 'c', 'd'];
      const drawn = draw(deck, 2);
      expect(drawn).toEqual(['a', 'b']);
      expect(deck).toEqual(['c', 'd']);
    });
  });

  describe('reshuffleDiscardIfNeeded', () => {
    it('does nothing when main deck has enough', () => {
      const main = [mk('a'), mk('b'), mk('c')];
      const disc = [mk('x')];
      const r = reshuffleDiscardIfNeeded(main, disc, 2, makeRng(1));
      expect(r.reshuffled).toBe(0);
      expect(disc).toHaveLength(1);
    });
    it('moves discard into bottom of main when short', () => {
      const main = [mk('a')];
      const disc = [mk('x'), mk('y')];
      const r = reshuffleDiscardIfNeeded(main, disc, 3, makeRng(1));
      expect(r.reshuffled).toBe(2);
      expect(disc).toHaveLength(0);
      expect(main).toHaveLength(3);
      expect(main[0].uid).toBe('a'); // existing main stays on top
    });
    it('no-ops when discard is also empty', () => {
      const main = [mk('a')];
      const disc: DeckCard[] = [];
      const r = reshuffleDiscardIfNeeded(main, disc, 3, makeRng(1));
      expect(r.reshuffled).toBe(0);
      expect(main).toHaveLength(1);
    });
  });
});
