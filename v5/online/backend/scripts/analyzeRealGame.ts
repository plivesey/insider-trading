import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FreeActionRequest, GameLogEntry, GameState, PlayerId, StockCard, ActionCard } from '@insider-trading/shared';
import { loadCards } from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { readLogFile } from '../src/domain/gameLog.js';
import { advance } from '../src/engine/advance.js';
import { startAuction, bid, pass } from '../src/engine/auction.js';
import { submitFreeAction } from '../src/engine/freeActions.js';
import { respondToPrompt } from '../src/engine/promptResponse.js';
import { sellStock } from '../src/engine/turn.js';
import { effectiveBidCeiling } from '../src/bots/decide.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { perceivedCardValue } from '../src/bots/valuation.js';
import { makeRng } from '../src/domain/rng.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Ground-truth diagnostic: replay a REAL logged human game turn by turn, and
 * at every point a BOT passed on an auction, recompute what the CURRENT
 * (already-promoted) net+params say that bot's perceived value and bid
 * ceiling were at that exact moment -- so we can see whether folding was
 * "rational" given current valuation, or whether something else (cash,
 * loans, a genuinely low perceived value) drove it. See v5_tuning_notes.md
 * item 18's self-play-exploit postmortem.
 *
 *   tsx scripts/analyzeRealGame.ts <game_logs/xxx.jsonl>
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const NETS_DIR = path.join(HERE, '..', 'nets');

const logPath = process.argv[2];
if (!logPath) {
  console.error('usage: tsx scripts/analyzeRealGame.ts <game_logs/xxx.jsonl>');
  process.exit(1);
}

const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'champion.json'), 'utf8')) as ValueNetWeights;
const params = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;
const rng = makeRng(1);

function findCardInGame(state: GameState, uid: string): StockCard | ActionCard | null {
  for (const c of state.market) {
    if (c.uid === uid && (c.category === 'stock' || c.category === 'action')) return c as StockCard | ActionCard;
  }
  for (const p of state.players) {
    for (const c of p.hand) {
      if (c.uid === uid && (c.category === 'stock' || c.category === 'action')) return c as StockCard | ActionCard;
    }
  }
  return null;
}

function describeCard(card: StockCard | ActionCard): string {
  if (card.category === 'stock') {
    const typeBit = card.type === 'blank' || card.type === 'wild' ? '' : `/${card.type}`;
    return `${card.color}${typeBit}`;
  }
  return card.name;
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
      const live = state.pendingPrompts[actor];
      if (!live) throw new Error(`replay op_prompt_response: no active prompt for ${actor}`);
      const r = respondToPrompt(state, actor, live.promptId, (payload.response as Record<string, unknown>) ?? {});
      if (!r.ok) throw new Error(`replay op_prompt_response failed: ${r.error}`);
      events.push(...r.events);
      break;
    }
    default:
      return;
  }
  advance(state, events);
}

const entries = readLogFile(logPath);
const gameStart = entries[0];
const startPayload = gameStart.payload ?? {};
const players = startPayload.players as { playerId: PlayerId; name: string }[];
const state = createGameState({
  catalog,
  players,
  seed: startPayload.seed as number,
  gameId: startPayload.gameId as string,
  startedAt: gameStart.ts
});
advance(state, []);

const profiles = new Map(players.map(pl => [pl.playerId, makeProductionBotProfile(rng, net, params)]));
const nameOf = (id: PlayerId) => players.find(pl => pl.playerId === id)?.name ?? id;

for (let i = 1; i < entries.length; i++) {
  const ev = entries[i];
  if (!ev.type.startsWith('op_')) continue;

  // Inspect the fold BEFORE applying it, while state.auction still reflects
  // what the passing bot actually saw.
  if (ev.type === 'op_auction_pass' && state.auction) {
    const actor = ev.actor as PlayerId;
    const profile = profiles.get(actor);
    const card = findCardInGame(state, state.auction.cardUid);
    const bot = state.players.find(pl => pl.playerId === actor);
    if (profile && card && bot) {
      const perceived = perceivedCardValue(card, state, profile, actor);
      const maxBid = effectiveBidCeiling(perceived, bot.cash, bot.loans, profile.params);
      console.log(
        `T${state.turnNumber} ${nameOf(actor).padEnd(10)} PASSES on ${describeCard(card).padEnd(16)} | ` +
          `currentHigh=$${state.auction.currentHigh} perceived=$${perceived.toFixed(1)} maxBid=$${maxBid.toFixed(1)} cash=$${bot.cash} loans=${bot.loans}`
      );
    }
  }

  applyOp(state, ev);
}

console.log('\nDone replaying.');
