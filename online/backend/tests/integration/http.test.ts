import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { startServer, type StartedServer } from '../../src/server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');

/** Resolve every player's setup-draft prompts (always keep the first candidate offered) until the draft finishes. */
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

describe('HTTP layer', () => {
  let server: StartedServer;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'it-http-'));
    server = await startServer({
      port: 0,
      snapshotPath: path.join(tmpDir, 'game_state.json'),
      logsDir: path.join(tmpDir, 'game_logs'),
      cardsDir: CARDS_DIR,
      silent: true,
      defaultSeed: 1
    });
  });

  afterEach(() => {
    server.server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lobby returns empty initially, then reflects joins', async () => {
    const r1 = await request(server.app).get('/api/state');
    expect(r1.body).toEqual({ mode: 'lobby', lobby: [], canStart: false });

    const j1 = await request(server.app).post('/api/join').send({ name: 'Alice' });
    expect(j1.status).toBe(200);
    expect(j1.body.name).toBe('Alice');
    expect(j1.body.playerId).toMatch(/.+-.+/);

    const j2 = await request(server.app).post('/api/join').send({ name: 'Bob' });
    expect(j2.status).toBe(200);

    const r2 = await request(server.app).get('/api/state');
    expect(r2.body.mode).toBe('lobby');
    expect(r2.body.lobby.map((p: any) => p.name).sort()).toEqual(['Alice', 'Bob']);
    expect(r2.body.canStart).toBe(true);
  });

  it('rejects duplicate name in lobby', async () => {
    await request(server.app).post('/api/join').send({ name: 'X' });
    const r = await request(server.app).post('/api/join').send({ name: 'X' });
    expect(r.status).toBe(400);
  });

  it('cookie persists session across requests', async () => {
    const agent = request.agent(server.app);
    const j = await agent.post('/api/join').send({ name: 'Alice' });
    expect(j.headers['set-cookie']).toBeDefined();
    const me = await agent.get('/api/me');
    expect(me.body.name).toBe('Alice');
    expect(me.body.inLobby).toBe(true);
  });

  it('start fails with fewer than 2 players', async () => {
    await request(server.app).post('/api/join').send({ name: 'Solo' });
    const s = await request(server.app).post('/api/start');
    expect(s.status).toBe(400);
  });

  it('start succeeds with 2+ players, projection hides other hands', async () => {
    const a = request.agent(server.app);
    const b = request.agent(server.app);
    await a.post('/api/join').send({ name: 'Alice' });
    await b.post('/api/join').send({ name: 'Bob' });
    const s = await a.post('/api/start');
    expect(s.status).toBe(200);
    const sa = await a.get('/api/state');
    expect(sa.body.mode).toBe('in_game');
    const state = sa.body.state;
    expect(state.players).toHaveLength(2);
    // Alice's myPlayer is her own seat with hand visible.
    expect(state.myPlayer.name).toBe('Alice');
    expect(Array.isArray(state.myPlayer.hand)).toBe(true);
    // Other players don't expose hand.
    const bob = state.players.find((p: any) => p.name === 'Bob');
    expect(bob).toBeDefined();
    expect((bob as any).hand).toBeUndefined();
    expect((bob as any).handSize).toBeDefined();
  });

  it('start with variant: "alternate" builds an Alternate-variant game', async () => {
    const a = request.agent(server.app);
    const b = request.agent(server.app);
    const c = request.agent(server.app);
    const d = request.agent(server.app);
    await a.post('/api/join').send({ name: 'Alice' });
    await b.post('/api/join').send({ name: 'Bob' });
    await c.post('/api/join').send({ name: 'Carol' });
    await d.post('/api/join').send({ name: 'Dave' });
    const s = await a.post('/api/start').send({ variant: 'alternate' });
    expect(s.status).toBe(200);
    const sa = await a.get('/api/state');
    const state = sa.body.state;
    expect(state.variant).toBe('alternate');
    expect(state.progressThreshold).toBe(4 * 4 + 1); // 4 players * 4 + 1
  });

  it('start with no body (or variant omitted) defaults to Classic', async () => {
    const a = request.agent(server.app);
    const b = request.agent(server.app);
    const c = request.agent(server.app);
    await a.post('/api/join').send({ name: 'Alice' });
    await b.post('/api/join').send({ name: 'Bob' });
    await c.post('/api/join').send({ name: 'Carol' });
    const s = await a.post('/api/start');
    expect(s.status).toBe(200);
    const sa = await a.get('/api/state');
    const state = sa.body.state;
    expect(state.variant).toBe('classic');
    expect(state.progressThreshold).toBe(3 * 3 + 2); // 3 players
  });

  it('spectator (no cookie / unknown cookie) sees game_in_progress_spectator after start', async () => {
    const a = request.agent(server.app);
    const b = request.agent(server.app);
    await a.post('/api/join').send({ name: 'Alice' });
    await b.post('/api/join').send({ name: 'Bob' });
    await a.post('/api/start');
    const spectator = await request(server.app).get('/api/state');
    expect(spectator.body.mode).toBe('game_in_progress_spectator');
  });

  it('full round-trip: start, current player starts auction at $0, others pass, then advance', async () => {
    const a = request.agent(server.app);
    const b = request.agent(server.app);
    await a.post('/api/join').send({ name: 'Alice' });
    await b.post('/api/join').send({ name: 'Bob' });
    await a.post('/api/start');
    // Clear the setup draft (3 rounds) before normal turns can begin.
    await driveDraft(a, b);
    // Discover whose turn it is.
    let state = (await a.get('/api/state')).body.state;
    const currentPid = state.players[state.currentPlayerIndex].playerId;
    const currentAgent = currentPid === state.myPlayer.playerId ? a : b;
    const otherAgent = currentAgent === a ? b : a;
    const cardUid = state.market[0].uid;
    const r = await currentAgent.post('/api/turn-action').send({
      type: 'start_auction',
      cardUid,
      initialBid: 0
    });
    expect(r.status).toBe(200);
    // Other should now have an auction_bid prompt.
    let otherState = (await otherAgent.get('/api/state')).body.state;
    expect(otherState.myPrompt?.type).toBe('auction_bid');
    const p = await otherAgent.post('/api/auction-bid').send({ type: 'pass' });
    expect(p.status).toBe(200);
    // Resolve any sub-prompts (Tip-Off color, Scout peek) and drain any
    // Black Market side-auction triggered by the post-resolve market refill.
    let cur = (await currentAgent.get('/api/state')).body.state;
    let safety = 0;
    while ((cur.myPrompt || cur.auction) && safety < 15) {
      const pr = cur.myPrompt;
      if (pr) {
        let body: any = {};
        if (pr.type === 'peek_ack') body = {};
        else if (pr.type === 'pick_color') {
          const exclude = pr.payload?.exclude;
          body = { color: ['Blue', 'Orange', 'Green', 'Purple'].find(c => c !== exclude) };
        } else if (pr.type === 'auction_bid') {
          await currentAgent.post('/api/auction-bid').send({ type: 'pass' });
          cur = (await currentAgent.get('/api/state')).body.state;
          safety++;
          continue;
        }
        await currentAgent.post('/api/prompt-response').send({ promptId: pr.promptId, response: body });
      } else if (cur.auction) {
        // Auction in flight but no prompt on currentAgent — let other agent pass.
        const sB = (await otherAgent.get('/api/state')).body.state;
        if (sB.myPrompt?.type === 'auction_bid') {
          await otherAgent.post('/api/auction-bid').send({ type: 'pass' });
        }
      }
      cur = (await currentAgent.get('/api/state')).body.state;
      safety++;
    }
    // Game continues; turn has advanced.
    expect(cur.turnNumber).toBeGreaterThanOrEqual(2);
  });

  it('reset returns to lobby', async () => {
    const a = request.agent(server.app);
    const b = request.agent(server.app);
    await a.post('/api/join').send({ name: 'Alice' });
    await b.post('/api/join').send({ name: 'Bob' });
    await a.post('/api/start');
    const r = await request(server.app).post('/api/reset');
    expect(r.status).toBe(200);
    const s = await request(server.app).get('/api/state');
    expect(s.body.mode).toBe('lobby');
    expect(s.body.lobby).toEqual([]);
  });
});
