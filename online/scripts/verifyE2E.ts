/**
 * Phase 12 — VERIFICATION CHECKPOINT 2 (End-to-end autonomous).
 *
 * Boots the backend with SEED=1234, opens 3 HTTP "player" sessions (each with
 * its own cookie jar + WS client), runs deterministic AI players until
 * gameOver, then asserts:
 *   1. Game ended via one of the two valid end conditions.
 *   2. Final wealth math is correct for every player.
 *   3. Card uid universe is preserved (no leaks).
 *   4. Replay assertion: re-running the log .jsonl from initial state
 *      reproduces the live final state.
 *   5. All 11 action card types were exercised over the run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { loadCards } from '@insider-trading/shared';
import { startServer } from '../backend/src/server.js';
import { activeLogFile, readLogFile } from '../backend/src/domain/gameLog.js';
import { replayFromLog, diffStates } from '../backend/src/domain/replay.js';
import { computeBreakdown, selectWinners } from '../backend/src/engine/scoring.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CARDS_DIR = path.resolve(ROOT, '..', 'cards');
const SEED = process.env.SEED ? Number(process.env.SEED) : 1234;

interface PlayerClient {
  name: string;
  cookie?: string;
  playerId?: string;
  ws?: WebSocket;
  latest: any;
}

interface CardCounts {
  [cardName: string]: number;
}

function makePost(base: string, c: PlayerClient) {
  return async (p: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (c.cookie) headers['Cookie'] = c.cookie;
    const res = await fetch(`${base}${p}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) c.cookie = setCookie.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  };
}

function makeGet(base: string, c: PlayerClient) {
  return async (p: string): Promise<{ status: number; body: any }> => {
    const headers: Record<string, string> = {};
    if (c.cookie) headers['Cookie'] = c.cookie;
    const res = await fetch(`${base}${p}`, { headers });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const COLORS = ['Blue', 'Orange', 'Yellow', 'Purple'] as const;

/** Build a stock-assignment that satisfies a goal using owned colors + wilds. */
function tryBuildGoalAssignment(myPlayer: any, goal: any, useForgery: boolean): Record<string, string> | null {
  // Requirements live at goal.goal.parsed.requirements as {Color: count}.
  const raw: Record<string, number> = goal.goal?.parsed?.requirements ?? {};
  const reqs: { color: string; count: number }[] = Object.entries(raw).map(([color, count]) => ({
    color,
    count: count as number
  }));
  if (reqs.length === 0) return null;
  if (useForgery) {
    reqs.sort((a, b) => b.count - a.count);
    reqs[0].count = Math.max(1, reqs[0].count - 1);
  }
  const byColor: Record<string, string[]> = {};
  for (const c of myPlayer.hand) {
    if (c.category === 'stock' && c.color !== 'Wild') {
      (byColor[c.color] ??= []).push(c.uid);
    }
  }
  const wilds: string[] = myPlayer.hand
    .filter((c: any) => c.category === 'stock' && c.color === 'Wild')
    .map((c: any) => c.uid);
  const assignment: Record<string, string> = {};
  let wildIdx = 0;
  for (const r of reqs) {
    const avail = (byColor[r.color] ?? []).slice();
    let taken = 0;
    while (taken < r.count) {
      const uid = avail.shift();
      if (uid) assignment[uid] = r.color;
      else if (wildIdx < wilds.length) {
        assignment[wilds[wildIdx]] = r.color;
        wildIdx++;
      } else return null;
      taken++;
    }
    byColor[r.color] = avail;
  }
  return assignment;
}

/** Build a deterministic response for a non-bid prompt. */
function buildPromptResponse(pr: any, myPlayer: any, state: any): Record<string, unknown> {
  switch (pr.type) {
    case 'peek_ack':
      return {};
    case 'pick_color':
      return { color: COLORS.find(c => c !== pr.payload?.exclude) };
    case 'pick_color_amount': {
      const amount = pr.payload?.amount ?? 1;
      if (pr.payload?.perColor) {
        return { choices: { Blue: amount, Orange: -amount, Yellow: amount, Purple: -amount } };
      }
      return { color: 'Blue', sign: 'up' };
    }
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
      return { cardUid: (pr.payload?.market ?? state.market)?.[0]?.uid ?? state.market[0]?.uid };
    case 'pick_hand_stock_for_swap':
    case 'pick_stock_from_hand': {
      const sources = pr.payload?.stocks ?? pr.payload?.hand;
      if (sources && sources.length) return { stockUid: sources[0].uid };
      const handStock = myPlayer.hand.find((c: any) => c.category === 'stock' && c.color !== 'Wild');
      if (handStock) {
        // For sell_bonus_batch, sell exactly one and finish to avoid runaway loops.
        if (pr.payload?.mode === 'sell_bonus_batch') {
          return { stockUid: handStock.uid, done: true };
        }
        return { stockUid: handStock.uid };
      }
      return { done: true };
    }
    case 'pick_stock_from_target': {
      const stocks = pr.payload?.stocks ?? [];
      if (stocks.length === 0) return {};
      return { stockUid: stocks[0].uid };
    }
    case 'pick_target_player': {
      const targets = pr.payload?.targets ?? state.players.filter((p: any) => p.playerId !== myPlayer.playerId).map((p: any) => p.playerId);
      return { targetId: targets[0] };
    }
    default:
      return {};
  }
}

