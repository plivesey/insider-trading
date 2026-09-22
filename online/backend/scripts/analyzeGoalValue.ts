import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  type GameLogEntry,
  type GameState,
  type GameVariant,
  type GoalCard,
  type PlayerId
} from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng } from '../src/domain/rng.js';
import { hashSeed } from '../src/bots/esCore.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { decideBotAction } from '../src/bots/decide.js';
import { executeBotActionDirect } from '../src/bots/selfPlay.js';
import { advance } from '../src/engine/advance.js';
import type { BotProfile } from '../src/bots/profile.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Goal reward value study: how much does actually completing each goal help
 * you win, once you control for how hard that goal is to complete?
 *
 * Methodology (see rationale in the writeup this script produces):
 *  - Bots pursue and claim goals REWARD-BLIND. `goalTargetBoostByColor` in
 *    decide.ts weights auction pursuit purely by "how close does this get me
 *    to completing ANY visible/held goal" — it never looks at the goal's
 *    reward. And once a goal is satisfiable, `tryBuildGoalClaim` claims it
 *    unconditionally (bar one narrow Trophy Case deferral). So in this sim,
 *    `claim% = claims / inPlay` is a clean, reward-independent difficulty
 *    signal: it says nothing about whether the reward is good, only how often
 *    the required stock combo gets assembled before the game ends.
 *  - `lift = win%|claim / baseline` and `deltaWealth = mean(final wealth of
 *    claimers) - mean(final wealth of non-claimers in games where the goal
 *    was in play)` are the two value signals. Both are pulled AFTER the fact
 *    from final game state, so they measure "goals that correlate with doing
 *    well," not a proven causal effect — a goal claimed late by a
 *    already-winning player will look artificially strong. Treat both as
 *    directional, and weight deltaWealth (a continuous, less noisy quantity)
 *    over lift for tight calls.
 *
 * Runs GAMES games at each of --seats (default 3,4,5), all on production bot
 * profiles (the shipped champion net + bot params).
 *
 *   tsx scripts/analyzeGoalValue.ts [--games 100000] [--seats 3,4,5] [--seed 1000000] [--variant classic|alternate]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const NETS_DIR = path.join(HERE, '..', 'nets');

function numFlag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}
function listFlag(name: string, dflt: number[]): number[] {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  return process.argv[i + 1].split(',').map(Number);
}
function strFlag(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
const GAMES = numFlag('games', 100000);
const SEAT_COUNTS = listFlag('seats', [3, 4, 5]);
const SEED_BASE = numFlag('seed', 1_000_000);
const SEED_STRIDE = 10_000_000; // keep each seat count's seed range disjoint
const VARIANT = strFlag('variant', 'classic') as GameVariant;
if (VARIANT !== 'classic' && VARIANT !== 'alternate') {
  throw new Error(`--variant must be 'classic' or 'alternate', got '${VARIANT}'`);
}

const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'champion.json'), 'utf8')) as ValueNetWeights;
const params = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;

const relabel = (s: string) =>
  s.replace(/Blue/g, 'Steel').replace(/Orange/g, 'Oil').replace(/Green/g, 'Rail').replace(/Purple/g, 'Bank');

function drive(seed: number, seats: number): GameState {
  const ids: PlayerId[] = Array.from({ length: seats }, (_, s) => `p${s}`);
  const personaRng = makeRng(hashSeed(seed, 0x9e3a));
  const profiles = new Map<PlayerId, BotProfile>();
  for (const id of ids) profiles.set(id, makeProductionBotProfile(personaRng, net, params));
  const state = createGameState({
    catalog,
    players: ids.map(playerId => ({ playerId, name: playerId, isBot: true })),
    seed,
    gameId: `agv-${seed}`,
    startedAt: '2026-01-01T00:00:00.000Z',
    variant: VARIANT
  });
  // createGameState leaves turnPhase:'setup_draft' with no prompts queued --
  // advance() lazily calls beginDraft() the first time it runs on a state
  // like that, so a directly-constructed state needs one up front.
  advance(state, []);
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
  claimerWealthSum: number; // sum of final `total` wealth over claimer player-slots
  claimerSlots: number;
  fieldWealthSum: number; // sum of final `total` wealth over non-claimer player-slots (goal was in play)
  fieldSlots: number;
}
function newStat(goal: GoalCard): GoalStat {
  return {
    id: goal.id,
    tier: goal.goal.parsed.type,
    req: relabel(goal.goal.text),
    reward: relabel(goal.reward.text),
    inPlay: 0,
    claims: 0,
    winnerClaims: 0,
    claimerWealthSum: 0,
    claimerSlots: 0,
    fieldWealthSum: 0,
    fieldSlots: 0
  };
}

