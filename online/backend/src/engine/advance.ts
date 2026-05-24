import type { GameLogEntry, GameState } from '@insider-trading/shared';
import { hasAnyPendingPrompt } from './prompts.js';
import {
  advanceTurn,
  checkEndConditions,
  rollEndOfTurnDie
} from './turn.js';
import { processNextFreeAction } from './freeActions.js';

/**
 * Auto-progression after every successful mutation. Repeatedly:
 *  1. Process a free-action queue entry if no prompts pending.
 *  2. Roll die if phase = awaiting_die_roll and no prompts/free actions left.
 *  3. Check end conditions; if game over, stop.
 *  4. Advance turn if phase = turn_complete.
 * Stops when no further auto-progress is possible.
 */
export function advance(state: GameState, events: GameLogEntry[]): void {
  // Safety cap to prevent infinite loops on engine bugs.
  for (let i = 0; i < 200; i++) {
    if (state.gameOver) return;
    if (hasAnyPendingPrompt(state)) return;
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
    return; // 'awaiting_turn_action' or 'in_auction' — wait for player input.
  }
  throw new Error('advance() exceeded safety cap');
}
