import type {
  ActionCard,
  GameLogEntry,
  GameState,
  PlayerId,
  PlayerPrivate,
  StockCard,
  FreeActionRequest
} from '@insider-trading/shared';
import type { MutationResult } from '../domain/mutate.js';
import { event } from './events.js';
import { setPrompt } from './prompts.js';
import { startActionCard } from './actionCards.js';
import { claimGoal } from './goals.js';
import { findPlayer } from './turn.js';

export function submitFreeAction(
  state: GameState,
  playerId: PlayerId,
  request: FreeActionRequest
): MutationResult {
  const events: GameLogEntry[] = [];
  if (state.gameOver) return { ok: false, error: 'game is over', events };
  state.freeActionQueue.push({ playerId, request });
  events.push(
    event('free_action_queued', `${findPlayer(state, playerId).name} queued ${describe(request)}`, {
      actor: playerId,
      payload: { request }
    })
  );
  return { ok: true, events };
}

function describe(r: FreeActionRequest): string {
  switch (r.kind) {
    case 'play_action_card':
      return `play action card ${r.cardUid}`;
    case 'use_hot_tip':
      return 'use Hot Tip';
    case 'claim_goal':
      return `claim goal ${r.goalUid}`;
  }
}

/**
 * Drain one free action from the queue. Sets sub-prompts if the action needs
 * more input from the player. Returns silently if queue is empty.
 */
export function processNextFreeAction(state: GameState, events: GameLogEntry[]): void {
  const entry = state.freeActionQueue[0];
  if (!entry) return;
  // If the actor has a pending prompt other than `auction_bid`, we must wait.
  // An auction_bid prompt is interruptible: a free action runs to completion
  // (potentially setting its own short-lived prompts), then advance() re-issues
  // the bid prompt once the queue drains.
  const myPrompt = state.pendingPrompts[entry.playerId];
  if (myPrompt && myPrompt.type !== 'auction_bid') return;
  if (myPrompt && myPrompt.type === 'auction_bid') {
    state.pendingPrompts[entry.playerId] = null;
  }
  state.freeActionQueue.shift();
  const player = findPlayer(state, entry.playerId);
  switch (entry.request.kind) {
    case 'play_action_card':
      handlePlayActionCard(state, player, entry.request.cardUid, events);
      break;
    case 'use_hot_tip':
      handleUseHotTip(state, player, events);
      break;
    case 'claim_goal':
      claimGoal(
        state,
        player,
        entry.request.goalUid,
        entry.request.stockAssignment,
        events
      );
      break;
  }
}

function handlePlayActionCard(
  state: GameState,
  player: PlayerPrivate,
  cardUid: string,
  events: GameLogEntry[]
): void {
  const idx = player.hand.findIndex(c => c.uid === cardUid);
  if (idx < 0) {
    events.push(event('error', `play_action_card: ${player.name} does not hold ${cardUid}`, {}));
    return;
  }
  const card = player.hand[idx];
  if (card.category !== 'action') {
    events.push(event('error', `play_action_card: ${cardUid} is not an action card`, {}));
    return;
  }
  player.hand.splice(idx, 1);
  events.push(
    event('action_card_played', `${player.name} plays ${card.name}`, {
      actor: player.playerId,
      payload: { uid: card.uid, name: card.name }
    })
  );
  startActionCard(state, player, card as ActionCard, events);
}

function handleUseHotTip(state: GameState, player: PlayerPrivate, events: GameLogEntry[]): void {
  if (!player.hotTipAvailable) {
    events.push(event('error', `${player.name} has no Hot Tip available`, {}));
    return;
  }
  player.hotTipAvailable = false;
  const top = state.insiderTipDeck[0];
  events.push(
    event('hot_tip_used', `${player.name} uses Hot Tip`, {
      actor: player.playerId,
      payload: top ? { tip: { text: top.text, type: top.type } } : { empty: true }
    })
  );
  if (top) {
    setPrompt(
      state,
      player.playerId,
      'peek_ack',
      `Hot Tip: top Insider Tip is "${top.text}". Acknowledge to continue.`,
      { tip: { text: top.text, type: top.type } }
    );
  }
}
