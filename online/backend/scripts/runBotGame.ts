import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  type GameLogEntry,
  type GameState,
  type PlayerId
} from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng, type Rng } from '../src/domain/rng.js';
import { advance } from '../src/engine/advance.js';
import { bid, pass, startAuction } from '../src/engine/auction.js';
import { submitFreeAction } from '../src/engine/freeActions.js';
import { respondToPrompt } from '../src/engine/promptResponse.js';
import { sellStock } from '../src/engine/turn.js';
import { decideBotAction, type BotAction } from '../src/bots/decide.js';
import { createBotProfile, type BotProfile } from '../src/bots/profile.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const catalog = loadCards(CARDS_DIR);

function executeBotActionDirect(
  state: GameState,
  playerId: PlayerId,
  action: BotAction,
  events: GameLogEntry[]
): boolean {
  let result;
  switch (action.kind) {
    case 'turn_action':
      result =
        action.action.type === 'start_auction'
          ? startAuction(state, playerId, action.action.cardUid, action.action.initialBid)
          : sellStock(state, playerId, action.action.stockUid);
      break;
    case 'auction_bid':
      result =
        action.action.type === 'bid'
          ? bid(state, playerId, action.action.amount)
          : pass(state, playerId);
      break;
    case 'free_action':
      result = submitFreeAction(state, playerId, action.request);
      break;
    case 'prompt_response':
      result = respondToPrompt(state, playerId, action.promptId, action.response);
      break;
  }
  if (!result.ok) return false;
  events.push(...result.events);
  advance(state, events);
  return true;
}

function drive(state: GameState, profiles: Map<PlayerId, BotProfile>, rng: Rng) {
  let ticks = 0;
  while (!state.gameOver && ticks < 10000) {
    ticks++;
    let acted = false;
    for (const player of state.players) {
      const profile = profiles.get(player.playerId);
      if (!profile) continue;
      const action = decideBotAction(state, player.playerId, profile, { rng });
      if (!action) continue;
      const events: GameLogEntry[] = [];
      const ok = executeBotActionDirect(state, player.playerId, action, events);
      if (!ok) {
        console.log('invalid action by', player.name, JSON.stringify(action));
        return ticks;
      }
      acted = true;
      break;
    }
    if (!acted) {
      console.log('stuck');
      return ticks;
    }
  }
  return ticks;
}

const seed = Number(process.argv[2] ?? 42);
const players = [
  { playerId: 'a', name: 'Astor', isBot: true },
  { playerId: 'r', name: 'Rockefeller', isBot: true },
  { playerId: 'm', name: 'Mellon', isBot: true }
];
const state = createGameState({
  catalog,
  players,
  seed,
  gameId: `g-${seed}`,
  startedAt: '2026-01-01T00:00:00.000Z'
});
const botRng = makeRng((seed * 2 + 1) | 0);
const profiles = new Map<PlayerId, BotProfile>();
for (const p of players) profiles.set(p.playerId, createBotProfile(botRng));

console.log(`seed=${seed}`);
console.log('Profiles:');
for (const p of players) {
  const prof = profiles.get(p.playerId)!;
  console.log(
    `  ${p.name.padEnd(12)} stockOffset=${prof.stockOffset >= 0 ? '+' : ''}${prof.stockOffset}, actionOffset=${prof.actionOffset >= 0 ? '+' : ''}${prof.actionOffset}, hotTipThreshold=${prof.hotTipThreshold}`
  );
}

const tickRng = makeRng((seed * 4 + 7) | 0);
const ticks = drive(state, profiles, tickRng);

console.log(
  `\nGame ended after ${ticks} ticks. Reason: ${state.gameOver?.reason}, Turn: ${state.turnNumber}`
);
console.log(`Final stock prices: ${JSON.stringify(state.stockPrices)}`);
console.log('\nFinal wealth breakdown (sorted by total):');
const sorted = [...state.gameOver!.breakdown].sort((a, b) => b.total - a.total);
for (const b of sorted) {
  const isWinner = state.gameOver!.winnerPlayerIds.includes(b.playerId);
  console.log(
    `  ${isWinner ? '👑' : '  '} ${b.name.padEnd(12)} total=$${String(b.total).padStart(3)}  ` +
      `(cash $${b.cash} + stocks $${b.stockValue} [${b.stocksHeld}] + bonus $${b.endGameBonus} − loans $${b.loanPenalty})`
  );
}
