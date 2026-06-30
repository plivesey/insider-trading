import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type RulesConfig } from '@insider-trading/shared';
import { makeRng } from '../src/domain/rng.js';
import { hashSeed } from '../src/bots/esCore.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { playOneGame, type SelfPlaySeat } from '../src/bots/selfPlay.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Measure how candidate rule changes affect game length (total turns), using the
 * production bots. Each variant is run in isolation vs a baseline, per table size.
 *
 *   tsx scripts/measureGameLength.ts [--games 1000] [--counts 4,5] [--seed 31]
 *
 * Reports mean / p50 / p90 total turns and the delta vs baseline for each rule.
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

const GAMES = flag('games', 1000);
const SEED = flag('seed', 31);
const COUNTS = strFlag('counts', '4,5')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(n => n >= 2 && n <= 6);

const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'champion.json'), 'utf8')) as ValueNetWeights;
const params = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;

interface Variant {
  name: string;
  rules: Partial<RulesConfig>;
}
// Rule fragments (3 and 4 both set tipReduction → mutually exclusive).
const r1: Partial<RulesConfig> = { startingBuyCard: true }; // buy card
const r2: Partial<RulesConfig> = { extraGoals: 1, goalStopCount: 2 }; // +1 goal, stop@2
const r3: Partial<RulesConfig> = { tipReduction: 1 };
const r4: Partial<RulesConfig> = { tipReduction: 2 };
const VARIANTS: Variant[] = [
  { name: 'baseline', rules: {} },
  { name: '1 (buy card)', rules: { ...r1 } },
  { name: '4 (tips-2)', rules: { ...r4 } },
  { name: '1+2', rules: { ...r1, ...r2 } },
  { name: '1+3', rules: { ...r1, ...r3 } },
  { name: '2+3', rules: { ...r2, ...r3 } },
  { name: '1+2+3', rules: { ...r1, ...r2, ...r3 } },
  { name: '1+4', rules: { ...r1, ...r4 } },
  { name: '1+2+4', rules: { ...r1, ...r2, ...r4 } }
];

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

interface Stat {
  n: number;
  stuck: number;
  mean: number;
  p50: number;
  p90: number;
  goalEndPct: number; // % of finished games that ended on "one_goal_remaining"
  tipEndPct: number; // % that ended on "insider_tip_deck_empty"
}

function runVariant(numSeats: number, rules: Partial<RulesConfig>): Stat {
  // Deterministic personas per (count) so all variants face the same bot draws.
  const personaRng = makeRng(hashSeed(SEED, numSeats * 7919));
  const ids = Array.from({ length: numSeats }, (_, s) => `p${s}`);
  const turns: number[] = [];
  let stuck = 0;
  let goalEnd = 0;
  let tipEnd = 0;
  for (let g = 0; g < GAMES; g++) {
    const seats: SelfPlaySeat[] = ids.map(playerId => ({
      playerId,
      name: playerId,
      profile: makeProductionBotProfile(personaRng, net, params)
    }));
    const res = playOneGame({
      catalog,
      seats,
      gameSeed: SEED + g,
      tickSeed: hashSeed(SEED, g + 1),
      rules
    });
    if (!res.finished || res.stuck) {
      stuck++;
      continue;
    }
    turns.push(res.turnNumber);
    if (res.endReason === 'one_goal_remaining') goalEnd++;
    else if (res.endReason === 'insider_tip_deck_empty') tipEnd++;
  }
  turns.sort((a, b) => a - b);
  const n = turns.length;
  const mean = turns.reduce((a, b) => a + b, 0) / Math.max(1, n);
  return {
    n,
    stuck,
    mean,
    p50: pctile(turns, 0.5),
    p90: pctile(turns, 0.9),
    goalEndPct: (100 * goalEnd) / Math.max(1, n),
    tipEndPct: (100 * tipEnd) / Math.max(1, n)
  };
}

const f1 = (x: number) => x.toFixed(1);
const signed = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;

console.log(`Game-length experiment — production bots, ${GAMES} games/variant, counts [${COUNTS.join(',')}]\n`);
for (const numSeats of COUNTS) {
  const base = runVariant(numSeats, {});
  console.log(`=== ${numSeats} players ===`);
  console.log('variant                     n     stuck   mean    p50    p90     Δmean   Δp50   Δp90    goal%   tip%');
  for (const v of VARIANTS) {
    const s = v.name === 'baseline' ? base : runVariant(numSeats, v.rules);
    const dMean = s.mean - base.mean;
    const dP50 = s.p50 - base.p50;
    const dP90 = s.p90 - base.p90;
    const isBase = v.name === 'baseline';
    console.log(
      `${v.name.padEnd(26)} ${String(s.n).padStart(4)}  ${String(s.stuck).padStart(4)}  ` +
        `${f1(s.mean).padStart(6)} ${f1(s.p50).padStart(6)} ${f1(s.p90).padStart(6)}   ` +
        `${isBase ? '   —   ' : signed(dMean).padStart(6)} ${isBase ? '  — ' : signed(dP50).padStart(5)} ${isBase ? '  — ' : signed(dP90).padStart(5)}   ` +
        `${f1(s.goalEndPct).padStart(5)}  ${f1(s.tipEndPct).padStart(5)}`
    );
  }
  console.log('');
}
