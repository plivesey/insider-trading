import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');

describe('createGameState (V5)', () => {
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
    expect(g.mainDeck).toHaveLength(51 - 5);
    expect(g.goalRow).toHaveLength(4); // default initialGoalRevealCount
    expect(g.eventDeck).toHaveLength(30 - 4 - 2 * 3); // 30 total, 4 revealed, 2/player dealt out
    expect(g.players.every(p => p.cash === 25)).toBe(true);
    // Pre-draft: every player holds their dealt 4-card pile directly in `hand`
    // (the draft hasn't started yet -- that's driven by advance()/beginDraft).
    expect(g.players.every(p => p.hand.length === 4)).toBe(true);
    expect(g.players.every(p => p.loans === 0)).toBe(true);
    expect(g.stockPrices).toEqual({ Blue: 4, Orange: 4, Green: 4, Purple: 4 });
    expect(g.gameOver).toBeNull();
    expect(g.progressTracker).toBe(0);
    expect(g.progressThreshold).toBe(3 * 4); // default progressThresholdPerPlayer
    expect(g.diceBagRemaining.sort()).toEqual(['A1', 'A2', 'B1', 'B2', 'C', 'D'].sort());
    expect(g.turnPhase).toBe('setup_draft');
    expect(g.draft).toBeNull();
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
    expect(g1.goalRow.map(c => c.uid)).toEqual(g2.goalRow.map(c => c.uid));
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
      ...g.eventDeck.map(c => c.uid),
      ...g.goalRow.map(c => c.uid),
      ...g.players.flatMap(p => p.hand.map(c => c.uid))
    ];
    // Leftover undealt starter-deck cards are not in the game state, but
    // everything that IS present should be globally unique.
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('different player counts produce expected event-deck/goal-row/threshold sizes (default ruleset)', () => {
    // [players, eventDeck = 30 - 4 - 2*players, goalRow = 4, threshold = 4*players]
    const counts: Array<[number, number, number, number]> = [
      [2, 22, 4, 8],
      [3, 20, 4, 12],
      [4, 18, 4, 16],
      [5, 16, 4, 20],
      [6, 14, 4, 24]
    ];
    for (const [n, eventDeckSize, goalRowSize, threshold] of counts) {
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
      expect(g.eventDeck).toHaveLength(eventDeckSize);
      expect(g.goalRow).toHaveLength(goalRowSize);
      expect(g.progressThreshold).toBe(threshold);
      expect(g.players.every(p => p.hand.length === 4)).toBe(true);
    }
  });

  it.each([2, 3, 4, 5, 6])(
    'exactly 2*players starter-deck cards enter play; the rest are truly discarded (%i players)',
    n => {
      const ps = Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
      const g = createGameState({
        catalog,
        players: ps,
        seed: 17,
        gameId: 'g-starter-discard',
        startedAt: '2026-01-01T00:00:00.000Z'
      });
      const starterUids = new Set(catalog.starterDeck.map(c => c.uid));
      expect(starterUids.size).toBe(24);

      // Pre-draft: the only zones that can hold a starter-deck card are the
      // players' dealt 4-card piles (nothing else -- market/mainDeck are
      // built solely from the 51-card market deck, goalRow/eventDeck solely
      // from the 30-card event deck).
      const inPlay = g.players.flatMap(p => p.hand.map(c => c.uid)).filter(u => starterUids.has(u));
      expect(new Set(inPlay).size).toBe(inPlay.length); // no duplicates
      expect(inPlay).toHaveLength(2 * n); // rules.md: "2 cards per player" drawn from the starter deck

      // Every other zone a starter card could conceivably leak into must
      // contain none of the discarded uids -- confirming they are gone
      // entirely, not merely absent from `hand` by coincidence.
      const discardedUids = [...starterUids].filter(u => !inPlay.includes(u));
      expect(discardedUids).toHaveLength(24 - 2 * n);
      const otherZoneUids = new Set([
        ...g.market.map(c => c.uid),
        ...g.mainDeck.map(c => c.uid),
        ...g.discardPile.map(c => c.uid),
        ...g.goalRow.map(c => c.uid),
        ...g.eventDeck.map(c => c.uid)
      ]);
      for (const uid of discardedUids) {
        expect(otherZoneUids.has(uid)).toBe(false);
      }
    }
  );
});
