import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type GameState, type PlayerId } from '@insider-trading/shared';
import { makeRng } from '../src/domain/rng.js';
import { hashSeed } from '../src/bots/esCore.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { advance } from '../src/engine/advance.js';
import { decideBotAction } from '../src/bots/decide.js';
import { createGameState } from '../src/domain/setup.js';
import { executeBotActionDirect, type SelfPlaySeat } from '../src/bots/selfPlay.js';
import { goalHoldUsefulnessByColor } from '../src/bots/decide.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const NETS_DIR = path.join(HERE, '..', 'nets');
const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'champion.json'), 'utf8'));

const paramsPath = process.argv[2] ?? path.join(NETS_DIR, 'bot_params.json');
const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8')) as BotParams;
const GAMES = Number(process.argv[3] ?? 2000);
const numSeats = 4;
const SEED = 31;
const ids = Array.from({ length: numSeats }, (_, s) => `p${s}`);

let totalGoalClaims = 0;
let totalSells = 0;
let sellsOfGoalUsefulStock = 0;
let totalTipPlays = 0;
let finishedGames = 0;
let totalTurns = 0;

const personaRng = makeRng(hashSeed(SEED, numSeats * 7919));
for (let g = 0; g < GAMES; g++) {
  const seats: SelfPlaySeat[] = ids.map(playerId => ({
    playerId,
    name: playerId,
    profile: makeProductionBotProfile(personaRng, net, params)
  }));
  const state: GameState = createGameState({
    catalog,
    players: seats.map(s => ({ playerId: s.playerId, name: s.name, isBot: true })),
    seed: SEED + g,
    gameId: 'diag',
    startedAt: '2026-01-01T00:00:00.000Z'
  });
  const profiles = new Map(seats.map(s => [s.playerId, s.profile]));
  const rng = makeRng(hashSeed(SEED, g + 1));

  advance(state, []);
  let ticks = 0;
  const maxTicks = 20000;
  while (!state.gameOver && ticks < maxTicks) {
    ticks++;
    let acted = false;
    for (const player of state.players) {
      const profile = profiles.get(player.playerId);
      if (!profile) continue;
      const action = decideBotAction(state, player.playerId, profile, { rng });
      if (!action) continue;

      if (action.kind === 'turn_action') {
        const turnAction = action.action;
        if (turnAction.type === 'sell_stock') {
          const useful = goalHoldUsefulnessByColor(state, player.playerId);
          const card = player.hand.find(c => c.uid === turnAction.stockUid);
          if (card && card.category === 'stock' && card.color !== 'Wild') {
            totalSells++;
            if (useful[card.color] > 0) sellsOfGoalUsefulStock++;
          }
        }
      }
      if (
        action.kind === 'free_action' &&
        (action.request.kind === 'claim_goal' || action.request.kind === 'claim_private_goal')
      ) {
        totalGoalClaims++;
      }
      if (action.kind === 'free_action' && action.request.kind === 'play_market_movement') {
        totalTipPlays++;
      }

      const events: import('@insider-trading/shared').GameLogEntry[] = [];
      const ok = executeBotActionDirect(state, player.playerId, action, events);
      if (!ok) {
        acted = false;
        break;
      }
      acted = true;
      break;
    }
    if (!acted) break;
  }
  if (state.gameOver) {
    finishedGames++;
    totalTurns += state.turnNumber;
  }
}

console.log(`params: ${paramsPath}`);
console.log(`games: ${GAMES}, finished: ${finishedGames}, mean turns (finished only): ${(totalTurns / Math.max(1, finishedGames)).toFixed(1)}`);
console.log(`total goal claims: ${totalGoalClaims} (${(totalGoalClaims / GAMES).toFixed(2)}/game)`);
console.log(`total tip plays (played_from_hand): ${totalTipPlays} (${(totalTipPlays / GAMES).toFixed(2)}/game)`);
console.log(`total sells: ${totalSells} (${(totalSells / GAMES).toFixed(2)}/game)`);
console.log(
  `sells of goal-useful stock: ${sellsOfGoalUsefulStock} (${((100 * sellsOfGoalUsefulStock) / Math.max(1, totalSells)).toFixed(1)}% of sells)`
);
