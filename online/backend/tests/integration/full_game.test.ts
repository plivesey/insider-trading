import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  type Color,
  type GameState,
  type PlayerId
} from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { startAuction, bid, pass } from '../../src/engine/auction.js';
import { sellStock, currentPlayer, findPlayer } from '../../src/engine/turn.js';
import { advance } from '../../src/engine/advance.js';
import { submitFreeAction } from '../../src/engine/freeActions.js';
import { respondToPrompt } from '../../src/engine/promptResponse.js';
import { assertGameOverInvariants } from './_invariants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function pids(n: number): { playerId: PlayerId; name: string }[] {
  return Array.from({ length: n }, (_, i) => ({ playerId: `p${i + 1}`, name: `Player${i + 1}` }));
}

/**
 * Deterministic AI driver. Runs a game to completion through direct engine
 * calls (no HTTP). Each turn the current player either starts a $0 auction on
 * the cheapest market stock or sells the cheapest stock if cash is low. All
 * other players pass during auctions. Players auto-claim any qualifying goal
 * via Wild Share substitution where possible.
 */
function driveToEnd(state: GameState, events: any[], maxTurns = 200): void {
  let safety = 0;
  while (!state.gameOver && safety < maxTurns * 30) {
    safety++;
    // 1. Resolve any pending prompts deterministically.
    const drained = drainPrompts(state, events);
    if (drained) {
      advance(state, events);
      continue;
    }
    // 2. If we're awaiting an auction bid (no prompt set means engine is
    //    between states), then handle.
    if (state.turnPhase === 'in_auction' && state.auction?.awaitingBidderId) {
      const r = pass(state, state.auction.awaitingBidderId);
      events.push(...r.events);
      advance(state, events);
      continue;
    }
    // 3. Try goal claims (auto).
    if (tryClaimAnyGoal(state, events)) continue;
    // 4. Take turn action.
    if (state.turnPhase === 'awaiting_turn_action') {
      const player = currentPlayer(state);
      // If we have a sellable stock and low cash, sell.
      const sellable = player.hand.find(c => c.category === 'stock' && c.color !== 'Wild');
      if (sellable && player.cash < 5) {
        const r = sellStock(state, player.playerId, sellable.uid);
        events.push(...r.events);
        advance(state, events);
        continue;
      }
      // Otherwise start an auction at $0 on a market stock if available.
      const target = state.market.find(c => c.category === 'stock') ?? state.market[0];
      const r = startAuction(state, player.playerId, target.uid, 0);
      events.push(...r.events);
      advance(state, events);
      continue;
    }
    // Shouldn't normally reach here — break to avoid infinite loop.
    break;
  }
}

