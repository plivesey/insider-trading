import type { GameState } from '@insider-trading/shared';
import { makeRng, type Rng } from '../domain/rng.js';

/**
 * Stateful RNG bound to a game's `seed` + `rngCursor`. Bumps cursor on each
 * call so replays of the same event sequence land on the same values.
 */
export function nextRng(state: GameState): Rng {
  state.rngCursor += 1;
  return makeRng(((state.seed * 1000003) ^ state.rngCursor) >>> 0);
}

export function rollD6(state: GameState): number {
  return nextRng(state).int(6) + 1;
}
