import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { MutateQueue } from '../../src/domain/mutate.js';
import { openLog, closeLog, readLogFile, activeLogFile } from '../../src/domain/gameLog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');

describe('MutateQueue', () => {
  let tmpDir: string;
  let snapshotPath: string;
  let logsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-test-'));
    snapshotPath = path.join(tmpDir, 'game_state.json');
    logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir);
  });

  afterEach(() => {
    closeLog();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serializes 100 concurrent ops in arrival order', async () => {
    const catalog = loadCards(CARDS_DIR);
    const state = createGameState({
      catalog,
      players: [
        { playerId: 'p1', name: 'A' },
        { playerId: 'p2', name: 'B' }
      ],
      seed: 1,
      gameId: 'g',
      startedAt: new Date().toISOString()
    });
    openLog(logsDir, state.gameId, state.startedAt);
    const q = new MutateQueue();
    q.setState(state);
    q.setSnapshotPath(snapshotPath);

    const broadcastOrder: number[] = [];
    q.setBroadcaster(s => {
      // Look at the last-appended log entry's payload.tag (we set this below).
      const last = s.log[s.log.length - 1];
      if (last?.payload?.tag !== undefined) {
        broadcastOrder.push(last.payload.tag as number);
      }
    });

    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      const tag = i;
      promises.push(
        q.run(`op-${i}`, s => ({
          ok: true,
          events: [
            {
              seq: 0,
              ts: '',
              turnNumber: s.turnNumber,
              type: 'noop',
              message: `tag ${tag}`,
              payload: { tag }
            }
          ]
        }))
      );
    }
    await Promise.all(promises);
    expect(broadcastOrder).toEqual(Array.from({ length: 100 }, (_, i) => i));

    // Snapshot is on disk.
    expect(fs.existsSync(snapshotPath)).toBe(true);
    // All events appended to log file.
    const logEntries = readLogFile(activeLogFile()!);
    expect(logEntries).toHaveLength(100);
    expect(logEntries.map(e => e.payload?.tag)).toEqual(
      Array.from({ length: 100 }, (_, i) => i)
    );
    // Event seq is monotonic and starts at 2 (game_start used seq 1).
    expect(logEntries[0].seq).toBe(2);
    expect(logEntries[99].seq).toBe(101);
  });

  it('rolls back state on thrown handler', async () => {
    const catalog = loadCards(CARDS_DIR);
    const state = createGameState({
      catalog,
      players: [
        { playerId: 'p1', name: 'A' },
        { playerId: 'p2', name: 'B' }
      ],
      seed: 1,
      gameId: 'g',
      startedAt: new Date().toISOString()
    });
    openLog(logsDir, state.gameId, state.startedAt);
    const q = new MutateQueue();
    q.setState(state);

    const before = structuredClone(state);
    const r = await q.run('bad', s => {
      s.turnNumber = 999;
      s.players[0].cash = -7777;
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
    const after = q.getState()!;
    expect(after.turnNumber).toBe(before.turnNumber);
    expect(after.players[0].cash).toBe(before.players[0].cash);
  });

  it('does not append events or persist on failed mutation', async () => {
    const catalog = loadCards(CARDS_DIR);
    const state = createGameState({
      catalog,
      players: [
        { playerId: 'p1', name: 'A' },
        { playerId: 'p2', name: 'B' }
      ],
      seed: 1,
      gameId: 'g',
      startedAt: new Date().toISOString()
    });
    openLog(logsDir, state.gameId, state.startedAt);
    const q = new MutateQueue();
    q.setState(state);
    q.setSnapshotPath(snapshotPath);

    await q.run('fail', () => ({
      ok: false,
      error: 'nope',
      events: [
        { seq: 0, ts: '', turnNumber: 1, type: 'noop', message: 'should not be logged' }
      ]
    }));
    expect(fs.existsSync(snapshotPath)).toBe(false);
    expect(readLogFile(activeLogFile()!)).toHaveLength(0);
  });
});
