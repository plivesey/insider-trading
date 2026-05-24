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

export function getPrompt(state: GameState, playerId: PlayerId): PromptEnvelope | null {
  return state.pendingPrompts[playerId] ?? null;
}
