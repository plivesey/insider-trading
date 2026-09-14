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
 *
 * V5 note: the only end condition is the progress tracker hitting its
 * threshold (see v5_tuning_notes.md items 1-2), so this is now the primary
 * tool for empirically sanity-checking `progressThresholdPerPlayer` and
 * `initialGoalRevealCount` -- there's no more goal-vs-tip end-reason split to
 * report since there's only one end reason.
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
// V5 rule knobs (see v5_tuning_notes.md): initialGoalRevealCount (flat 4 by
// default) and progressThresholdPerPlayer (flat 4 by default, i.e. threshold
// = 4 x players). Variants below sweep both to see the effect on game length.
const VARIANTS: Variant[] = [
  { name: 'baseline (4 / 4x)', rules: {} },
  { name: 'goals=6', rules: { initialGoalRevealCount: 6 } },
  { name: 'threshold=3x', rules: { progressThresholdPerPlayer: 3 } },
  { name: 'threshold=5x', rules: { progressThresholdPerPlayer: 5 } },
  { name: 'goals=6, threshold=5x', rules: { initialGoalRevealCount: 6, progressThresholdPerPlayer: 5 } }
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
}

function runVariant(numSeats: number, rules: Partial<RulesConfig>): Stat {
  // Deterministic personas per (count) so all variants face the same bot draws.
  const personaRng = makeRng(hashSeed(SEED, numSeats * 7919));
  const ids = Array.from({ length: numSeats }, (_, s) => `p${s}`);
  const turns: number[] = [];
  let stuck = 0;
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
  }
  turns.sort((a, b) => a - b);
  const n = turns.length;
  const mean = turns.reduce((a, b) => a + b, 0) / Math.max(1, n);
  return {
    n,
    stuck,
    mean,
    p50: pctile(turns, 0.5),
    p90: pctile(turns, 0.9)
  };
}

const f1 = (x: number) => x.toFixed(1);
const signed = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;

console.log(`Game-length experiment — production bots, ${GAMES} games/variant, counts [${COUNTS.join(',')}]\n`);
for (const numSeats of COUNTS) {
  const base = runVariant(numSeats, {});
  console.log(`=== ${numSeats} players ===`);
  console.log('variant                     n     stuck   mean    p50    p90     Δmean   Δp50   Δp90');
  for (const v of VARIANTS) {
    const s = v.name.startsWith('baseline') ? base : runVariant(numSeats, v.rules);
    const dMean = s.mean - base.mean;
    const dP50 = s.p50 - base.p50;
    const dP90 = s.p90 - base.p90;
    const isBase = v.name.startsWith('baseline');
    console.log(
      `${v.name.padEnd(26)} ${String(s.n).padStart(4)}  ${String(s.stuck).padStart(4)}  ` +
        `${f1(s.mean).padStart(6)} ${f1(s.p50).padStart(6)} ${f1(s.p90).padStart(6)}   ` +
        `${isBase ? '   —   ' : signed(dMean).padStart(6)} ${isBase ? '  — ' : signed(dP50).padStart(5)} ${isBase ? '  — ' : signed(dP90).padStart(5)}`
    );
  }
  console.log('');
}