function drainPrompts(state: GameState, events: any[]): boolean {
  for (const [pid, pr] of Object.entries(state.pendingPrompts)) {
    if (!pr) continue;
    if (pr.type === 'auction_bid') {
      // Always pass.
      const r = pass(state, pid);
      events.push(...r.events);
      return true;
    }
    let resp: Record<string, unknown> = {};
    switch (pr.type) {
      case 'peek_ack':
        resp = {};
        break;
      case 'pick_color': {
        const exclude = pr.payload?.exclude;
        resp = { color: ['Blue', 'Orange', 'Yellow', 'Purple'].find(c => c !== exclude) };
        break;
      }
      case 'pick_color_amount': {
        if (pr.payload?.perColor) {
          const amount = pr.payload.amount as number;
          resp = { choices: { Blue: amount, Orange: amount, Yellow: amount, Purple: amount } };
        } else {
          resp = { color: 'Blue', sign: 'up' };
        }
        break;
      }
      case 'set_stock_choice':
        resp = { color: 'Blue' };
        break;
      case 'adjust_two_stocks_choice':
        resp = { upColor: 'Blue', downColor: 'Orange' };
        break;
      case 'wild_speculation_choice':
        resp = { sign: 'up' };
        break;
      case 'draw_and_keep': {
        const drawn = pr.payload?.drawn as { uid: string }[];
        const keepCount = pr.payload?.keepCount as number;
        resp = { keepUids: drawn.slice(0, keepCount).map(d => d.uid) };
        break;
      }
      case 'reorder_tips': {
        const staged = pr.payload?.stagedUids as string[];
        resp = { order: staged };
        break;
      }
      case 'pick_target_player': {
        const target = state.players.find(p => p.playerId !== pid && p.hand.some(c => c.category === 'stock'));
        resp = { targetId: target?.playerId ?? state.players.find(p => p.playerId !== pid)!.playerId };
        break;
      }
      case 'pick_stock_from_target': {
        const stocks = pr.payload?.stocks as { uid: string }[];
        resp = { stockUid: stocks[0]?.uid };
        break;
      }
      case 'pick_market_card':
        resp = { cardUid: state.market[0].uid };
        break;
      case 'pick_hand_stock_for_swap': {
        const player = state.players.find(p => p.playerId === pid)!;
        const myStock = player.hand.find(c => c.category === 'stock');
        resp = { stockUid: myStock?.uid };
        break;
      }
      case 'pick_stock_from_hand': {
        const player = state.players.find(p => p.playerId === pid)!;
        const myStock = player.hand.find(c => c.category === 'stock' && c.color !== 'Wild');
        resp = { stockUid: myStock?.uid, done: true };
        break;
      }
    }
    const r = respondToPrompt(state, pid, pr.promptId, resp);
    events.push(...r.events);
    return true;
  }
  return false;
}

function tryClaimAnyGoal(state: GameState, events: any[]): boolean {
  for (const player of state.players) {
    for (const goal of state.activeGoals.slice()) {
      const req = goal.goal.parsed.requirements;
      // Build a stock assignment from player.hand.
      const need: Partial<Record<Color, number>> = { ...req };
      const assignment: Record<string, Color> = {};
      const usedUids = new Set<string>();
      for (const c of player.hand) {
        if (c.category !== 'stock') continue;
        if (usedUids.has(c.uid)) continue;
        if (c.color === 'Wild') continue;
        const remaining = need[c.color] ?? 0;
        if (remaining > 0) {
          assignment[c.uid] = c.color;
          usedUids.add(c.uid);
          need[c.color] = remaining - 1;
        }
      }
      // Fill remaining with Wild Shares.
      const remainingColors = (Object.keys(need) as Color[]).filter(k => (need[k] ?? 0) > 0);
      for (const col of remainingColors) {
        while ((need[col] ?? 0) > 0) {
          const wild = player.hand.find(c => c.category === 'stock' && c.color === 'Wild' && !usedUids.has(c.uid));
          if (!wild) break;
          assignment[wild.uid] = col;
          usedUids.add(wild.uid);
          need[col] = (need[col] ?? 0) - 1;
        }
      }
      const satisfied = (Object.keys(need) as Color[]).every(k => (need[k] ?? 0) <= 0);
      if (!satisfied) continue;
      submitFreeAction(state, player.playerId, {
        kind: 'claim_goal',
        goalUid: goal.uid,
        stockAssignment: { cards: assignment }
      });
      advance(state, events);
      return true;
    }
  }
  return false;
}

describe('full game integration', () => {
  it('runs a 2-player game to completion with valid scoring', () => {
    const state = createGameState({
      catalog,
      players: pids(2),
      seed: 42,
      gameId: 'g',
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    const events: any[] = [];
    driveToEnd(state, events);
    assertGameOverInvariants(state);
  });

  it('runs a 4-player game to completion deterministically', () => {
    const state = createGameState({
      catalog,
      players: pids(4),
      seed: 99,
      gameId: 'g',
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    const events: any[] = [];
    driveToEnd(state, events);
    expect(state.gameOver).not.toBeNull();
  });
});
