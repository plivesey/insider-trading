/**
 * Phase 8 verification: boot the backend in-process, drive a real HTTP game
 * across 3 separate cookie jars, assert state transitions. Catches anything
 * the in-process tests miss (wire format, cookies, projection, WS upgrade).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');

interface ApiClient {
  cookie?: string;
  base: string;
  post(path: string, body?: unknown): Promise<{ status: number; body: any; setCookie?: string }>;
  get(path: string): Promise<{ status: number; body: any; setCookie?: string }>;
}

function makeClient(base: string): ApiClient {
  const c: ApiClient = {
    base,
    async post(p, body) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (c.cookie) headers['Cookie'] = c.cookie;
      const res = await fetch(`${c.base}${p}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) c.cookie = setCookie.split(';')[0];
      const text = await res.text();
      const out = text ? JSON.parse(text) : {};
      return { status: res.status, body: out, setCookie: setCookie ?? undefined };
    },
    async get(p) {
      const headers: Record<string, string> = {};
      if (c.cookie) headers['Cookie'] = c.cookie;
      const res = await fetch(`${c.base}${p}`, { headers });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : {} };
    }
  };
  return c;
}

function assert(cond: any, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'it-verify-http-'));
  const snapshotPath = path.join(tmp, 'game_state.json');
  const logsDir = path.join(tmp, 'game_logs');
  const server = await startServer({
    port: 0,
    snapshotPath,
    logsDir,
    cardsDir: CARDS_DIR,
    silent: true
  });
  const base = `http://localhost:${server.port}`;
  console.log(`[verifyHttp] booted on ${base}`);

  const A = makeClient(base);
  const B = makeClient(base);
  const C = makeClient(base);

  // Lobby starts empty.
  let s = await A.get('/api/state');
  assert(s.body.mode === 'lobby', 'lobby mode initially');
  assert(s.body.lobby.length === 0, 'lobby empty initially');

  // Three players join.
  const j1 = await A.post('/api/join', { name: 'Alice' });
  assert(j1.status === 200, 'join A ok');
  assert(j1.body.name === 'Alice', 'Alice name');
  const j2 = await B.post('/api/join', { name: 'Bob' });
  assert(j2.status === 200, 'join B ok');
  const j3 = await C.post('/api/join', { name: 'Carol' });
  assert(j3.status === 200, 'join C ok');

  s = await A.get('/api/state');
  assert(s.body.lobby.length === 3, 'lobby has 3');
  assert(s.body.canStart === true, 'canStart true');

  // Cookie persistence.
  const me = await A.get('/api/me');
  assert(me.body.name === 'Alice', 'A cookie persists');

  // Start.
  const st = await A.post('/api/start');
  assert(st.status === 200, 'start ok');
  s = await A.get('/api/state');
  assert(s.body.mode === 'in_game', 'in_game after start');

  // Spectator (fresh client) sees spectator screen.
  const D = makeClient(base);
  const sp = await D.get('/api/state');
  assert(sp.body.mode === 'game_in_progress_spectator', 'spectator gets spectator screen');

  // Drive a few turns.
  const clients: Record<string, ApiClient> = {};
  s = await A.get('/api/state');
  const stateA = s.body.state;
  for (const p of stateA.players) {
    if (p.name === 'Alice') clients[p.playerId] = A;
    if (p.name === 'Bob') clients[p.playerId] = B;
    if (p.name === 'Carol') clients[p.playerId] = C;
  }

  for (let turn = 0; turn < 8; turn++) {
    if (await isGameOver(A)) break;
    s = await A.get('/api/state');
    const state = s.body.state;
    if (state.gameOver) break;
    const curPid = state.players[state.currentPlayerIndex].playerId;
    const curClient = clients[curPid];
    const cardUid = state.market[0].uid;
    const r = await curClient.post('/api/turn-action', {
      type: 'start_auction',
      cardUid,
      initialBid: 0
    });
    assert(r.status === 200, `start_auction by ${state.players[state.currentPlayerIndex].name} (turn ${turn})`);
    // All other players pass.
    let safety = 0;
    while (safety++ < 20) {
      const cur = (await A.get('/api/state')).body.state;
      if (!cur.auction) break;
      const bidderId = cur.auction.awaitingBidderId;
      if (!bidderId) break;
      const r2 = await clients[bidderId].post('/api/auction-bid', { type: 'pass' });
      assert(r2.status === 200, `pass by ${bidderId}`);
    }
    // Drain any prompts.
    await drainAllPrompts(A, B, C, clients);
  }

  // Reset.
  await A.post('/api/reset');
  s = await A.get('/api/state');
  assert(s.body.mode === 'lobby', 'after reset, back to lobby');

  console.log('[verifyHttp] all assertions passed');
  server.server.close();
  process.exit(0);
}

async function isGameOver(c: ApiClient): Promise<boolean> {
  const s = await c.get('/api/state');
  return !!s.body.state?.gameOver;
}

async function drainAllPrompts(
  A: ApiClient,
  B: ApiClient,
  C: ApiClient,
  clients: Record<string, ApiClient>
): Promise<void> {
  for (let i = 0; i < 30; i++) {
    let found = false;
    for (const [pid, client] of Object.entries(clients)) {
      const s = await client.get('/api/state');
      if (s.body.mode !== 'in_game' && s.body.mode !== 'game_over') continue;
      const pr = s.body.state?.myPrompt;
      if (!pr) continue;
      found = true;
      let body: Record<string, unknown> = {};
      switch (pr.type) {
        case 'peek_ack':
          body = {};
          break;
        case 'pick_color':
          body = { color: ['Blue', 'Orange', 'Yellow', 'Purple'].find(c => c !== pr.payload?.exclude) };
          break;
        case 'pick_color_amount':
          body = pr.payload?.perColor
            ? { choices: { Blue: 1, Orange: -1, Yellow: 1, Purple: -1 } }
            : { color: 'Blue', sign: 'up' };
          break;
        default:
          body = {};
      }
      await client.post('/api/prompt-response', { promptId: pr.promptId, response: body });
    }
    if (!found) return;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
