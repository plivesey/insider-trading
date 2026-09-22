import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeProgressThreshold, loadCards, ALTERNATE_DEFAULT_RULES } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { beginDraft, handleDraftPick } from '../../src/engine/setupDraft.js';

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
    expect(g.variant).toBe('classic');
    expect(g.players).toHaveLength(3);
    expect(g.market).toHaveLength(5);
    expect(g.mainDeck).toHaveLength(47 - 5);
    expect(g.goalRow).toHaveLength(4); // default initialGoalRevealCount
    expect(g.eventDeck).toHaveLength(47 - 4 - 2 * 3); // 47 total, 4 revealed, 2/player dealt out
    expect(g.players.every(p => p.cash === 25)).toBe(true);
    // Pre-draft: every player holds their dealt 4-card pile directly in `hand`
    // (the draft hasn't started yet -- that's driven by advance()/beginDraft).
    expect(g.players.every(p => p.hand.length === 4)).toBe(true);
    expect(g.players.every(p => p.loans === 0)).toBe(true);
    expect(g.stockPrices).toEqual({ Blue: 4, Orange: 4, Green: 4, Purple: 4 });
    expect(g.gameOver).toBeNull();
    expect(g.progressTracker).toBe(0);
    expect(g.progressThreshold).toBe(3 * 3 + 2); // 3 players: progressThresholdPerPlayer=3, base=2 → 11
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
    // [players, eventDeck = 47 - 4 - 2*players, goalRow = 4, threshold = 3*players + 2]
    const counts: Array<[number, number, number, number]> = [
      [2, 39, 4, 8],
      [3, 37, 4, 11],
      [4, 35, 4, 14],
      [5, 33, 4, 17],
      [6, 31, 4, 20]
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
      // built solely from the 47-card market deck, goalRow/eventDeck solely
      // from the 47-card event deck).
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

describe('createGameState -- Alternate variant', () => {
  const catalog = loadCards(CARDS_DIR);

  it('builds a 4-player Alternate game with the expected shape', () => {
    const ps = Array.from({ length: 4 }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
    const g = createGameState({
      catalog,
      players: ps,
      seed: 3,
      gameId: 'alt-1',
      startedAt: '2026-01-01T00:00:00.000Z',
      variant: 'alternate'
    });

    expect(g.variant).toBe('alternate');
    expect(g.market).toHaveLength(5);
    expect(g.mainDeck).toHaveLength(50 - 5); // 36 stock + 14 action (11 shared + 3 promoted)

    // Pre-draft: every player holds 5 cards -- their guaranteed starter
    // stock (visible immediately) plus 4 event-deck-only draft candidates.
    expect(g.players.every(p => p.hand.length === 5)).toBe(true);
    for (const p of g.players) {
      const stocks = p.hand.filter(c => c.category === 'stock');
      const eventCards = p.hand.filter(c => c.category === 'insider_tip' || c.category === 'goal');
      expect(stocks).toHaveLength(1);
      expect(stocks[0].uid.startsWith('alt-starter-stock-')).toBe(true);
      expect(eventCards).toHaveLength(4);
    }
    const uids = g.players.map(p => p.hand.find(c => c.category === 'stock')!.uid);
    expect(new Set(uids).size).toBe(uids.length);

    expect(g.progressThreshold).toBe(computeProgressThreshold(4, ALTERNATE_DEFAULT_RULES));
    expect(g.progressThreshold).toBe(17);

    // None of the Classic-only starter actions/bonus cards ever appear.
    const forbiddenNames = new Set(['First Look', 'Fire Sale', 'Windfall', 'Market Panic', 'Nest Egg', 'Portfolio', 'Trophy Case', 'Clean Ledger', 'Easy Credit']);
    const marketAndDeck = [...g.market, ...g.mainDeck];
    for (const c of marketAndDeck) {
      if ('name' in c && c.name) expect(forbiddenNames.has(c.name)).toBe(false);
    }
  });

  it.each([2, 3, 4, 5, 6])('progress threshold is 4x players + 1 (%i players)', n => {
    const ps = Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
    const g = createGameState({
      catalog,
      players: ps,
      seed: 11,
      gameId: `alt-threshold-${n}`,
      startedAt: '2026-01-01T00:00:00.000Z',
      variant: 'alternate'
    });
    expect(g.progressThreshold).toBe(4 * n + 1);
  });

  it('the guaranteed starter stock is visible in hand immediately, before and throughout the draft', () => {
    const ps = Array.from({ length: 3 }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }));
    const g = createGameState({
      catalog,
      players: ps,
      seed: 21,
      gameId: 'alt-draft',
      startedAt: '2026-01-01T00:00:00.000Z',
      variant: 'alternate'
    });
    const startingStockUids = new Map(g.players.map(p => [p.playerId, p.hand.find(c => c.category === 'stock')!.uid]));

    const events: any[] = [];
    beginDraft(g, events);
    // The stock never entered the draft pool -- it's still sitting in hand
    // right through every round, and each round's candidate count reflects
    // only the 4 (then 3, then 2) draftable event cards, not the stock.
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
