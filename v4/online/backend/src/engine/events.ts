import type { GameLogEntry, PlayerId } from '@insider-trading/shared';

export function event(
  type: string,
  message: string,
  opts: { actor?: PlayerId; payload?: Record<string, unknown> } = {}
): GameLogEntry {
  return {
    seq: 0, // filled in by MutateQueue
    ts: '',
    turnNumber: 0,
    type,
    message,
    actor: opts.actor,
    payload: opts.payload
  };
}
