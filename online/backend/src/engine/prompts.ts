import type { GameState, PlayerId, PromptEnvelope, PromptType } from '@insider-trading/shared';

let promptCounter = 0;

export function newPromptId(): string {
  promptCounter += 1;
  return `prompt-${Date.now()}-${promptCounter}`;
}

export function setPrompt(
  state: GameState,
  playerId: PlayerId,
  type: PromptType,
  message: string,
  payload: Record<string, unknown> = {}
): PromptEnvelope {
  const env: PromptEnvelope = { promptId: newPromptId(), type, playerId, message, payload };
  state.pendingPrompts[playerId] = env;
  return env;
}

export function clearPrompt(state: GameState, playerId: PlayerId): void {
  state.pendingPrompts[playerId] = null;
}

export function hasAnyPendingPrompt(state: GameState): boolean {
  return Object.values(state.pendingPrompts).some(p => p !== null);
}

/**
 * Like `hasAnyPendingPrompt` but ignores `auction_bid` prompts. Used by the
 * advance loop so that free actions (play action card, claim goal, use Hot
 * Tip) can interleave with a player's pending bid decision. The auction_bid
 * prompt is re-issued by advance() once the queue drains.
 */
export function hasBlockingPrompt(state: GameState): boolean {
  return Object.values(state.pendingPrompts).some(
    p => p !== null && p.type !== 'auction_bid'
  );
}

export function getPrompt(state: GameState, playerId: PlayerId): PromptEnvelope | null {
  return state.pendingPrompts[playerId] ?? null;
}
