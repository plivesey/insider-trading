import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeProgressThreshold, computeGoalRevealCount, loadCards, DEFAULT_RULES } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { beginDraft, handleDraftPick } from '../../src/engine/setupDraft.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');

describe('createGameState (V6)', () => {
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
    expect(g.mainDeck).toHaveLength(50 - 5); // 36 stock + 14 action
    expect(g.goalRow).toHaveLength(6); // 3 players * goalRevealPerPlayer(1) + goalRevealBase(3)
    expect(g.tipDeck).toHaveLength(22); // 28 total - 6 drafted (50/50 split of 4*3=12)
    expect(g.goalReserve).toHaveLength(7); // (19 - 6 revealed) - 6 drafted
    expect(g.players.every(p => p.cash === 25)).toBe(true);
    // Pre-draft: every player holds their guaranteed starter stock (visible
    // immediately) plus their 4-card draftable pile, directly in `hand` (the
    // draft hasn't started yet -- that's driven by advance()/beginDraft).
    expect(g.players.every(p => p.hand.length === 5)).toBe(true);
    expect(g.players.every(p => p.loans === 0)).toBe(true);
    expect(g.stockPrices).toEqual({ Blue: 4, Orange: 4, Green: 4, Purple: 4 });
    expect(g.gameOver).toBeNull();
    expect(g.progressTracker).toBe(0);
    expect(g.progressThreshold).toBe(3 * 3 + 3); // 3 players: progressThresholdPerPlayer=3, base=3 -> 12
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
      ...g.tipDeck.map(c => c.uid),
      ...g.goalReserve.map(c => c.uid),
      ...g.goalRow.map(c => c.uid),
      ...g.players.flatMap(p => p.hand.map(c => c.uid))
    ];
    // Leftover undealt starter-stock cards are not in the game state, but
    // everything that IS present should be globally unique.
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('different player counts produce expected tip-deck/goal-reserve/goal-row/threshold sizes (default ruleset)', () => {
    // [players, tipDeckSize, goalReserveSize, goalRowSize, threshold] -- see
    // the splitDraftPool clamp-and-backfill math: at 6 players the goal
    // reserve (10 cards: 19 - goalRevealCount(6)=9) runs out before the
    // draft pool's half-share (12), so the shortfall backfills from the tip
    // deck instead (goalReserve bottoms out at 0, tipDeck absorbs the extra).
    const counts: Array<[number, number, number, number, number]> = [
      [2, 24, 10, 5, 9],
      [3, 22, 7, 6, 12],
      [4, 20, 4, 7, 15],
      [5, 18, 1, 8, 18],
      [6, 14, 0, 9, 21]
    ];
    for (const [n, tipDeckSize, goalReserveSize, goalRowSize, threshold] of counts) {
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
      expect(g.tipDeck).toHaveLength(tipDeckSize);
      expect(g.goalReserve).toHaveLength(goalReserveSize);
      expect(g.goalRow).toHaveLength(goalRowSize);
      expect(g.progressThreshold).toBe(threshold);
      expect(g.players.every(p => p.hand.length === 5)).toBe(true);
    }
  });

  it('6-player goal-reserve shortfall never throws and still deals the right total per player', () => {
    // The one player count where the goal reserve (10 cards) runs out before
    // the draft pool's 50/50 half-share (12) -- splitDraftPool must backfill
    // the shortfall from the tip deck rather than under-dealing.
    const ps = Array.from({ length: 6 }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
    for (let seed = 1; seed <= 20; seed++) {
      const g = createGameState({
        catalog,
        players: ps,
        seed,
        gameId: `6p-${seed}`,
        startedAt: '2026-01-01T00:00:00.000Z'
      });
      expect(g.goalReserve.length).toBeGreaterThanOrEqual(0);
      expect(g.players.every(p => p.hand.length === 5)).toBe(true);
      const totalDraftCards = g.players.reduce((sum, p) => sum + p.hand.length - 1, 0); // minus starter stock
      expect(totalDraftCards).toBe(4 * 6);
    }
  });

  it('builds a 4-player game with the expected shape', () => {
    const ps = Array.from({ length: 4 }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
    const g = createGameState({
      catalog,
      players: ps,
      seed: 3,
      gameId: 'g-1',
      startedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(g.market).toHaveLength(5);
    expect(g.mainDeck).toHaveLength(50 - 5); // 36 stock + 14 action

    // Pre-draft: every player holds 5 cards -- their guaranteed starter
    // stock (visible immediately) plus 4 tip/goal draft candidates.
    expect(g.players.every(p => p.hand.length === 5)).toBe(true);
    for (const p of g.players) {
      const stocks = p.hand.filter(c => c.category === 'stock');
      const draftCards = p.hand.filter(c => c.category === 'insider_tip' || c.category === 'goal');
      expect(stocks).toHaveLength(1);
      expect(stocks[0].uid.startsWith('starter-stock-')).toBe(true);
      expect(draftCards).toHaveLength(4);
    }
    const uids = g.players.map(p => p.hand.find(c => c.category === 'stock')!.uid);
    expect(new Set(uids).size).toBe(uids.length);

    expect(g.progressThreshold).toBe(computeProgressThreshold(4, DEFAULT_RULES));
    expect(g.progressThreshold).toBe(15);
    expect(g.goalRow).toHaveLength(computeGoalRevealCount(4, DEFAULT_RULES));

    // None of the deleted Classic-only cards ever appear -- they no longer
    // exist in any card JSON at all, not just "never dealt".
    const forbiddenNames = new Set(['First Look', 'Fire Sale', 'Windfall', 'Market Panic', 'Nest Egg', 'Portfolio', 'Trophy Case', 'Clean Ledger', 'Easy Credit']);
    const marketAndDeck = [...g.market, ...g.mainDeck];
    for (const c of marketAndDeck) {
      if ('name' in c && c.name) expect(forbiddenNames.has(c.name)).toBe(false);
    }
  });

  it.each([2, 3, 4, 5, 6])('progress threshold is 3x players + 3 (%i players)', n => {
    const ps = Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
    const g = createGameState({
      catalog,
      players: ps,
      seed: 11,
      gameId: `threshold-${n}`,
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    expect(g.progressThreshold).toBe(3 * n + 3);
  });

  it('the guaranteed starter stock is visible in hand immediately, before and throughout the draft', () => {
    const ps = Array.from({ length: 3 }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
    const g = createGameState({
      catalog,
      players: ps,
      seed: 21,
      gameId: 'draft-test',
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    const startingStockUids = new Map(g.players.map(p => [p.playerId, p.hand.find(c => c.category === 'stock')!.uid]));

    const events: any[] = [];
    beginDraft(g, events);
    // The stock never entered the draft pool -- it's still sitting in hand
    // right through every round, and each round's candidate count reflects
    // only the 4 (then 3, then 2) draftable tip/goal cards, not the stock.
    for (const p of g.players) {
      expect(p.hand.map(c => c.uid)).toEqual([startingStockUids.get(p.playerId)]);
    }
    expect(Object.values(g.draft!.hands).every(h => h.length === 4)).toBe(true);

    for (let round = 1; round <= 3; round++) {
      for (const p of g.players) {
        const candidateUid = g.draft!.hands[p.playerId][0].uid;
        handleDraftPick(g, p.playerId, candidateUid, events);
      }
    }

    expect(g.draft).toBeNull();
    for (const p of g.players) {
      expect(p.hand).toHaveLength(4);
      expect(p.hand.some(c => c.uid === startingStockUids.get(p.playerId))).toBe(true);
    }
  });
});
