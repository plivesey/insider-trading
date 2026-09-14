import type { DieFace, DieId, GameState } from '@insider-trading/shared';
import { ALL_DICE, DICE } from '@insider-trading/shared';
import { makeRng, type Rng } from '../domain/rng.js';

/**
 * Stateful RNG bound to a game's `seed` + `rngCursor`. Bumps cursor on each
 * call so replays of the same event sequence land on the same values.
 */
export function nextRng(state: GameState): Rng {
  state.rngCursor += 1;
  return makeRng(((state.seed * 1000003) ^ state.rngCursor) >>> 0);
}

/**
 * Draw one die at random (without replacement) from the shared bag. If the
 * bag is empty, refill it with all 6 dice first -- so the draw right after
 * the 6th consumes a fresh cycle, and every 6 consecutive draws use each die
 * exactly once (order unknown).
 */
export function drawDieFromBag(state: GameState): DieId {
  if (state.diceBagRemaining.length === 0) {
    state.diceBagRemaining = [...ALL_DICE];
  }
  const rng = nextRng(state);
  const idx = rng.int(state.diceBagRemaining.length);
  return state.diceBagRemaining.splice(idx, 1)[0];
}

/** Roll one of a die's 6 faces, uniformly at random. */
export function rollDieFace(dieId: DieId, state: GameState): DieFace {
  const faces = DICE[dieId];
  const rng = nextRng(state);
  return faces[rng.int(faces.length)];
}
