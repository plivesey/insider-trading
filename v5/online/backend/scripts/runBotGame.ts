import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type PlayerId } from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng } from '../src/domain/rng.js';
import { createBotProfile, type BotProfile } from '../src/bots/profile.js';
import { driveSelfPlay } from '../src/bots/selfPlay.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const catalog = loadCards(CARDS_DIR);

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
const result = driveSelfPlay(state, profiles, tickRng);
if (result.stuck) console.log('stuck or invalid action');
const ticks = result.ticks;

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
