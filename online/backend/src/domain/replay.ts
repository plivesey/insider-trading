import type {
  CardCatalog,
  FreeActionRequest,
  GameLogEntry,
  GameState,
  PlayerId
} from '@insider-trading/shared';
import { createGameState } from './setup.js';
import { sellStock } from '../engine/turn.js';
import { startAuction, bid, pass } from '../engine/auction.js';
import { submitFreeAction } from '../engine/freeActions.js';
import { respondToPrompt } from '../engine/promptResponse.js';
import { advance } from '../engine/advance.js';

/**
 * Re-create the final game state from a per-game log file.
 *
 * The first log entry is `game_start` carrying gameId, seed, players, etc.
 * Subsequent `op_*` entries are user operations issued by the route layer —
 * replaying them in order against a fresh deterministic-seeded game must
 * reproduce the same final state (modulo non-deterministic metadata like the
 * `connected` map, log timestamps, and `eventCounter`).
 */
export function replayFromLog(entries: GameLogEntry[], catalog: CardCatalog): GameState {
  if (entries.length === 0) throw new Error('empty log');
  const gameStart = entries[0];
  if (gameStart.type !== 'game_start') {
    throw new Error(`first event must be game_start, got ${gameStart.type}`);
  }
  const p = gameStart.payload ?? {};
  const players = p.players as { playerId: PlayerId; name: string }[];
  const seed = p.seed as number;
  const gameId = p.gameId as string;
  const startedAt = gameStart.ts;
  const state = createGameState({ catalog, players, seed, gameId, startedAt });

  for (let i = 1; i < entries.length; i++) {
    const ev = entries[i];
    if (!ev.type.startsWith('op_')) continue;
    applyOp(state, ev);
  }
  return state;
}

function applyOp(state: GameState, ev: GameLogEntry): void {
  const actor = ev.actor as PlayerId;
  const payload = ev.payload ?? {};
  const events: GameLogEntry[] = [];
  switch (ev.type) {
    case 'op_start_auction': {
      const r = startAuction(state, actor, payload.cardUid as string, payload.initialBid as number);
      if (!r.ok) throw new Error(`replay op_start_auction failed: ${r.error}`);
      events.push(...r.events);
      break;
    }
    case 'op_sell_stock': {
      const r = sellStock(state, actor, payload.stockUid as string);
      if (!r.ok) throw new Error(`replay op_sell_stock failed: ${r.error}`);
      events.push(...r.events);
      break;
    }
    case 'op_auction_bid': {
      const r = bid(state, actor, payload.amount as number);
      if (!r.ok) throw new Error(`replay op_auction_bid failed: ${r.error}`);
      events.push(...r.events);
      break;
    }
    case 'op_auction_pass': {
      const r = pass(state, actor);
      if (!r.ok) throw new Error(`replay op_auction_pass failed: ${r.error}`);
      events.push(...r.events);
      break;
    }
    case 'op_free_action': {
      const r = submitFreeAction(state, actor, payload.request as FreeActionRequest);
      if (!r.ok) throw new Error(`replay op_free_action failed: ${r.error}`);
      events.push(...r.events);
      break;
    }
    case 'op_prompt_response': {
      // Prompt IDs include Date.now() + counter, so they're non-deterministic
      // across runs. During replay, use whatever prompt is currently active
      // for this actor — the event sequence guarantees we're at the right
      // step.
      const live = state.pendingPrompts[actor];
      if (!live) throw new Error(`replay op_prompt_response: no active prompt for ${actor}`);
      const r = respondToPrompt(
        state,
        actor,
        live.promptId,
        (payload.response as Record<string, unknown>) ?? {}
      );
      if (!r.ok) throw new Error(`replay op_prompt_response failed: ${r.error}`);
      events.push(...r.events);
      break;
    }
    default:
      return;
  }
  advance(state, events);
}

/**
 * Compare two game states for structural equality, ignoring non-deterministic
 * fields (timestamps inside events, the `connected` map, eventCounter).
 *
 * Returns null if equal, or a string describing the first divergence.
 */
export function diffStates(a: GameState, b: GameState): string | null {
  const fields: (keyof GameState)[] = [
    'gameId',
    'seed',
    'version',
    'status',
    'stockPrices',
    'currentPlayerIndex',
    'turnNumber',
    'turnPhase',
    'rngCursor'
  ];
  for (const f of fields) {
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
      return `field ${String(f)} differs: ${JSON.stringify(a[f])} vs ${JSON.stringify(b[f])}`;
    }
  }
  if (a.players.length !== b.players.length) return `player count differs`;
  for (let i = 0; i < a.players.length; i++) {
    const pa = a.players[i];
    const pb = b.players[i];
    if (pa.playerId !== pb.playerId) return `player[${i}] id differs`;
    if (pa.cash !== pb.cash) return `player[${i}] cash: ${pa.cash} vs ${pb.cash}`;
    if (pa.loans !== pb.loans) return `player[${i}] loans: ${pa.loans} vs ${pb.loans}`;
    if (pa.endGameCashBonus !== pb.endGameCashBonus) return `player[${i}] endGameCashBonus: ${pa.endGameCashBonus} vs ${pb.endGameCashBonus}`;
    if (pa.hotTipAvailable !== pb.hotTipAvailable) return `player[${i}] hotTipAvailable`;
    const handA = pa.hand.map(c => c.uid).sort().join(',');
    const handB = pb.hand.map(c => c.uid).sort().join(',');
    if (handA !== handB) return `player[${i}] hand: ${handA} vs ${handB}`;
    const goalsA = pa.goalsClaimed.map(g => g.uid).sort().join(',');
    const goalsB = pb.goalsClaimed.map(g => g.uid).sort().join(',');
    if (goalsA !== goalsB) return `player[${i}] goalsClaimed: ${goalsA} vs ${goalsB}`;
    const peA = pa.persistentEffects.map(e => e.uid).sort().join(',');
    const peB = pb.persistentEffects.map(e => e.uid).sort().join(',');
    if (peA !== peB) return `player[${i}] persistentEffects: ${peA} vs ${peB}`;
  }
  const cardListsEqual = (xs: { uid: string }[], ys: { uid: string }[], label: string): string | null => {
    if (xs.length !== ys.length) return `${label} length: ${xs.length} vs ${ys.length}`;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i].uid !== ys[i].uid) return `${label}[${i}] uid: ${xs[i].uid} vs ${ys[i].uid}`;
    }
    return null;
  };
  const checks: [string, { uid: string }[], { uid: string }[]][] = [
    ['market', a.market, b.market],
    ['mainDeck', a.mainDeck, b.mainDeck],
    ['discardPile', a.discardPile, b.discardPile],
    ['insiderTipDeck', a.insiderTipDeck, b.insiderTipDeck],
    ['resolvedInsiderTips', a.resolvedInsiderTips, b.resolvedInsiderTips],
    ['activeGoals', a.activeGoals, b.activeGoals]
  ];
  for (const [label, x, y] of checks) {
    const r = cardListsEqual(x, y, label);
    if (r) return r;
  }
  if (JSON.stringify(a.gameOver) !== JSON.stringify(b.gameOver)) {
    // Allow `endedAt` (ISO timestamp) to differ.
    const stripTs = (o: any) => (o ? { ...o, endedAt: '' } : o);
    if (JSON.stringify(stripTs(a.gameOver)) !== JSON.stringify(stripTs(b.gameOver))) {
      return `gameOver differs`;
    }
  }
  return null;
}