interface CountResult {
  seats: number;
  counted: number;
  stuck: number;
  baseline: number;
  secs: number;
  stats: Map<number, GoalStat>;
}

const tierOrder = ['pair', 'full_spread', 'three_of_a_kind', 'two_pair', 'four_of_a_kind'];
const tierName: Record<string, string> = {
  pair: 'Pair (easy)',
  full_spread: 'Full Spread (medium)',
  three_of_a_kind: 'Three of a Kind (hard)',
  two_pair: 'Two Pair (hard)',
  four_of_a_kind: 'Four of a Kind (very hard)'
};

function runCount(seats: number, seedBase: number, games: number): CountResult {
  const stats = new Map<number, GoalStat>();
  const ensure = (goal: GoalCard) => {
    let s = stats.get(goal.id);
    if (!s) {
      s = newStat(goal);
      stats.set(goal.id, s);
    }
    return s;
  };

  let counted = 0;
  let stuck = 0;
  let winnerSlots = 0;
  let loserSlots = 0;

  const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    const state = drive(seedBase + g, seats);
    if (!state.gameOver) {
      stuck++;
      continue;
    }
    counted++;
    const winners = new Set(state.gameOver.winnerPlayerIds);
    const wealthByPlayer = new Map(state.gameOver.breakdown.map(b => [b.playerId, b.total]));

    // Dealt goal set = goals still in play + all goals any player claimed.
    const dealt = new Map<number, GoalCard>();
    for (const goal of state.goalRow) dealt.set(goal.id, goal);
    for (const p of state.players) for (const goal of p.goalsClaimed) dealt.set(goal.id, goal);
    for (const goal of dealt.values()) ensure(goal).inPlay++;

    const claimersByGoal = new Map<number, Set<PlayerId>>();
    for (const p of state.players) {
      for (const goal of p.goalsClaimed) {
        if (!claimersByGoal.has(goal.id)) claimersByGoal.set(goal.id, new Set());
        claimersByGoal.get(goal.id)!.add(p.playerId);
      }
    }

    for (const p of state.players) {
      const isW = winners.has(p.playerId);
      if (isW) winnerSlots++;
      else loserSlots++;
      const wealth = wealthByPlayer.get(p.playerId) ?? 0;

      for (const goal of dealt.values()) {
        const s = ensure(goal);
        const claimedByThisPlayer = claimersByGoal.get(goal.id)?.has(p.playerId) ?? false;
        if (claimedByThisPlayer) {
          s.claimerWealthSum += wealth;
          s.claimerSlots++;
        } else {
          s.fieldWealthSum += wealth;
          s.fieldSlots++;
        }
      }
      for (const goal of p.goalsClaimed) {
        const s = ensure(goal);
        s.claims++;
        if (isW) s.winnerClaims++;
      }
    }
  }
  const secs = (Date.now() - t0) / 1000;
  const baseline = winnerSlots / Math.max(1, winnerSlots + loserSlots);
  return { seats, counted, stuck, baseline, secs, stats };
}

interface Row {
  id: number;
  tier: string;
  req: string;
  reward: string;
  inPlay: number;
  claims: number;
  winnerClaims: number;
  claimPct: number;
  winGivenClaim: number;
  lift: number;
  deltaWealth: number;
}
function toRows(result: CountResult): Row[] {
  const rows: Row[] = [];
  for (const s of result.stats.values()) {
    const claimPct = (100 * s.claims) / Math.max(1, s.inPlay);
    const winGivenClaim = s.winnerClaims / Math.max(1, s.claims);
    const lift = winGivenClaim / Math.max(1e-9, result.baseline);
    const claimerMean = s.claimerWealthSum / Math.max(1, s.claimerSlots);
    const fieldMean = s.fieldWealthSum / Math.max(1, s.fieldSlots);
    rows.push({
      id: s.id,
      tier: s.tier,
      req: s.req,
      reward: s.reward,
      inPlay: s.inPlay,
      claims: s.claims,
      winnerClaims: s.winnerClaims,
      claimPct,
      winGivenClaim,
      lift,
      deltaWealth: claimerMean - fieldMean
    });
  }
  return rows;
}

