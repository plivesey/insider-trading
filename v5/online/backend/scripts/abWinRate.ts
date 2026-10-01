import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { evalNetVsHeuristic } from '../src/bots/evaluate.js';
import { STOCK_FEATURE_LEN, type ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Standalone A/B test: load a trained ValueNet champion and report how it does
 * against heuristic bots over many games.
 *
 *   tsx scripts/abWinRate.ts <champion.json> [--games 2000] [--seats 4] [--seed 7777]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

const netPath = process.argv[2];
if (!netPath || netPath.startsWith('--')) {
  console.error('usage: tsx scripts/abWinRate.ts <champion.json> [--games N] [--seats N] [--seed N]');
  process.exit(1);
}

const net = JSON.parse(fs.readFileSync(netPath, 'utf8')) as ValueNetWeights;
if (net.inputDim !== STOCK_FEATURE_LEN) {
  console.error(`net inputDim ${net.inputDim} != STOCK_FEATURE_LEN ${STOCK_FEATURE_LEN}`);
  process.exit(1);
}

const catalog = loadCards(CARDS_DIR);
const games = flag('games', 2000);
const numSeats = flag('seats', 4);
const baseSeed = flag('seed', 7777);

const t0 = Date.now();
const r = evalNetVsHeuristic({ catalog, net, games, numSeats, baseSeed });
const ms = Date.now() - t0;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`\nValueNet vs ${numSeats - 1} heuristic bots — ${r.counted}/${games} games counted (${r.stuck} stuck)`);
console.log(`  win rate : ${pct(r.nnWinRate)}  (95% CI ${pct(r.nnWinRateCi95[0])}..${pct(r.nnWinRateCi95[1])})`);
console.log(`  fair share: ${pct(r.fairShare)}  ${r.nnWinRateCi95[0] > r.fairShare ? '✅ beats heuristic' : '❌ not above fair share'}`);
console.log(`  mean margin: $${r.meanMargin.toFixed(2)}  (95% CI ${r.marginCi95[0].toFixed(2)}..${r.marginCi95[1].toFixed(2)})`);
console.log(`  per-seat win rate: ${r.perSeatWinRate.map(pct).join('  ')}`);
console.log(`  (${ms} ms, ${(games / (ms / 1000)).toFixed(0)} games/s)`);
