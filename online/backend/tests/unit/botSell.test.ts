import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type GameState, type StockCard } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { makeRng } from '../../src/domain/rng.js';
import { createBotProfile } from '../../src/bots/profile.js';
import { decideBotAction } from '../../src/bots/decide.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function blue(uid: string): StockCard {
  return { ...catalog.stocks.find(s => s.color === 'Blue' && s.type === 'blank')!, uid };
}
function orange(uid: string): StockCard {
  return { ...catalog.stocks.find(s => s.color === 'Orange' && s.type === 'blank')!, uid };
}

describe('emergency-sell picks the least goal-useful stock', () => {
  it('keeps a near-goal pair, sells the unrelated stock', () => {
    const state: GameState = createGameState({
      catalog,
      players: [
        { playerId: 'p1', name: 'A', isBot: true },
        { playerId: 'p2', name: 'B', isBot: true }
      ],
      seed: 1,
      gameId: 'g',
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    // Only goal in play: 3 Blue. Bot holds 2 Blue (one away → Blue useful) + 1
    // Orange (irrelevant). Not yet claimable.
    state.activeGoals = [catalog.goals.find(g => g.goal.text === '3 Blue')!];
    const bot = state.players.find(p => p.playerId === 'p1')!;
    bot.hand = [blue('b1'), blue('b2'), orange('o1')];
    bot.cash = 5; // < emergencySellCash(10)
    bot.loans = 1; // ≥1 → emergency-sell triggers
    // hand reassigned above has no Hot Tip card, so the hot-tip path won't fire.
    state.currentPlayerIndex = state.players.findIndex(p => p.playerId === 'p1');
    state.turnPhase = 'awaiting_turn_action';

    const profile = createBotProfile(makeRng(0));
    const action = decideBotAction(state, 'p1', profile, { rng: makeRng(0) });

    expect(action).not.toBeNull();
    expect(action!.kind).toBe('turn_action');
    const ta = action as { kind: 'turn_action'; action: { type: string; stockUid?: string } };
    expect(ta.action.type).toBe('sell_stock');
    expect(ta.action.stockUid).toBe('o1'); // sells the Orange, keeps the Blue pair
  });
});