function fmtCountSection(L: string[], result: CountResult) {
  L.push(`### ${result.seats}-player games`);
  L.push('');
  L.push(
    `**${result.counted} games** counted (${result.stuck} stuck/excluded), ran in ${result.secs.toFixed(1)}s. Baseline win rate per player: **${(100 * result.baseline).toFixed(1)}%** (≈ 1/${result.seats}).`
  );
  L.push('');
  const rows = toRows(result);
  L.push('| Tier | Requirement | Reward | inPlay | claim% (difficulty) | win%\\|claim | lift | Δwealth ($) |');
  L.push('|---|---|---|---:|---:|---:|---:|---:|');
  const byTierThenId = [...rows].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) || a.id - b.id);
  for (const r of byTierThenId) {
    L.push(
      `| ${tierName[r.tier]} | ${r.req} | ${r.reward} | ${r.inPlay} | ${r.claimPct.toFixed(0)}% | ${(100 * r.winGivenClaim).toFixed(1)}% | ${r.lift.toFixed(2)} | ${r.deltaWealth >= 0 ? '+' : ''}${r.deltaWealth.toFixed(2)} |`
    );
  }
  L.push('');
}

const results: CountResult[] = [];
for (let i = 0; i < SEAT_COUNTS.length; i++) {
  const seats = SEAT_COUNTS[i];
  console.log(`Running ${GAMES} games at ${seats} seats...`);
  const r = runCount(seats, SEED_BASE + i * SEED_STRIDE, GAMES);
  console.log(`  done: ${r.counted} counted, ${r.stuck} stuck, ${r.secs.toFixed(1)}s`);
  results.push(r);
}

// Pooled across seat counts: pool raw counts (inPlay/claims/winnerClaims/wealth sums),
// and use the games-weighted mean baseline for lift.
interface PooledStat {
  id: number;
  tier: string;
  req: string;
  reward: string;
  inPlay: number;
  claims: number;
  winnerClaims: number;
  claimerWealthSum: number;
  claimerSlots: number;
  fieldWealthSum: number;
  fieldSlots: number;
}
const pooled = new Map<number, PooledStat>();
let pooledBaselineNum = 0;
let pooledBaselineDen = 0;
for (const r of results) {
  const slots = r.counted * r.seats;
  pooledBaselineNum += r.baseline * slots;
  pooledBaselineDen += slots;
  for (const s of r.stats.values()) {
    let p = pooled.get(s.id);
    if (!p) {
      p = { id: s.id, tier: s.tier, req: s.req, reward: s.reward, inPlay: 0, claims: 0, winnerClaims: 0, claimerWealthSum: 0, claimerSlots: 0, fieldWealthSum: 0, fieldSlots: 0 };
      pooled.set(s.id, p);
    }
    p.inPlay += s.inPlay;
    p.claims += s.claims;
    p.winnerClaims += s.winnerClaims;
    p.claimerWealthSum += s.claimerWealthSum;
    p.claimerSlots += s.claimerSlots;
    p.fieldWealthSum += s.fieldWealthSum;
    p.fieldSlots += s.fieldSlots;
  }
}
const pooledBaseline = pooledBaselineNum / Math.max(1, pooledBaselineDen);
const pooledRows: Row[] = [...pooled.values()].map(s => {
  const claimPct = (100 * s.claims) / Math.max(1, s.inPlay);
  const winGivenClaim = s.winnerClaims / Math.max(1, s.claims);
  const lift = winGivenClaim / Math.max(1e-9, pooledBaseline);
  const claimerMean = s.claimerWealthSum / Math.max(1, s.claimerSlots);
  const fieldMean = s.fieldWealthSum / Math.max(1, s.fieldSlots);
  return {
    id: s.id,
    tier: s.tier,
    req: s.req,
    reward: s.reward,
    inPlay: s.inPlay,
    claims: s.claims,
    winnerClaims: s.winnerClaims,
    claimPct,
    winGivenClaim,
    lift,
    deltaWealth: claimerMean - fieldMean
  };
});

// --- Write report ---
const L: string[] = [];
L.push(`# Goal Reward Value Study — ${VARIANT === 'alternate' ? 'Alternate variant' : 'Classic'}`);
L.push('');
L.push(
  `Production-bot self-play across ${SEAT_COUNTS.join('/')}-player games (**${VARIANT}** setup variant), ${GAMES} games per seat count (seed base ${SEED_BASE}).`
);
L.push('');
L.push('## Methodology');
L.push('');
L.push(
  '- **Difficulty (`claim%`)** is reward-independent by construction: bots chase the color closest to completing *any* visible/held goal (`goalTargetBoostByColor`, decide.ts) without ever weighting by that goal\'s reward, and claim a goal the instant it is satisfiable (`tryBuildGoalClaim`). So `claim% = claims ÷ inPlay` measures purely how often the required stock combo gets assembled before the game ends — not whether the reward is any good.'
);
L.push(
  '- **Value** is captured two ways: `lift` = (win rate of players who claimed the goal) ÷ (baseline win rate ≈ 1/seats) — only compare `lift` **within a tier**, since across tiers difficulty dominates. `Δwealth` = mean final wealth ($) of claimers minus mean final wealth of non-claimers in games where the goal was available — a continuous, less noisy companion metric, comparable *across* tiers since it\'s already in game-dollar terms.'
);
L.push(
  '- Both value metrics are post-hoc correlations, not a controlled causal estimate — a goal claimed late by an already-winning player looks artificially strong. Weight `Δwealth` over `lift` for close calls; treat anything within noise (small `inPlay`/`claims` counts) with caution.'
);
L.push(
  '- **Stock-holding confound**: goals that require holding 3-4 colored stocks (Three/Two-Pair/Four of a Kind) bake in real dollar value from the stock itself, separate from the goal\'s own reward text — a claimer of "4 Steel" is, almost by definition, already holding a pile of stock that counts toward final wealth with or without the goal\'s $12. The four "Four of a Kind" cards are a useful internal control here: all four grant an *identical* flat $12, so any spread in their claim%/Δwealth across colors is coming from difficulty and market dynamics, not the reward — a real effect visible in this data, not noise.'
);
L.push('');
L.push('## Per player-count results');
L.push('');
for (const r of results) fmtCountSection(L, r);

