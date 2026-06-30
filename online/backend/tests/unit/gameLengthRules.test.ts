import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  CLASSIC_RULES,
  DEFAULT_RULES,
  type GameState,
  type RulesConfig,
  type StockCard
} from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { submitFreeAction, processNextFreeAction } from '../../src/engine/freeActions.js';
import { respondToPrompt } from '../../src/engine/promptResponse.js';
import { checkEndConditions } from '../../src/engine/turn.js';

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

describe('RulesConfig plumbing', () => {
  it('the shipped default ruleset is 1+2+3', () => {
    const s = mkState(); // no override → DEFAULT_RULES
    expect(s.rules).toEqual(DEFAULT_RULES);
    expect(s.insiderTipDeck).toHaveLength(5); // max(4, 2*3 - 1)
    expect(s.activeGoals).toHaveLength(6); // 3 + 2 + 1
    expect(s.players.every(p => p.hand.length === 1)).toBe(true); // a Market Order each
    const c = s.players[0].hand[0];
    expect(c.category === 'action' && c.effect.type).toBe('buy_from_market');
  });

  it('CLASSIC_RULES restores the original game', () => {
    const s = mkState(CLASSIC_RULES);
    expect(s.insiderTipDeck).toHaveLength(2 * 3); // full deck
    expect(s.activeGoals).toHaveLength(3 + 2);
    expect(s.players.every(p => p.hand.length === 0)).toBe(true);
  });

  it('insider tips floor at MIN_TIPS (2-player stays at 4)', () => {
    const two = createGameState({
      catalog,
      players: [
        { playerId: 'p1', name: 'A' },
        { playerId: 'p2', name: 'B' }
      ],
      seed: 1,
      gameId: 'g',
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    expect(two.insiderTipDeck).toHaveLength(4); // max(4, 2*2 - 1) = 4, not 3
  });

  it('tipReduction shrinks the deck, floored at 4', () => {
    expect(mkState({ tipReduction: 0 }).insiderTipDeck).toHaveLength(6); // 2*3
    expect(mkState({ tipReduction: 2 }).insiderTipDeck).toHaveLength(4); // max(4, 4)
    expect(mkState({ tipReduction: 3 }).insiderTipDeck).toHaveLength(4); // floored
  });

  it('extraGoals grows the active goals', () => {
    expect(mkState({ extraGoals: 0 }).activeGoals).toHaveLength(5); // 3+2
    expect(mkState({ extraGoals: 2 }).activeGoals).toHaveLength(7); // 3+2+2
  });

  it('startingBuyCard:false deals no card', () => {
    expect(mkState({ startingBuyCard: false }).players.every(p => p.hand.length === 0)).toBe(true);
  });

  it('goalStopCount controls the end condition', () => {
    // goalStopCount 1: 2 goals remaining is NOT game over.
    const s1 = mkState({ goalStopCount: 1 });
    s1.activeGoals = s1.activeGoals.slice(0, 2);
    checkEndConditions(s1, []);
    expect(s1.gameOver).toBeNull();

    // goalStopCount 2 (the default): 2 goals remaining ends the game.
    const s2 = mkState({ goalStopCount: 2 });
    s2.activeGoals = s2.activeGoals.slice(0, 2);
    checkEndConditions(s2, []);
    expect(s2.gameOver).not.toBeNull();
  });
});

describe('Market Order (buy_from_market) resolution', () => {
  function setBlueInMarket(s: GameState, uid: string): StockCard {
    const blue: StockCard = {
      ...catalog.stocks.find(c => c.color === 'Blue' && c.type === 'blank')!,
      uid
    };
    s.market[0] = blue;
    return blue;
  }

  it('buys the chosen colored stock at current price, color +1, market refilled', () => {
    const s = mkState({ startingBuyCard: true });
    const buyCard = s.players[0].hand[0];
    const target = setBlueInMarket(s, 'test-blue');
    const cashBefore = s.players[0].cash; // 30
    const bluePrice = s.stockPrices.Blue; // 4

    submitFreeAction(s, 'p1', { kind: 'play_action_card', cardUid: buyCard.uid });
    processNextFreeAction(s, []);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_market_card');
    expect(pr.payload.mode).toBe('buy_from_market');

    respondToPrompt(s, 'p1', pr.promptId, { cardUid: target.uid });

    expect(s.players[0].hand.find(c => c.uid === target.uid)).toBeTruthy();
    expect(s.players[0].hand.find(c => c.uid === buyCard.uid)).toBeFalsy(); // consumed
    expect(s.market.find(c => c.uid === target.uid)).toBeFalsy();
    expect(s.market).toHaveLength(5); // refilled
    expect(s.stockPrices.Blue).toBe(bluePrice + 1);
    expect(s.players[0].cash).toBe(cashBefore - bluePrice);
    expect(s.players[0].loans).toBe(0);
  });

  it('auto-loans when the buyer cannot afford the price', () => {
    const s = mkState({ startingBuyCard: true });
    const buyCard = s.players[0].hand[0];
    const target = setBlueInMarket(s, 'test-blue');
    s.players[0].cash = 2; // Blue costs 4 → needs 1 loan ($10)

    submitFreeAction(s, 'p1', { kind: 'play_action_card', cardUid: buyCard.uid });
    processNextFreeAction(s, []);
    const pr = s.pendingPrompts['p1']!;
    respondToPrompt(s, 'p1', pr.promptId, { cardUid: target.uid });

    expect(s.players[0].loans).toBe(1);
    expect(s.players[0].cash).toBe(2 + 10 - 4); // 8
  });
});
