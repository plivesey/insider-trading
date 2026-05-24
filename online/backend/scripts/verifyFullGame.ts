/**
 * Drives a full 2-player game to game-over over HTTP using the same
 * endpoints the frontend uses, then resets the server back to lobby and
 * re-joins both players (cookie-preserved). Phase 10 self-verification.
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
  post(p: string, body?: unknown): Promise<{ status: number; body: any }>;
  get(p: string): Promise<{ status: number; body: any }>;
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
      return { status: res.status, body: text ? JSON.parse(text) : {} };
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

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'] as const;

async function promptResponseFor(pr: any): Promise<Record<string, unknown>> {
  switch (pr.type) {
    case 'peek_ack':
      return {};
    case 'pick_color':
      return { color: COLORS.find(c => c !== pr.payload?.exclude) };
    case 'pick_color_amount':
      return pr.payload?.perColor
        ? { choices: { Blue: pr.payload.amount, Orange: -pr.payload.amount, Yellow: pr.payload.amount, Purple: -pr.payload.amount } }
        : { color: 'Blue', sign: 'up' };
    case 'set_stock_choice':
      return { color: 'Blue' };
    case 'adjust_two_stocks_choice':
      return { upColor: 'Blue', downColor: 'Orange' };
    case 'wild_speculation_choice':
      return { sign: 'up' };
    case 'draw_and_keep': {
      const drawn = pr.payload?.drawn ?? [];
      const keepCount = pr.payload?.keepCount ?? 1;
      return { keepUids: drawn.slice(0, keepCount).map((d: any) => d.uid) };
    }
    case 'reorder_tips': {
      const tips = pr.payload?.tips ?? [];
      return { order: tips.map((t: any) => t.uid) };
    }
    case 'pick_market_card':
      return { cardUid: pr.payload?.market?.[0]?.uid ?? '' };
    case 'pick_hand_stock_for_swap':
    case 'pick_stock_from_hand':
    case 'pick_stock_from_target':
      return { stockUid: pr.payload?.stocks?.[0]?.uid ?? pr.payload?.hand?.[0]?.uid ?? '' };
    case 'pick_target_player':
      return { targetId: pr.payload?.targets?.[0] ?? '' };
    default:
      return {};
  }
}

async function drainPrompts(clients: ApiClient[]): Promise<boolean> {
  let progressed = false;
  for (let i = 0; i < 30; i++) {
    let found = false;
    for (const c of clients) {
      const s = await c.get('/api/state');
      const pr = s.body.state?.myPrompt;
      if (!pr || pr.type === 'auction_bid') continue;
      found = true;
      progressed = true;
      const response = await promptResponseFor(pr);
      await c.post('/api/prompt-response', { promptId: pr.promptId, response });
    }
    if (!found) break;
  }
  return progressed;
}

async function tryClaimGoals(client: ApiClient): Promise<boolean> {
  const s = await client.get('/api/state');
  const game = s.body.state;
  if (!game || game.gameOver) return false;
  const my = game.myPlayer;
  if (!my) return false;
  const ownedColors: Record<string, string[]> = {};
  for (const card of my.hand) {
    if (card.category === 'stock' && card.color !== 'Wild') {
      (ownedColors[card.color] ??= []).push(card.uid);
    }
  }
  const wilds = my.hand.filter((c: any) => c.category === 'stock' && c.color === 'Wild').map((c: any) => c.uid);

  for (const goal of game.activeGoals) {
    // Greedy goal-satisfaction: try to fulfill `goal.goal.requirements` using owned colored stocks + wilds.
    const reqs: { color: string; count: number }[] = (goal.goal.requirements ?? []).map((r: any) => ({ color: r.color, count: r.count }));
    if (reqs.length === 0) continue;
    const assignment: Record<string, string> = {};
    const used: Record<string, number> = {};
    let wildIdx = 0;
    let ok = true;
    for (const r of reqs) {
      const avail = ownedColors[r.color] ?? [];
      let taken = 0;
      while (taken < r.count) {
        const idx = (used[r.color] ?? 0);
        if (idx < avail.length) {
          assignment[avail[idx]] = r.color;
          used[r.color] = idx + 1;
        } else if (wildIdx < wilds.length) {
          assignment[wilds[wildIdx]] = r.color;
          wildIdx++;
        } else {
          ok = false;
          break;
        }
        taken++;
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const r = await client.post('/api/free-action', {
      request: {
        kind: 'claim_goal',
        goalUid: goal.uid,
        stockAssignment: { cards: assignment }
      }
    });
    if (r.status === 200) return true;
  }
  return false;
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'it-verify-full-'));
  const server = await startServer({
    port: 0,
    snapshotPath: path.join(tmp, 'game_state.json'),
    logsDir: path.join(tmp, 'game_logs'),
    cardsDir: CARDS_DIR,
    silent: true
  });
  const base = `http://localhost:${server.port}`;
  console.log(`[verifyFullGame] booted on ${base}`);

  const A = makeClient(base);
  const B = makeClient(base);

  await A.post('/api/join', { name: 'Alice' });
  await B.post('/api/join', { name: 'Bob' });
  const startRes = await A.post('/api/start');
  assert(startRes.status === 200, 'start ok');

  let s = await A.get('/api/state');
  assert(s.body.mode === 'in_game', 'in_game after start');
  const players = s.body.state.players;
  const clients: Record<string, ApiClient> = {};
  for (const p of players) {
    if (p.name === 'Alice') clients[p.playerId] = A;
    if (p.name === 'Bob') clients[p.playerId] = B;
  }
  const allClients = [A, B];

  let safety = 0;
  while (safety++ < 400) {
    s = await A.get('/api/state');
    const game = s.body.state;
    if (!game || game.gameOver) break;

    if (await drainPrompts(allClients)) continue;

    if (game.auction) {
      const bidderId = game.auction.awaitingBidderId;
      if (!bidderId) continue;
      const r = await clients[bidderId].post('/api/auction-bid', { type: 'pass' });
      if (r.status !== 200) { console.error('bid/pass failed', r.body); break; }
      continue;
    }

    if (await tryClaimGoals(A)) continue;
    if (await tryClaimGoals(B)) continue;

    const cur = game.players[game.currentPlayerIndex];
    if (!cur) break;
    const curClient = clients[cur.playerId];
    const market = game.market;
    if (market.length === 0) break;
    const r = await curClient.post('/api/turn-action', {
      type: 'start_auction',
      cardUid: market[0].uid,
      initialBid: 0
    });
    if (r.status !== 200) {
      // fallback: try sell
      const curState = (await curClient.get('/api/state')).body.state;
      const myHand = curState.myPlayer?.hand ?? [];
      const sellable = myHand.find((c: any) => c.category === 'stock' && c.color !== 'Wild');
      if (sellable) {
        await curClient.post('/api/turn-action', { type: 'sell_stock', stockUid: sellable.uid });
      } else {
        console.error('no valid turn action; market start_auction failed:', r.body);
        break;
      }
    }
  }

  s = await A.get('/api/state');
  assert(s.body.mode === 'game_over' || s.body.state?.gameOver, `reached game over (safety=${safety})`);
  const go = s.body.state.gameOver;
  assert(go, 'gameOver populated');
  assert(['insider_tip_deck_empty', 'one_goal_remaining'].includes(go.reason), `valid end reason: ${go.reason}`);
  assert(Array.isArray(go.breakdown) && go.breakdown.length === 2, 'breakdown has 2 entries');
  assert(go.winnerPlayerIds.length >= 1, 'at least one winner');
  console.log(`[verifyFullGame] game ended via ${go.reason}, winner(s): ${go.winnerPlayerIds.length}`);

  // Reset + re-lobby (mirrors GameOverPanel "New Game" button).
  const preResetMe = await A.get('/api/me');
  const originalPlayerId = preResetMe.body.playerId;
  assert(typeof originalPlayerId === 'string' && originalPlayerId.length > 0, 'playerId from /me before reset');

  const rr = await A.post('/api/reset');
  assert(rr.status === 200, 'reset ok');
  s = await A.get('/api/state');
  assert(s.body.mode === 'lobby', 'lobby after reset');

  // Cookie itself persists (same playerId returned even though lobby is fresh).
  const postResetMe = await A.get('/api/me');
  assert(postResetMe.body.playerId === originalPlayerId, 'same playerId after reset (cookie preserved)');
  assert(postResetMe.body.name === null, 'name cleared after reset (lobby is fresh)');

  // Re-join with same name: cookie-aware join reuses the playerId.
  const rj = await A.post('/api/join', { name: 'Alice' });
  assert(rj.status === 200, 'rejoin A ok');
  assert(rj.body.playerId === originalPlayerId, 'rejoin preserves playerId via cookie');

  console.log('[verifyFullGame] all assertions passed');
  server.server.close();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
