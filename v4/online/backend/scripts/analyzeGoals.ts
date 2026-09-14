import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  COLORS,
  type Color,
  type GameLogEntry,
  type GameState,
  type GoalCard,
  type PlayerId,
  type PlayerPrivate,
  type StockCard
} from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng } from '../src/domain/rng.js';
import { hashSeed } from '../src/bots/esCore.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { decideBotAction } from '../src/bots/decide.js';
import { executeBotActionDirect, type SelfPlaySeat } from '../src/bots/selfPlay.js';
import type { BotProfile } from '../src/bots/profile.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Diagnostic: how well do the production bots pursue/complete goals?
 *   tsx scripts/analyzeGoals.ts [--games 300] [--seats 4] [--seed 7] [--trace]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const NETS_DIR = path.join(HERE, '..', 'nets');

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}
function strFlag(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? String(process.argv[i + 1]) : dflt;
}
const GAMES = flag('games', 300);
const SEATS = flag('seats', 4);
const SEED = flag('seed', 7);
const TRACE = process.argv.includes('--trace');
const NET_PATH = strFlag('net', path.join(NETS_DIR, 'champion.json'));

const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(NET_PATH, 'utf8')) as ValueNetWeights;
const params = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;

function stockColors(p: PlayerPrivate): Record<string, number> {
  const out: Record<string, number> = { Blue: 0, Orange: 0, Yellow: 0, Purple: 0, Wild: 0 };
  for (const c of p.hand) if (c.category === 'stock') out[c.color]++;
  return out;
}

/** Min cards still needed to complete a goal given a player's stocks (+wilds). */
function gapToGoal(p: PlayerPrivate, goal: GoalCard): number {
  const counts: Record<Color, number> = { Blue: 0, Orange: 0, Yellow: 0, Purple: 0 };
  let wild = 0;
  for (const c of p.hand) {
    if (c.category !== 'stock') continue;
    if (c.color === 'Wild') wild++;
    else counts[c.color]++;
  }
  let shortfall = 0;
  for (const c of COLORS) {
    const req = goal.goal.parsed.requirements[c] ?? 0;
    if (req > counts[c]) shortfall += req - counts[c];
  }
  return Math.max(0, shortfall - wild);
}

function drive(seed: number, capture: GameLogEntry[] | null): GameState {
  const ids: PlayerId[] = Array.from({ length: SEATS }, (_, s) => `p${s}`);
  const personaRng = makeRng(hashSeed(seed, 0x9e3a));
  const seats: SelfPlaySeat[] = ids.map(playerId => ({
    playerId,
    name: playerId,
    profile: makeProductionBotProfile(personaRng, net, params)
  }));
  const state = createGameState({
    catalog,
    players: seats.map(s => ({ playerId: s.playerId, name: s.name, isBot: true })),
    seed,
    gameId: `ag-${seed}`,
    startedAt: '2026-01-01T00:00:00.000Z'
  });
  const profiles = new Map<PlayerId, BotProfile>();
  for (const s of seats) profiles.set(s.playerId, s.profile);
  const rng = makeRng(hashSeed(seed, 1));
  let ticks = 0;
  while (!state.gameOver && ticks < 20000) {
    ticks++;
    let acted = false;
    for (const player of state.players) {
      const profile = profiles.get(player.playerId)!;
      const action = decideBotAction(state, player.playerId, profile, { rng });
      if (!action) continue;
      const events: GameLogEntry[] = [];
      const ok = executeBotActionDirect(state, player.playerId, action, events);
      if (!ok) return state; // stuck
      if (capture) capture.push(...events);
      acted = true;
      break;
    }
    if (!acted) return state;
  }
  return state;
}

// ---- Aggregate ----
let counted = 0;
let stuck = 0;
let goalsClaimedTotal = 0;
let zeroGoalGames = 0;
let tipEnd = 0;
let goalEnd = 0;
let loansTotal = 0;
let stocksTotal = 0;
let playersTotal = 0;
const claimedHist: Record<number, number> = {};
let minGapSum = 0; // avg over games of the best (min) gap any player had to any remaining goal at end
let claimableUnclaimed = 0; // games where some player COULD have claimed a remaining goal at end (claim-bug check)
const turns: number[] = []; // total player-turns per finished game

