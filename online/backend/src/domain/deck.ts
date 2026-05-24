import type { DeckCard } from '@insider-trading/shared';
import type { Rng } from './rng.js';

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draw n cards off the top of `mainDeck`. If the deck does not have enough
 * cards, the caller is responsible for reshuffling discard first (see
 * `reshuffleDiscardIfNeeded`). Returns drawn cards and mutates `mainDeck` in
 * place to remove them.
 */
export function draw<T>(mainDeck: T[], n: number): T[] {
  return mainDeck.splice(0, n);
}

/**
 * If `mainDeck` doesn't have at least `needed` cards, shuffle the discard pile
 * into the bottom of the main deck. (Insider Tips are not discarded back —
 * once resolved they're gone forever; this function operates on the regular
 * deck/discard only.)
 */
export function reshuffleDiscardIfNeeded(
  mainDeck: DeckCard[],
  discard: DeckCard[],
  needed: number,
  rng: Rng
): { reshuffled: number } {
  if (mainDeck.length >= needed) return { reshuffled: 0 };
  if (discard.length === 0) return { reshuffled: 0 };
  const reshuffled = shuffle(discard, rng);
  const moved = reshuffled.length;
  mainDeck.push(...reshuffled);
  discard.length = 0;
  return { reshuffled: moved };
}
