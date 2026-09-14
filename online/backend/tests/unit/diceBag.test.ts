import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_DICE, DICE, loadCards, type GameState } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { drawDieFromBag, rollDieFace } from '../../src/engine/rng.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function freshState(seed: number): GameState {
  return createGameState({
    catalog,
    players: [
      { playerId: 'p1', name: 'Alice', isBot: false },
      { playerId: 'p2', name: 'Bob', isBot: false }
    ],
    seed,
    gameId: `g-${seed}`,
    startedAt: '2026-01-01T00:00:00.000Z'
  });
}

describe('dice bag', () => {
  it('DICE has all 6 dice with 6 faces each, drawn from the known face set', () => {
    expect(ALL_DICE.sort()).toEqual(['A1', 'A2', 'B1', 'B2', 'C', 'D'].sort());
    const knownFaces = new Set(['bull', 'bear', 'nothing', 'draw1', 'draw2', 'draw3']);
    for (const die of ALL_DICE) {
      expect(DICE[die]).toHaveLength(6);
      for (const face of DICE[die]) {
        expect(knownFaces.has(face)).toBe(true);
      }
    }
  });

  it('starts full (all 6 dice) at game setup', () => {
    const state = freshState(1);
    expect(state.diceBagRemaining.slice().sort()).toEqual([...ALL_DICE].sort());
  });

  it.each([1, 2, 3, 42, 999])(
    'every consecutive window of 6 draws uses each DieId exactly once (seed %i)',
    seed => {
      const state = freshState(seed);
      const draws: string[] = [];
      // Draw across many refill cycles.
      for (let i = 0; i < 600; i++) {
        draws.push(drawDieFromBag(state));
      }
      for (let w = 0; w < draws.length; w += 6) {
        const window = draws.slice(w, w + 6);
        expect(window).toHaveLength(6);
        expect(window.slice().sort()).toEqual([...ALL_DICE].sort());
      }
    }
  );

  it('the bag empties after 6 draws and refills on the 7th', () => {
    const state = freshState(7);
    for (let i = 0; i < 6; i++) drawDieFromBag(state);
    expect(state.diceBagRemaining).toHaveLength(0);
    drawDieFromBag(state);
    // One drawn from a freshly-refilled bag of 6 -- 5 remain.
    expect(state.diceBagRemaining).toHaveLength(5);
  });

  it('rollDieFace only ever returns a face from that die\'s own table', () => {
    const state = freshState(11);
    for (const die of ALL_DICE) {
      for (let i = 0; i < 50; i++) {
        const face = rollDieFace(die, state);
        expect(DICE[die]).toContain(face);
      }
    }
  });
});
