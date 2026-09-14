import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  type GameLogEntry,
  type GameState,
  type GoalCard,
  type PlayerId
} from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng } from '../src/domain/rng.js';
import { hashSeed } from '../src/bots/esCore.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { decideBotAction } from '../src/bots/decide.js';
import { executeBotActionDirect } from '../src/bots/selfPlay.js';
import type { BotProfile } from '../src/bots/profile.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Which goals correlate with winning? Runs many production-bot games; for each
 * finished game it credits every goal a WINNER claimed, and (to de-bias "easy
 * goals get claimed a lot") also tracks how often each goal was in play and how
 * often the claimer of a goal ended up winning.
 *
 *   tsx scripts/analyzeGoalWins.ts [--games 5000] [--seats 4] [--seed 1000]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const NETS_DIR = path.join(HERE, '..', 'nets');

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}
const GAMES = flag('games', 5000);
const SEATS = flag('seats', 4);
const SEED = flag('seed', 1000);

const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'champion.json'), 'utf8')) as ValueNetWeights;
const params = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;

const relabel = (s: string) =>
  s.replace(/Blue/g, 'Steel').replace(/Orange/g, 'Oil').replace(/Yellow/g, 'Rail').replace(/Purple/g, 'Bank');

function drive(seed: number, seats: number): GameState {
  const ids: PlayerId[] = Array.from({ length: seats }, (_, s) => `p${s}`);
  const personaRng = makeRng(hashSeed(seed, 0x9e3a));
  const profiles = new Map<PlayerId, BotProfile>();
  for (const id of ids) profiles.set(id, makeProductionBotProfile(personaRng, net, params));
  const state = createGameState({
    catalog,
    players: ids.map(playerId => ({ playerId, name: playerId, isBot: true })),
    seed,
    gameId: `agw-${seed}`,
    startedAt: '2026-01-01T00:00:00.000Z'
  });
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
      acted = true;
      break;
    }
    if (!acted) return state;
  }
  return state;
}

interface GoalStat {
  id: number;
  tier: string;
  req: string;
  reward: string;
  inPlay: number; // games this goal was dealt into play
  claims: number; // times claimed (by anyone)
  winnerClaims: number; // times claimed by an eventual winner
}
const stats = new Map<number, GoalStat>();
function ensure(goal: GoalCard): GoalStat {
  let s = stats.get(goal.id);
  if (!s) {
    s = {
      id: goal.id,
      tier: goal.goal.parsed.type,
      req: relabel(goal.goal.text),
      reward: relabel(goal.reward.text),
      inPlay: 0,
      claims: 0,
      winnerClaims: 0
    };
    stats.set(goal.id, s);
  }
  return s;
}

let counted = 0;
let stuck = 0;
let winnerGoals = 0;
let loserGoals = 0;
let winnerSlots = 0;
let loserSlots = 0;

const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  const state = drive(SEED + g, SEATS);
  if (!state.gameOver) {
    stuck++;
    continue;
  }
  counted++;
  const winners = new Set(state.gameOver.winnerPlayerIds);
  // Dealt goal set = goals still in play + all goals any player claimed.
  const dealt = new Map<number, GoalCard>();
  for (const goal of state.activeGoals) dealt.set(goal.id, goal);
  for (const p of state.players) for (const goal of p.goalsClaimed) dealt.set(goal.id, goal);
  for (const goal of dealt.values()) ensure(goal).inPlay++;
  for (const p of state.players) {
    const isW = winners.has(p.playerId);
    if (isW) winnerSlots++;
    else loserSlots++;
    for (const goal of p.goalsClaimed) {
      const s = ensure(goal);
      s.claims++;
      if (isW) {
        s.winnerClaims++;
        winnerGoals++;
      } else loserGoals++;
    }
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const baseline = winnerSlots / Math.max(1, winnerSlots + loserSlots); // ~1/seats, a bit higher with ties

const tierOrder = ['pair', 'three_of_a_kind', 'two_pair'];
const tierName: Record<string, string> = {
  pair: 'Pair (easy)',
  three_of_a_kind: 'Three of a Kind (hard)',
  two_pair: 'Two Pair (hard)'
};

const L: string[] = [];
L.push(`# Goal → Win Correlation`);
L.push('');
L.push(
  `Production-bot self-play: **${counted} games** at **${SEATS} players** (${stuck} stuck/excluded), seeds ${SEED}..${SEED + GAMES - 1}. Ran in ${secs}s.`
);
L.push('');
L.push(`- **Baseline win rate per player:** ${(100 * baseline).toFixed(1)}% (≈ 1/${SEATS}, slightly higher due to ties).`);
L.push(
  `- **Avg goals claimed:** winners **${(winnerGoals / Math.max(1, winnerSlots)).toFixed(2)}** vs losers **${(loserGoals / Math.max(1, loserSlots)).toFixed(2)}** — winners claim more overall, which is why the raw \`winnerClaims\` tally is biased toward *easy* goals.`
);
L.push('');
L.push('**Columns**');
L.push('- `winnerClaims` — times an eventual winner claimed this goal (the raw tally you asked for).');
L.push('- `claims` — times claimed by anyone; `inPlay` — games the goal was dealt.');
L.push('- `claim%` = claims ÷ inPlay — how often it gets grabbed when available.');
L.push('- `win%|claim` = winnerClaims ÷ claims — of the times it was claimed, how often the claimer won. **This de-biases the raw tally.**');
L.push('- `lift` = (win%|claim) ÷ baseline — >1.0 means claiming it beats an average position. Compare **within a tier** (across tiers, difficulty dominates).');
L.push('');

for (const tier of tierOrder) {
  const rows = [...stats.values()].filter(s => s.tier === tier);
  rows.sort((a, b) => b.winnerClaims / Math.max(1, b.claims) - a.winnerClaims / Math.max(1, a.claims));
  L.push(`## ${tierName[tier]}`);
  L.push('');
  L.push('| Requirement | Reward | winnerClaims | claims | inPlay | claim% | win%\\|claim | lift |');
  L.push('|---|---|---:|---:|---:|---:|---:|---:|');
  for (const s of rows) {
    const claimPct = (100 * s.claims) / Math.max(1, s.inPlay);
    const winWhenClaimed = s.winnerClaims / Math.max(1, s.claims);
    const lift = winWhenClaimed / Math.max(1e-9, baseline);
    L.push(
      `| ${s.req} | ${s.reward} | ${s.winnerClaims} | ${s.claims} | ${s.inPlay} | ${claimPct.toFixed(0)}% | ${(100 * winWhenClaimed).toFixed(1)}% | ${lift.toFixed(2)} |`
    );
  }
  L.push('');
}

const OUT = path.resolve(HERE, '../../../goal_win_analysis.md');
fs.writeFileSync(OUT, L.join('\n'));
console.log(`Wrote ${OUT}`);
console.log(`${counted} games counted, ${stuck} stuck. Baseline ${(100 * baseline).toFixed(1)}%.`);