for (let g = 0; g < GAMES; g++) {
  const state = drive(SEED + g, null);
  if (!state.gameOver) {
    stuck++;
    continue;
  }
  counted++;
  turns.push(state.turnNumber);
  if (state.gameOver.reason === 'insider_tip_deck_empty') tipEnd++;
  else goalEnd++;
  const claimed = state.players.reduce((a, p) => a + p.goalsClaimed.length, 0);
  goalsClaimedTotal += claimed;
  claimedHist[claimed] = (claimedHist[claimed] ?? 0) + 1;
  if (claimed === 0) zeroGoalGames++;
  let bestGap = Infinity;
  let anyClaimable = false;
  for (const p of state.players) {
    playersTotal++;
    loansTotal += p.loans;
    stocksTotal += p.hand.filter(c => c.category === 'stock').length;
    for (const goal of state.activeGoals) {
      const gap = gapToGoal(p, goal);
      if (gap < bestGap) bestGap = gap;
      if (gap === 0) anyClaimable = true;
    }
  }
  if (Number.isFinite(bestGap)) minGapSum += bestGap;
  if (anyClaimable) claimableUnclaimed++;
}

const pctile = (arr: number[], p: number): number => {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const f1 = (x: number) => x.toFixed(2);
const turnsMean = turns.reduce((a, b) => a + b, 0) / Math.max(1, turns.length);
console.log(`\n=== Goal-pursuit analysis — ${SEATS}p, ${counted} games (${stuck} stuck) ===`);
console.log(`Turns:                avg ${f1(turnsMean)}, p50 ${pctile(turns, 0.5)}, p90 ${pctile(turns, 0.9)}`);
console.log(`End reason:           ${f1((100 * goalEnd) / counted)}% goals,  ${f1((100 * tipEnd) / counted)}% tips`);
console.log(`Goals claimed / game: ${f1(goalsClaimedTotal / counted)}  (game has ${SEATS + 2} goals, needs ${SEATS + 1} claimed to end on goals)`);
console.log(`Goals claimed / player: ${f1(goalsClaimedTotal / counted / SEATS)}`);
console.log(`Games with 0 goals:   ${f1((100 * zeroGoalGames) / counted)}%`);
console.log(`Claimed histogram:    ${Object.keys(claimedHist).sort((a, b) => +a - +b).map(k => `${k}:${claimedHist[+k]}`).join('  ')}`);
console.log(`Avg loans / player:   ${f1(loansTotal / playersTotal)}`);
console.log(`Avg stocks / player:  ${f1(stocksTotal / playersTotal)} (at game end)`);
console.log(`Avg best gap-to-goal: ${f1(minGapSum / counted)} (min cards any player needed for any remaining goal, at end)`);
console.log(`Claim-bug check:      ${claimableUnclaimed} games ended with a claimable-but-unclaimed goal (should be 0)`);

// ---- Detailed single-game trace ----
if (TRACE) {
  const cap: GameLogEntry[] = [];
  const state = drive(SEED, cap);
  console.log(`\n=== Trace of game seed ${SEED} (${SEATS}p) — ended ${state.gameOver?.reason} at turn ${state.turnNumber} ===`);
  console.log('Active goals at end:');
  for (const goal of state.activeGoals) {
    console.log(`  - ${goal.goal.text}  | reward: ${goal.reward.text}`);
  }
  const interesting = new Set([
    'goal_claimed',
    'auction_won',
    'auction_resolved',
    'start_auction',
    'market_order_buy'
  ]);
  const claims = cap.filter(e => e.type === 'goal_claimed');
  console.log(`\nGoal claims (${claims.length}):`);
  for (const e of claims) console.log(`  T${e.turnNumber} ${e.message}`);
  const auctionWins = cap.filter(e => e.type === 'auction_won' || e.type === 'auction_resolved');
  console.log(`\nAuction outcomes (${auctionWins.length}) — last 12:`);
  for (const e of auctionWins.slice(-12)) console.log(`  T${e.turnNumber} ${e.message}`);
  void interesting;
  console.log('\nFinal hands (stock colors):');
  for (const p of state.players) {
    const sc = stockColors(p);
    console.log(`  ${p.name}: Blue ${sc.Blue} Orange ${sc.Orange} Yellow ${sc.Yellow} Purple ${sc.Purple} Wild ${sc.Wild} | cash ${p.cash} loans ${p.loans} claimed ${p.goalsClaimed.length}`);
  }
}
