import fs from 'node:fs';
import path from 'node:path';
import type { GameState, GameLogEntry } from '@insider-trading/shared';
import { appendLog } from './gameLog.js';

export interface MutationResult {
  ok: boolean;
  error?: string;
  events: GameLogEntry[];
}

export type Mutator = (state: GameState) => MutationResult | void;

/**
 * Serial async mutation queue. All state changes (turn actions, auction bids,
 * free actions, prompt responses, end-of-turn die rolls) flow through here.
 *
 * On success: persists the snapshot, appends each event line to the active
 * per-game log file, and broadcasts via the configured broadcaster.
 *
 * On error: rolls back the snapshot (state is mutated by reference, so we
 * snapshot-before-call and restore on throw).
 */
export class MutateQueue {
  private state: GameState | null = null;
  private chain: Promise<void> = Promise.resolve();
  private broadcaster: ((state: GameState, events: GameLogEntry[]) => void) | null = null;
  private snapshotPath: string | null = null;

  setState(state: GameState | null): void {
    this.state = state;
  }
  getState(): GameState | null {
    return this.state;
  }
  setSnapshotPath(p: string | null): void {
    this.snapshotPath = p;
  }
  setBroadcaster(b: ((state: GameState, events: GameLogEntry[]) => void) | null): void {
    this.broadcaster = b;
  }

  /**
   * Enqueue a mutation. Returns a promise resolving to the mutation result.
   * Mutations run strictly one at a time.
   */
  run(label: string, fn: Mutator): Promise<MutationResult> {
    let resolve!: (r: MutationResult) => void;
    const out = new Promise<MutationResult>(r => (resolve = r));
    this.chain = this.chain.then(async () => {
      if (!this.state) {
        resolve({ ok: false, error: 'no active game', events: [] });
        return;
      }
      const snapshot = structuredClone(this.state);
      let result: MutationResult;
      try {
        const r = fn(this.state);
        result = r ?? { ok: true, events: [] };
      } catch (err) {
        this.state = snapshot;
        result = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          events: []
        };
      }
      if (!result.ok) {
        this.state = snapshot;
        resolve(result);
        return;
      }
      // Success: bump event counter & stamp timestamps/turnNumber from state.
      // events.ts constructs entries with placeholders; we overwrite them here
      // so every persisted/broadcast event reflects the actual game state at
      // the moment of emission.
      for (const ev of result.events) {
        this.state.eventCounter += 1;
        ev.seq = this.state.eventCounter;
        if (!ev.ts) ev.ts = new Date().toISOString();
        ev.turnNumber = this.state.turnNumber;
        this.state.log.push(ev);
        appendLog(ev);
      }
      if (this.snapshotPath) {
        this.persist(this.snapshotPath, this.state);
      }
      if (this.broadcaster) {
        this.broadcaster(this.state, result.events);
      }
      resolve(result);
    });
    return out;
  }

  private persist(filePath: string, state: GameState): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, filePath);
  }
}
