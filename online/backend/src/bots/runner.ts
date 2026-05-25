import type { GameLogEntry, GameState, PlayerId } from '@insider-trading/shared';
import type { MutationResult } from '../domain/mutate.js';
import type { Rng } from '../domain/rng.js';
import { advance } from '../engine/advance.js';
import { bid, pass, startAuction } from '../engine/auction.js';
import { event } from '../engine/events.js';
import { submitFreeAction } from '../engine/freeActions.js';
import { respondToPrompt } from '../engine/promptResponse.js';
import { sellStock } from '../engine/turn.js';
import type { ServerHub } from '../state/serverState.js';
import { decideBotAction, type BotAction } from './decide.js';

/**
 * Execute one bot action against `state`. Mirrors the wrapping that HTTP routes
 * do (op_* event prefix + advance() afterward). Returns the MutationResult so
 * the caller can pass it to the queue.
 */
function executeBotAction(
  state: GameState,
  playerId: PlayerId,
  action: BotAction
): MutationResult {
  const opEvents: GameLogEntry[] = [];
  let mut: MutationResult;
  switch (action.kind) {
    case 'turn_action': {
      const a = action.action;
      if (a.type === 'start_auction') {
        opEvents.push(
          event('op_start_auction', '', {
            actor: playerId,
            payload: { cardUid: a.cardUid, initialBid: a.initialBid }
          })
        );
        mut = startAuction(state, playerId, a.cardUid, a.initialBid);
      } else {
        opEvents.push(
          event('op_sell_stock', '', { actor: playerId, payload: { stockUid: a.stockUid } })
        );
        mut = sellStock(state, playerId, a.stockUid);
      }
      break;
    }
    case 'auction_bid': {
      const a = action.action;
      if (a.type === 'bid') {
        opEvents.push(
          event('op_auction_bid', '', { actor: playerId, payload: { amount: a.amount } })
        );
        mut = bid(state, playerId, a.amount);
      } else {
        opEvents.push(event('op_auction_pass', '', { actor: playerId }));
        mut = pass(state, playerId);
      }
      break;
    }
    case 'free_action': {
      opEvents.push(
        event('op_free_action', '', { actor: playerId, payload: { request: action.request } })
      );
      mut = submitFreeAction(state, playerId, action.request);
      break;
    }
    case 'prompt_response': {
      opEvents.push(
        event('op_prompt_response', '', {
          actor: playerId,
          payload: { promptId: action.promptId, response: action.response }
        })
      );
      mut = respondToPrompt(state, playerId, action.promptId, action.response);
      break;
    }
  }
  if (mut.ok) {
    mut.events = [...opEvents, ...mut.events];
    advance(state, mut.events);
  }
  return mut;
}

/**
 * Enqueue a single bot mutation: find the first bot that has an action and
 * execute it. If no bot has anything to do, returns without queueing.
 *
 * After the queued mutation runs, the queue's broadcaster fires, which will
 * call `kickBots` again — so a chain of bot actions plays out as cascading
 * queue items, one per tick.
 */
export function kickBots(hub: ServerHub): void {
  // Peek: any bot at all in this game?
  const peek = hub.getGame();
  if (!peek || peek.gameOver) return;
  if (!peek.players.some(p => p.isBot)) return;

  void hub.queue.run('bot_tick', state => {
    if (state.gameOver) return { ok: true, events: [] };
    for (const player of state.players) {
      if (!player.isBot) continue;
      const profile = hub.getBotProfile(player.playerId);
      if (!profile) continue;
      const action = decideBotAction(state, player.playerId, profile, { rng: hub.botRng });
      if (action) {
        const r = executeBotAction(state, player.playerId, action);
        return r;
      }
    }
    return { ok: true, events: [] };
  });
}