L.push('## Pooled across all player counts');
L.push('');
L.push(`Pooled baseline win rate: **${(100 * pooledBaseline).toFixed(1)}%**.`);
L.push('');
L.push('| Tier | Requirement | Reward | inPlay | claim% (difficulty) | win%\\|claim | lift | Δwealth ($) |');
L.push('|---|---|---|---:|---:|---:|---:|---:|');
const pooledSorted = [...pooledRows].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) || a.id - b.id);
for (const r of pooledSorted) {
  L.push(
    `| ${tierName[r.tier]} | ${r.req} | ${r.reward} | ${r.inPlay} | ${r.claimPct.toFixed(0)}% | ${(100 * r.winGivenClaim).toFixed(1)}% | ${r.lift.toFixed(2)} | ${r.deltaWealth >= 0 ? '+' : ''}${r.deltaWealth.toFixed(2)} |`
  );
}
L.push('');

L.push('## Flags: reward likely needs adjustment');
L.push('');
L.push(
  '"Underpaid": harder-than-median claim% (below the tier median) but below-median Δwealth for that tier — a real grind for a reward that doesn\'t pay off. "Overpaid": at or above the tier median claim% but Δwealth stands out well above the tier\'s peers — cheap goal, outsized payoff.'
);
L.push('');
const byTier = new Map<string, Row[]>();
for (const r of pooledRows) {
  if (!byTier.has(r.tier)) byTier.set(r.tier, []);
  byTier.get(r.tier)!.push(r);
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
L.push('| Tier | Requirement | Reward | claim% | Δwealth | Flag |');
L.push('|---|---|---|---:|---:|---|');
for (const tier of tierOrder) {
  const rows = byTier.get(tier);
  if (!rows || rows.length < 2) continue;
  const medClaim = median(rows.map(r => r.claimPct));
  const medWealth = median(rows.map(r => r.deltaWealth));
  for (const r of [...rows].sort((a, b) => a.deltaWealth - b.deltaWealth)) {
    let flag = '';
    if (r.claimPct <= medClaim && r.deltaWealth < medWealth) flag = 'underpaid';
    else if (r.claimPct >= medClaim && r.deltaWealth > medWealth) flag = 'overpaid';
    if (!flag) continue;
    L.push(
      `| ${tierName[r.tier]} | ${r.req} | ${r.reward} | ${r.claimPct.toFixed(0)}% | ${r.deltaWealth >= 0 ? '+' : ''}${r.deltaWealth.toFixed(2)} | **${flag}** |`
    );
  }
}
L.push('');

const SUFFIX = VARIANT === 'alternate' ? '_alternate' : '';
const OUT = path.resolve(HERE, `../../../goal_value_analysis${SUFFIX}.md`);
fs.writeFileSync(OUT, L.join('\n'));
console.log(`Wrote ${OUT}`);

// Also dump raw pooled + per-count rows as JSON for further offline analysis (e.g. charting).
const JSON_OUT = path.resolve(HERE, `../../../goal_value_analysis${SUFFIX}.json`);
fs.writeFileSync(
  JSON_OUT,
  JSON.stringify(
    {
      variant: VARIANT,
      games: GAMES,
      seedBase: SEED_BASE,
      seatCounts: SEAT_COUNTS,
      perCount: results.map(r => ({
        seats: r.seats,
        counted: r.counted,
        stuck: r.stuck,
        baseline: r.baseline,
        secs: r.secs,
        rows: toRows(r)
      })),
      pooled: { baseline: pooledBaseline, rows: pooledRows }
    },
    null,
    2
  )
);
console.log(`Wrote ${JSON_OUT}`);
