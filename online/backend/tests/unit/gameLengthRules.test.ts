import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  DEFAULT_RULES,
  computeProgressThreshold,
  type GameState,
  type RulesConfig
} from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { checkProgressThreshold } from '../../src/engine/turn.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function mkState(rules?: Partial<RulesConfig>, seed = 1): GameState {
  return createGameState({
    catalog,
    players: [
      { playerId: 'p1', name: 'Alice' },
      { playerId: 'p2', name: 'Bob' },
      { playerId: 'p3', name: 'Carol' }
    ],
    seed,
    gameId: 'g',
    startedAt: '2026-01-01T00:00:00.000Z',
    rules
  });
}

describe('RulesConfig plumbing (V5)', () => {
  it('the shipped default ruleset has initialGoalRevealCount=4 and progressThresholdPerPlayer=4', () => {
    const s = mkState(); // no override → DEFAULT_RULES
    expect(s.rules).toEqual(DEFAULT_RULES);
    expect(s.goalRow).toHaveLength(4);
    expect(s.progressThreshold).toBe(3 * 4);
  });

  it('initialGoalRevealCount controls how many goals are revealed at setup', () => {
    expect(mkState({ initialGoalRevealCount: 2 }).goalRow).toHaveLength(2);
    expect(mkState({ initialGoalRevealCount: 6 }).goalRow).toHaveLength(6);
  });

  it('progressThresholdPerPlayer scales the end-game threshold', () => {
    expect(mkState({ progressThresholdPerPlayer: 3 }).progressThreshold).toBe(9);
    expect(mkState({ progressThresholdPerPlayer: 5 }).progressThreshold).toBe(15);
  });

  it('computeProgressThreshold matches setup for every player count 2-6', () => {
    for (let n = 2; n <= 6; n++) {
      const ps = Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
      const s = createGameState({
        catalog,
        players: ps,
        seed: 1,
        gameId: 'g',
        startedAt: '2026-01-01T00:00:00.000Z'
      });
      expect(s.progressThreshold).toBe(computeProgressThreshold(n, DEFAULT_RULES));
    }
  });
});

describe('checkProgressThreshold: V5\'s sole end condition', () => {
  it('does not end the game while the tracker is below threshold', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold - 1;
    checkProgressThreshold(s, []);
    expect(s.gameOver).toBeNull();
  });

  it('ends the game the instant the tracker reaches the threshold', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold;
    checkProgressThreshold(s, []);
    expect(s.gameOver).not.toBeNull();
    expect(s.gameOver!.reason).toBe('progress_threshold_reached');
  });

  it('ends the game if the tracker exceeds the threshold too (defensive)', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold + 5;
    checkProgressThreshold(s, []);
    expect(s.gameOver).not.toBeNull();
  });

  it('is a no-op once the game is already over', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold;
    checkProgressThreshold(s, []);
    const firstEndedAt = s.gameOver!.endedAt;
    checkProgressThreshold(s, []);
    expect(s.gameOver!.endedAt).toBe(firstEndedAt);
  });
});
