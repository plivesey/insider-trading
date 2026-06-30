import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
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

describe('RulesConfig plumbing (game-length experiment)', () => {
  it('defaults preserve V4 counts and no starting card', () => {
    const s = mkState();
    expect(s.insiderTipDeck).toHaveLength(2 * 3);
    expect(s.activeGoals).toHaveLength(3 + 2);
    expect(s.players.every(p => p.hand.length === 0)).toBe(true);
    expect(s.rules).toEqual({ startingBuyCard: false, goalStopCount: 1, extraGoals: 0, tipReduction: 0 });
  });

  it('tipReduction shrinks the insider-tip deck', () => {
    expect(mkState({ tipReduction: 1 }).insiderTipDeck).toHaveLength(2 * 3 - 1);
    expect(mkState({ tipReduction: 2 }).insiderTipDeck).toHaveLength(2 * 3 - 2);
  });

  it('extraGoals grows the active goals', () => {
    expect(mkState({ extraGoals: 1 }).activeGoals).toHaveLength(3 + 2 + 1);
  });

  it('startingBuyCard deals one Market Order to every player', () => {
    const s = mkState({ startingBuyCard: true });
    for (const p of s.players) {
      expect(p.hand).toHaveLength(1);
      const c = p.hand[0];
      expect(c.category).toBe('action');
      expect(c.category === 'action' && c.effect.type).toBe('buy_from_market');
    }
  });

  it('goalStopCount controls the end condition', () => {
    // Default: 2 goals remaining is NOT game over; 1 remaining is.
    const sDefault = mkState();
    sDefault.activeGoals = sDefault.activeGoals.slice(0, 2);
    checkEndConditions(sDefault, []);
    expect(sDefault.gameOver).toBeNull();

    const sStop2 = mkState({ goalStopCount: 2 });
    sStop2.activeGoals = sStop2.activeGoals.slice(0, 2);
    checkEndConditions(sStop2, []);
    expect(sStop2.gameOver).not.toBeNull();
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
