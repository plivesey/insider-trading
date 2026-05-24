import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');

describe('createGameState', () => {
  const catalog = loadCards(CARDS_DIR);
  const players3 = [
    { playerId: 'p1', name: 'Alice' },
    { playerId: 'p2', name: 'Bob' },
    { playerId: 'p3', name: 'Carol' }
  ];

  it('initializes a 3-player game with correct counts', () => {
    const g = createGameState({
      catalog,
      players: players3,
      seed: 42,
      gameId: 'test-game-1',
      startedAt: '2026-05-23T00:00:00.000Z'
    });
    expect(g.players).toHaveLength(3);
    expect(g.market).toHaveLength(5);
    expect(g.insiderTipDeck).toHaveLength(5); // 2*3-1
    expect(g.activeGoals).toHaveLength(5); // 3+2
    expect(g.mainDeck).toHaveLength(36 + 11 - 5);
    expect(g.players.every(p => p.cash === 30)).toBe(true);
    expect(g.players.every(p => p.hotTipAvailable)).toBe(true);
    expect(g.stockPrices).toEqual({ Blue: 4, Orange: 4, Yellow: 4, Purple: 4 });
    expect(g.gameOver).toBeNull();
    expect(g.eventCounter).toBe(1);
    expect(g.log).toHaveLength(1);
    expect(g.log[0].type).toBe('game_start');
  });

  it('respects seed (deterministic shuffle)', () => {
    const g1 = createGameState({
      catalog,
      players: players3,
      seed: 99,
      gameId: 'a',
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    const g2 = createGameState({
      catalog,
      players: players3,
      seed: 99,
      gameId: 'b',
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    expect(g1.market.map(c => c.uid)).toEqual(g2.market.map(c => c.uid));
    expect(g1.activeGoals.map(c => c.uid)).toEqual(g2.activeGoals.map(c => c.uid));
    expect(g1.currentPlayerIndex).toEqual(g2.currentPlayerIndex);
  });

  it('rejects illegal player counts', () => {
    expect(() =>
      createGameState({
        catalog,
        players: [{ playerId: 'x', name: 'X' }],
        seed: 1,
        gameId: 'g',
        startedAt: '2026-01-01T00:00:00.000Z'
      })
    ).toThrow();
    expect(() =>
      createGameState({
        catalog,
        players: Array.from({ length: 7 }, (_, i) => ({
          playerId: `p${i}`,
          name: `P${i}`
        })),
        seed: 1,
        gameId: 'g',
        startedAt: '2026-01-01T00:00:00.000Z'
      })
    ).toThrow();
  });

  it('all cards in the universe have unique uids', () => {
    const g = createGameState({
      catalog,
      players: players3,
      seed: 7,
      gameId: 'g',
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    const uids: string[] = [
      ...g.market.map(c => c.uid),
      ...g.mainDeck.map(c => c.uid),
      ...g.insiderTipDeck.map(c => c.uid),
      ...g.activeGoals.map(c => c.uid)
    ];
    // Unused tips & goals & hot tips & loans are not in the game state, but the
    // ones that ARE present should all be unique.
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('different player counts produce expected tip/goal sizes', () => {
    const counts: Array<[number, number, number]> = [
      [2, 3, 4],
      [3, 5, 5],
      [4, 7, 6],
      [5, 9, 7],
      [6, 11, 8]
    ];
    for (const [n, tips, goals] of counts) {
      const ps = Array.from({ length: n }, (_, i) => ({
        playerId: `p${i}`,
        name: `P${i}`
      }));
      const g = createGameState({
        catalog,
        players: ps,
        seed: 5,
        gameId: 'g',
        startedAt: '2026-01-01T00:00:00.000Z'
      });
      expect(g.insiderTipDeck).toHaveLength(tips);
      expect(g.activeGoals).toHaveLength(goals);
    }
  });
});
