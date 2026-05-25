import type { GameLogEntry, GameState } from '@insider-trading/shared';
import { hasBlockingPrompt, setPrompt } from './prompts.js';
import {
  advanceTurn,
  checkEndConditions,
  rollEndOfTurnDie
} from './turn.js';
import { processNextFreeAction } from './freeActions.js';

/**
 * Auto-progression after every successful mutation. Repeatedly:
 *  1. Process a free-action queue entry if no blocking prompt pending.
 *  2. Roll die if phase = awaiting_die_roll and no prompts/free actions left.
 *  3. Check end conditions; if game over, stop.
 *  4. Advance turn if phase = turn_complete.
 *  5. If an auction is open and the awaiting bidder has no prompt, (re-)issue
 *     the auction_bid prompt. This restores the prompt that was dropped by
 *     processNextFreeAction so a player can interleave free actions during
 *     their bid decision.
 * Stops when no further auto-progress is possible.
 */
export function advance(state: GameState, events: GameLogEntry[]): void {
  // Safety cap to prevent infinite loops on engine bugs.
  for (let i = 0; i < 200; i++) {
    if (state.gameOver) return;
    if (hasBlockingPrompt(state)) return;
    if (state.freeActionQueue.length > 0) {
      processNextFreeAction(state, events);
      continue;
    }
    if (state.turnPhase === 'awaiting_die_roll') {
      rollEndOfTurnDie(state, events);
      checkEndConditions(state, events);
      if (state.gameOver) return;
      state.turnPhase = 'turn_complete';
      continue;
    }
    if (state.turnPhase === 'turn_complete') {
      checkEndConditions(state, events);
      if (state.gameOver) return;
      advanceTurn(state, events);
      continue;
    }
    // 'in_auction': if the awaiting bidder lost their bid prompt (because they
    // played a free action mid-bid), re-issue it so the auction can resume.
    if (state.auction && state.auction.awaitingBidderId) {
      const awaitingId = state.auction.awaitingBidderId;
      if (!state.pendingPrompts[awaitingId]) {
        const high = state.players.find(p => p.playerId === state.auction!.currentHighBidderId);
        setPrompt(
          state,
          awaitingId,
          'auction_bid',
          `Auction: current high $${state.auction.currentHigh} by ${high?.name}. Bid or pass?`,
          {
            cardUid: state.auction.cardUid,
            currentHigh: state.auction.currentHigh,
            currentHighBidderId: state.auction.currentHighBidderId,
            mustBeatBy: 1
          }
        );
      }
    }
    return; // 'awaiting_turn_action' or 'in_auction' — wait for player input.
  }
  throw new Error('advance() exceeded safety cap');
}