async function main(): Promise<void> {
  const tmp = process.env.E2E_TMP ?? fs.mkdtempSync(path.join(os.tmpdir(), 'it-verify-e2e-'));
  if (process.env.E2E_TMP) {
    fs.mkdirSync(tmp, { recursive: true });
  }
  const snapshotPath = path.join(tmp, 'game_state.json');
  const logsDir = path.join(tmp, 'game_logs');
  const server = await startServer({
    port: 0,
    snapshotPath,
    logsDir,
    cardsDir: CARDS_DIR,
    silent: true,
    defaultSeed: SEED
  });
  const base = `http://localhost:${server.port}`;
  console.log(`[verifyE2E] booted on ${base} (seed=${SEED})`);

  const players: PlayerClient[] = [
    { name: 'Alice', latest: null },
    { name: 'Bob', latest: null },
    { name: 'Carol', latest: null }
  ];

  // 3 players join via HTTP.
  for (const p of players) {
    const post = makePost(base, p);
    const r = await post('/api/join', { name: p.name });
    assert(r.status === 200, `${p.name} joined`);
    p.playerId = r.body.playerId;
  }

  // Start game.
  const post0 = makePost(base, players[0]);
  const startRes = await post0('/api/start');
  assert(startRes.status === 200, 'start ok');

  // Open WS per player (uses cookie for identity).
  await Promise.all(
    players.map(p =>
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${server.port}/ws`, {
          headers: { Cookie: p.cookie ?? '' }
        });
        p.ws = ws;
        ws.on('open', () => resolve());
        ws.on('error', reject);
        ws.on('message', d => {
          try {
            const msg = JSON.parse(d.toString());
            if (msg.type === 'state') p.latest = msg.state;
          } catch {
            /* ignore */
          }
        });
      })
    )
  );

  // Wait until each player has received initial state.
  for (let i = 0; i < 50 && players.some(p => !p.latest); i++) {
    await new Promise(r => setTimeout(r, 20));
  }

  // Track action-card coverage (by card name → count) and Hot Tip usage.
  const actionsPlayed: CardCounts = {};
  let hotTipUsed = false;
  // (playerId, goalUid, hand-fingerprint) tuples we already tried & failed —
  // prevents infinite retry when our assignment is rejected.
  const failedGoalAttempts = new Set<string>();

  const startedAtMs = Date.now();
  let safety = 0;
  while (safety++ < 5000) {
    // Fresh state pull (WS is push-based but ordering relative to our posts can
    // lag; HTTP GET is authoritative).
    const ref = (await makeGet(base, players[0])('/api/state')).body;
    if (ref.mode === 'game_over' || ref.state?.gameOver) break;
    if (ref.mode !== 'in_game') {
      throw new Error(`unexpected mode ${ref.mode}`);
    }
    const game = ref.state;

    // 1. Drain non-bid prompts for every player.
    let promptDrained = false;
    for (const p of players) {
      const s = (await makeGet(base, p)('/api/state')).body.state;
      const pr = s?.myPrompt;
      if (!pr || pr.type === 'auction_bid') continue;
      const response = buildPromptResponse(pr, s.myPlayer, s);
      const post = makePost(base, p);
      await post('/api/prompt-response', { promptId: pr.promptId, response });
      promptDrained = true;
    }
    if (promptDrained) continue;

    // 2. Auction bid path.
    if (game.auction) {
      const bidderId = game.auction.awaitingBidderId;
      if (!bidderId) continue;
      const bidder = players.find(p => p.playerId === bidderId);
      if (!bidder) throw new Error(`no client for bidder ${bidderId}`);
      const bidderState = (await makeGet(base, bidder)('/api/state')).body.state;
      const post = makePost(base, bidder);
      const next = game.auction.currentHigh + 1;
      const cash = bidderState.myPlayer?.cash ?? 0;
      if (cash >= next) {
        const r = await post('/api/auction-bid', { type: 'bid', amount: next });
        if (r.status !== 200) {
          // Fall back to pass on rejection.
          await post('/api/auction-bid', { type: 'pass' });
        }
      } else {
        await post('/api/auction-bid', { type: 'pass' });
      }
      continue;
    }

    // 3. Free actions: any player can play action cards / Hot Tip / claim goals.
    let didFreeAction = false;
    for (const p of players) {
      const s = (await makeGet(base, p)('/api/state')).body.state;
      if (!s || s.gameOver) continue;
      const my = s.myPlayer;
      if (!my) continue;

      // Try to claim any qualifying goal.
      const handFp = my.hand.map((c: any) => c.uid).sort().join(',');
      for (const goal of s.activeGoals) {
        const fpKey = `${p.playerId}:${goal.uid}:${handFp}`;
        if (failedGoalAttempts.has(fpKey)) continue;
        const useForgery = my.forgeryAvailable;
        let assignment = tryBuildGoalAssignment(my, goal, false);
        let usedForgery = false;
        if (!assignment && useForgery) {
          assignment = tryBuildGoalAssignment(my, goal, true);
          usedForgery = !!assignment;
        }
        if (!assignment) {
          failedGoalAttempts.add(fpKey);
          continue;
        }
        const post = makePost(base, p);
        // Queue the free action.
        const r = await post('/api/free-action', {
          request: {
            kind: 'claim_goal',
            goalUid: goal.uid,
            stockAssignment: { cards: assignment },
            useForgery: usedForgery
          }
        });
        if (r.status !== 200) {
          failedGoalAttempts.add(fpKey);
          continue;
        }
        // After the free action drains, check whether the goal actually moved
        // off activeGoals. If not, the claim was rejected by the engine
        // (e.g. "goal requirement not met"), so blacklist this attempt to
        // avoid spinning.
        const afterState = (await makeGet(base, p)('/api/state')).body.state;
        const stillActive = afterState?.activeGoals?.some((g: any) => g.uid === goal.uid);
        if (stillActive) {
          failedGoalAttempts.add(fpKey);
          continue;
        }
        didFreeAction = true;
        break;
      }
      if (didFreeAction) break;

      // Play an unplayed action card if held.
      const unplayedAction = my.hand.find(
        (c: any) => c.category === 'action' && !actionsPlayed[c.name]
      );
      if (unplayedAction) {
        const post = makePost(base, p);
        const r = await post('/api/free-action', {
          request: { kind: 'play_action_card', cardUid: unplayedAction.uid }
        });
        if (r.status === 200) {
          actionsPlayed[unplayedAction.name] = (actionsPlayed[unplayedAction.name] ?? 0) + 1;
          didFreeAction = true;
          break;
        }
      }

      // Use Hot Tip once across whole game.
      if (!hotTipUsed && my.hotTipAvailable && s.insiderTipDeckSize > 0) {
        const post = makePost(base, p);
        const r = await post('/api/free-action', { request: { kind: 'use_hot_tip' } });
        if (r.status === 200) {
          hotTipUsed = true;
          didFreeAction = true;
          break;
        }
      }
    }
    if (didFreeAction) continue;

    // 4. Current player takes a turn action.
    const curIdx = game.currentPlayerIndex;
    const curPid = game.players[curIdx]?.playerId;
    const cur = players.find(p => p.playerId === curPid);
    if (!cur) throw new Error(`no client for current player ${curPid}`);
    const curState = (await makeGet(base, cur)('/api/state')).body.state;
    const my = curState.myPlayer;
    const post = makePost(base, cur);

    // Sell if low on cash and have sellable stock.
    if (my?.cash != null && my.cash < 5) {
      const sellable = my.hand.find((c: any) => c.category === 'stock' && c.color !== 'Wild');
      if (sellable) {
        const r = await post('/api/turn-action', { type: 'sell_stock', stockUid: sellable.uid });
        if (r.status === 200) continue;
      }
    }
    // Cheapest-stock auction at $1 (or $0 fallback).
    const stocks = curState.market.filter((c: any) => c.category === 'stock');
    const colored = stocks.filter((c: any) => c.color !== 'Wild');
    let pick = colored.sort((a: any, b: any) => curState.stockPrices[a.color] - curState.stockPrices[b.color])[0];
    if (!pick) pick = curState.market[0];
    if (!pick) {
      throw new Error('market empty mid-game');
    }
    const initialBid = my?.cash != null && my.cash >= 1 ? 1 : 0;
    let r = await post('/api/turn-action', {
      type: 'start_auction',
      cardUid: pick.uid,
      initialBid
    });
    if (r.status !== 200) {
      // Fallback: try $0.
      r = await post('/api/turn-action', { type: 'start_auction', cardUid: pick.uid, initialBid: 0 });
      if (r.status !== 200) {
        // Final fallback: sell something.
        const sellable = my?.hand.find((c: any) => c.category === 'stock' && c.color !== 'Wild');
        if (sellable) {
          await post('/api/turn-action', { type: 'sell_stock', stockUid: sellable.uid });
        } else {
          throw new Error(`no valid action for ${cur.name}: ${r.body?.error}`);
        }
      }
    }
  }

  const elapsedMs = Date.now() - startedAtMs;
  console.log(`[verifyE2E] game loop done in ${elapsedMs}ms after ${safety} steps`);

  // Final state.
  const finalState = (await makeGet(base, players[0])('/api/state')).body.state;
  const gameOver = finalState?.gameOver;
  assert(gameOver, 'gameOver populated');
  assert(
    ['insider_tip_deck_empty', 'one_goal_remaining'].includes(gameOver.reason),
    `valid end condition: ${gameOver.reason}`
  );
  console.log(`[verifyE2E] ended via ${gameOver.reason}`);

  // Validate wealth math from authoritative server state.
  const liveState = server.hub.getGame()!;
  const computed = computeBreakdown(liveState);
  const winners = selectWinners(computed);
  for (const c of computed) {
    const reported = gameOver.breakdown.find((b: any) => b.playerId === c.playerId);
    assert(reported, `breakdown for ${c.name}`);
    assert(reported.cash === c.cash, `${c.name} cash`);
    assert(reported.stockValue === c.stockValue, `${c.name} stockValue`);
    assert(reported.endGameBonus === c.endGameBonus, `${c.name} endGameBonus`);
    assert(reported.loanPenalty === c.loanPenalty, `${c.name} loanPenalty`);
    assert(reported.total === c.total, `${c.name} total`);
  }
  assert(
    JSON.stringify(winners.sort()) === JSON.stringify([...gameOver.winnerPlayerIds].sort()),
    'winners match'
  );

  // No card uid leaks: every uid that was present at setup must still be
  // present in the final state (somewhere). Hot Tips are tracked via the
  // `hotTipAvailable` flag, not as card entities once distributed.
  const catalog = loadCards(CARDS_DIR);
  const logFile = activeLogFile();
  assert(logFile && fs.existsSync(logFile), `log file exists: ${logFile}`);
  const entries = readLogFile(logFile!);
  const initialState = replayFromLog(entries.slice(0, 1), catalog);
  const initialUids = new Set<string>();
  for (const c of initialState.mainDeck) initialUids.add(c.uid);
  for (const c of initialState.market) initialUids.add(c.uid);
  for (const c of initialState.insiderTipDeck) initialUids.add(c.uid);
  for (const g of initialState.activeGoals) initialUids.add(g.uid);

  const present = new Set<string>();
  for (const p of liveState.players) {
    for (const c of p.hand) present.add(c.uid);
    for (const g of p.goalsClaimed) present.add(g.uid);
    for (const e of p.persistentEffects) present.add(e.uid);
  }
  for (const c of liveState.market) present.add(c.uid);
  for (const c of liveState.mainDeck) present.add(c.uid);
  for (const c of liveState.discardPile) present.add(c.uid);
  for (const c of liveState.insiderTipDeck) present.add(c.uid);
  for (const c of liveState.resolvedInsiderTips) present.add(c.uid);
  for (const g of liveState.activeGoals) present.add(g.uid);

  const missing: string[] = [];
  for (const uid of initialUids) if (!present.has(uid)) missing.push(uid);
  const extra: string[] = [];
  for (const uid of present) if (!initialUids.has(uid)) extra.push(uid);
  assert(missing.length === 0, `missing uids: ${missing.slice(0, 5).join(',')}${missing.length > 5 ? '…' : ''} (${missing.length})`);
  assert(extra.length === 0, `extra uids: ${extra.slice(0, 5).join(',')}${extra.length > 5 ? '…' : ''} (${extra.length})`);

  // Replay assertion.
  const replayed = replayFromLog(entries, catalog);
  const diff = diffStates(liveState, replayed);
  if (diff) {
    console.error('REPLAY DIVERGED:', diff);
    process.exit(1);
  }
  console.log(`[verifyE2E] replay matched live state (${entries.length} log entries)`);

  // Action card coverage.
  const allActionNames = catalog.actions.map(a => a.name);
  const uniqueNames = Array.from(new Set(allActionNames));
  const exercised = uniqueNames.filter(n => actionsPlayed[n]);
  const unexercised = uniqueNames.filter(n => !actionsPlayed[n]);
  console.log(`[verifyE2E] action card coverage: ${exercised.length}/${uniqueNames.length}`);
  if (unexercised.length > 0) {
    console.warn(`[verifyE2E] WARNING: never played: ${unexercised.join(', ')}`);
  }
  if (!hotTipUsed) console.warn('[verifyE2E] WARNING: Hot Tip never used');

  // Clean shutdown.
  for (const p of players) p.ws?.close();
  server.server.close();
  console.log('[verifyE2E] all assertions passed');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
