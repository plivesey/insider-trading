import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { loadCards } from '@insider-trading/shared';
import { startServer, type StartedServer } from '../../src/server.js';
import { activeLogFile, readLogFile } from '../../src/domain/gameLog.js';
import { replayFromLog, diffStates } from '../../src/domain/replay.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

async function driveDraft(a: any, b: any, maxIters = 20): Promise<void> {
  for (let i = 0; i < maxIters; i++) {
    const sa = (await a.get('/api/state')).body.state;
    const sb = (await b.get('/api/state')).body.state;
    const aDraft = sa?.myPrompt?.type === 'setup_draft_pick';
    const bDraft = sb?.myPrompt?.type === 'setup_draft_pick';
    if (!aDraft && !bDraft) return;
    if (aDraft) {
      const uid = sa.myPrompt.payload.candidateUids[0];
      await a.post('/api/prompt-response').send({ promptId: sa.myPrompt.promptId, response: { keepUid: uid } });
    }
    if (bDraft) {
      const uid = sb.myPrompt.payload.candidateUids[0];
      await b.post('/api/prompt-response').send({ promptId: sb.myPrompt.promptId, response: { keepUid: uid } });
    }
  }
}

describe('replayFromLog (V5)', () => {
  let server: StartedServer;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'it-replay-'));
    server = await startServer({
      port: 0,
      snapshotPath: path.join(tmpDir, 'game_state.json'),
      logsDir: path.join(tmpDir, 'game_logs'),
      cardsDir: CARDS_DIR,
      silent: true,
      defaultSeed: 42
    });
  });

  afterEach(() => {
    server.server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reproduces live state after the setup draft plus a few turns', async () => {
    const a = request.agent(server.app);
    const b = request.agent(server.app);
    await a.post('/api/join').send({ name: 'Alice' });
    await b.post('/api/join').send({ name: 'Bob' });
    await a.post('/api/start');

    // Bootstrap: createGameState alone doesn't call beginDraft -- ServerHub's
    // startGame does that via advance(), so the first state fetch already
    // carries a 'setup_draft_pick' prompt for both players (this is exactly
    // the step that was missing from replayFromLog before this test's fix).
    await driveDraft(a, b);

    // Drive a handful of real turns: start an auction, have the other player
    // pass, resolve whatever prompts come up (Tip-Off, dice-bag draws, etc.)
    // opportunistically with a permissive default response.
    for (let turn = 0; turn < 6; turn++) {
      const s = (await a.get('/api/state')).body.state;
      if (s.gameOver) break;
      const clients = [a, b];
      const stateForNames = (await a.get('/api/state')).body.state;
      const nameToClient: Record<string, any> = {};
      for (const p of stateForNames.players) {
        nameToClient[p.name] = p.name === 'Alice' ? a : b;
      }
      const curName = stateForNames.players[stateForNames.currentPlayerIndex].name;
      const cur = nameToClient[curName];
      const other = cur === a ? b : a;
      const cardUid = stateForNames.market[0].uid;
      await cur.post('/api/turn-action').send({ type: 'start_auction', cardUid, initialBid: 0 });
      // Resolve the auction: other player passes until it settles.
      for (let i = 0; i < 5; i++) {
        const auctionState = (await a.get('/api/state')).body.state;
        if (!auctionState.auction) break;
        const bidderName = stateForNames.players.find(
          (p: any) => p.playerId === auctionState.auction.awaitingBidderId
        )?.name;
        const bidder = nameToClient[bidderName] ?? other;
        await bidder.post('/api/auction-bid').send({ type: 'pass' });
      }
      // Drain any simple prompts (pick_color etc.) permissively.
      for (const client of clients) {
        for (let i = 0; i < 5; i++) {
          const ps = (await client.get('/api/state')).body.state;
          const pr = ps?.myPrompt;
          if (!pr || pr.type === 'auction_bid' || pr.type === 'setup_draft_pick') break;
          let response: Record<string, unknown> = {};
          if (pr.type === 'pick_color') response = { color: 'Blue' };
          await client.post('/api/prompt-response').send({ promptId: pr.promptId, response });
        }
      }
    }

    const liveState = server.hub.getGame()!;
    const logFile = activeLogFile();
    expect(logFile).toBeTruthy();
    const entries = readLogFile(logFile!);
    const replayed = replayFromLog(entries, catalog);
    const diff = diffStates(liveState, replayed);
    expect(diff).toBeNull();
  });
});
