import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { makeBotProfile, type BotParams } from '../src/bots/botParams.js';
import { evalSubjectVsPool, type ProfileBuilder } from '../src/bots/evaluate.js';
import { buildOpponentPool } from '../src/bots/opponentPool.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Validate a net+params combo against the FIXED diverse opponent pool
 * (opponentPool.ts) -- the promotion gate a candidate must clear before
 * shipping, per v5_tuning_notes.md item 18. Reports the WORST per-archetype
 * edge, not an average: a candidate that only wins on average can still be
 * badly exploitable by one specific archetype (exactly what happened to the
 * champion this pool was built in response to).
 *
 *   tsx scripts/validateVsPool.ts <net.json> <bot_params.json>
 *       [--games 2400] [--seed 4242] [--counts 2,3,4,5]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}
function strFlag(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? String(process.argv[i + 1]) : dflt;
}

const netPath = process.argv[2];
const paramsPath = process.argv[3];
if (!netPath || !paramsPath || netPath.startsWith('--') || paramsPath.startsWith('--')) {
  console.error('usage: tsx scripts/validateVsPool.ts <net.json> <bot_params.json> [--games 2400] [--seed 4242] [--counts 2,3,4,5]');
  process.exit(1);
}

const net = JSON.parse(fs.readFileSync(netPath, 'utf8')) as ValueNetWeights;
const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8')) as BotParams;
const games = flag('games', 2400);
const baseSeed = flag('seed', 4242);
const counts = strFlag('counts', '2,3,4,5')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(n => n >= 2 && n <= 6);

const catalog = loadCards(CARDS_DIR);
const subject: ProfileBuilder = () => makeBotProfile(params, net);
const pool = buildOpponentPool(net, params);
const poolNames = ['legacyHeuristic', 'aggressiveGoalRusher'];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Validating ${netPath} + ${paramsPath} vs the fixed opponent pool, ${games} games/archetype/count\n`);

let worstOverall = Infinity;
let worstOverallLabel = '';
for (const n of counts) {
  console.log(`=== ${n}p ===`);
  const result = evalSubjectVsPool({ catalog, subject, pool, games, numSeats: n, baseSeed: baseSeed + n * 97 });
  for (let i = 0; i < result.perArchetype.length; i++) {
    const r = result.perArchetype[i];
    const edge = r.nnWinRate - r.fairShare;
    const label = `${n}p vs ${poolNames[i]}`;
    if (edge < worstOverall) {
      worstOverall = edge;
      worstOverallLabel = label;
    }
    console.log(
      `  vs ${poolNames[i].padEnd(20)} winRate=${pct(r.nnWinRate)} (${pct(r.nnWinRateCi95[0])}..${pct(r.nnWinRateCi95[1])})` +
        ` fair=${pct(r.fairShare)} edge=${pct(edge)} margin=$${r.meanMargin.toFixed(2)}` +
        (r.stuck ? ` (${r.stuck} stuck)` : '')
    );
  }
  console.log(`  worst archetype this count: ${poolNames[result.worstArchetypeIndex]} (edge ${pct(result.worstEdge)})\n`);
}

console.log(`WORST EDGE OVERALL: ${pct(worstOverall)} (${worstOverallLabel})`);
