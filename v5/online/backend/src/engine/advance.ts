import type { GameLogEntry, GameState, TurnPhase } from '@insider-trading/shared';
import { hasBlockingPrompt, setPrompt } from './prompts.js';
import {
  advanceTurn,
  checkProgressThreshold,
  finalizeGameEnding,
  resolveEndOfTurnDiceBag
} from './turn.js';
import { processNextFreeAction } from './freeActions.js';
import { beginDraft } from './setupDraft.js';

/**
 * Auto-progression after every successful mutation. Repeatedly:
 *  1. If still in the setup draft phase, kick it off (once) then wait for
 *     player picks -- the draft advances itself via promptResponse.ts, not
 *     this loop.
 *  2. Process a free-action queue entry if no blocking prompt pending.
 *  3. If the progress tracker's threshold was reached and every final goal
 *     offer has now been answered, finalize the game.
 *  4. Draw & resolve a die if phase = awaiting_dice_bag_draw.
 *  5. Once a turn is fully done (phase = turn_complete), check the
 *     progress-tracker end condition -- this is the ONLY point that can end
 *     the game, so a threshold crossed mid-turn never cuts that turn short.
 *     If it's reached, this either finalizes directly (nobody has a
 *     claimable goal) or moves to phase = game_ending and issues final-claim
 *     offers, which pause auto-progress (via the blocking prompts they set)
 *     until answered. Otherwise, advance to the next player's turn.
 *  6. If an auction is open and the awaiting bidder has no prompt, (re-)issue
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
    if (state.turnPhase === 'setup_draft') {
      if (!state.draft) beginDraft(state, events);
      return; // draft progresses via promptResponse.ts's setup_draft_pick case
    }
    if (state.freeActionQueue.length > 0) {
      processNextFreeAction(state, events);
      continue;
    }
    if (state.turnPhase === 'game_ending') {
      // Every final-goal-offer prompt (and any reward sub-prompt it
      // triggered) is resolved -- otherwise hasBlockingPrompt above would
      // have stopped the loop already.
      finalizeGameEnding(state, events);
      return;
    }
    if (state.turnPhase === 'awaiting_dice_bag_draw') {
      resolveEndOfTurnDiceBag(state, events);
      state.turnPhase = 'turn_complete';
      continue;
    }
    if (state.turnPhase === 'turn_complete') {
      checkProgressThreshold(state, events);
      if (state.gameOver) return;
      // checkProgressThreshold may have moved us to 'game_ending' (TS can't see
      // the mutation through the call, hence the cast) to pause for offers.
      if ((state.turnPhase as TurnPhase) === 'game_ending') return;
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
