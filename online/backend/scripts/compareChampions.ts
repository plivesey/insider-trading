import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { evalAcrossCountsBuilders } from '../src/bots/evaluate.js';
import { STOCK_FEATURE_LEN, type ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Head-to-head report: candidate net vs. a baseline net, both wrapped in
 * makeProductionBotProfile (trained BotParams + per-bot variety + min-bid
 * bidding) so the comparison matches production exactly -- not the bare
 * defaults abWinRate.ts's net-vs-heuristic check uses. This is the "how much
 * did it actually improve" report for a retrain (see the
 * retrain-bot-value-net skill).
 *
 *   tsx scripts/compareChampions.ts <candidate.json> [baseline.json]
 *       [--games 400] [--minSeats 2] [--maxSeats 5] [--seed 7777]
 *       [--params nets/bot_params.json]
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

const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const candPath = positional[0];
if (!candPath) {
  console.error(
    'usage: tsx scripts/compareChampions.ts <candidate.json> [baseline.json] ' +
      '[--games 400] [--minSeats 2] [--maxSeats 5] [--seed 7777] [--params nets/bot_params.json]'
  );
  process.exit(1);
}
const basePath = positional[1] ?? path.join(NETS_DIR, 'champion.json');
const paramsPath = strFlag('params', path.join(NETS_DIR, 'bot_params.json'));
const games = flag('games', 400);
const minSeats = flag('minSeats', 2);
const maxSeats = flag('maxSeats', 5);
const seed = flag('seed', 7777);

function loadNet(p: string): ValueNetWeights {
  const net = JSON.parse(fs.readFileSync(p, 'utf8')) as ValueNetWeights;
  if (net.inputDim !== STOCK_FEATURE_LEN) {
    console.error(`${p}: inputDim ${net.inputDim} != STOCK_FEATURE_LEN ${STOCK_FEATURE_LEN}`);
    process.exit(1);
  }
  return net;
}

const candidate = loadNet(candPath);
const baseline = loadNet(basePath);
const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8')) as BotParams;
const catalog = loadCards(CARDS_DIR);

const counts: number[] = [];
for (let n = minSeats; n <= maxSeats; n++) counts.push(n);

console.log(`Candidate: ${candPath}`);
console.log(`Baseline : ${basePath}`);
console.log(`${games} games/count, seats=[${counts.join(',')}], seed=${seed}\n`);

const t0 = Date.now();
const result = evalAcrossCountsBuilders({
  catalog,
  subject: rng => makeProductionBotProfile(rng, candidate, params),
  field: rng => makeProductionBotProfile(rng, baseline, params),
  counts,
  gamesPerCount: games,
  baseSeed: seed
});
const ms = Date.now() - t0;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
for (const r of result.perCount) {
  const edge = r.nnWinRate - r.fairShare;
  const verdict = r.nnWinRateCi95[0] > r.fairShare ? '✅ beats baseline' : edge > 0 ? '~ marginal' : '❌ worse';
  console.log(
    `${r.numSeats}p: win rate ${pct(r.nnWinRate)} (95% CI ${pct(r.nnWinRateCi95[0])}..${pct(r.nnWinRateCi95[1])}), ` +
      `fair share ${pct(r.fairShare)}, edge ${edge >= 0 ? '+' : ''}${pct(edge)}, mean margin $${r.meanMargin.toFixed(2)} ` +
      `(${r.counted}/${r.games} counted, ${r.stuck} stuck) ${verdict}`
  );
}
console.log(
  `\nAverage edge across table sizes: ${result.avgEdge >= 0 ? '+' : ''}${pct(result.avgEdge)}  ` +
    `(min ${result.minEdge >= 0 ? '+' : ''}${pct(result.minEdge)})`
);
console.log(`(${ms} ms)`);
