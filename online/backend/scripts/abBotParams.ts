import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { createBotProfile, withValueNet } from '../src/bots/profile.js';
import { defaultBotParams, makeBotProfile, type BotParams } from '../src/bots/botParams.js';
import { evalSubjectVsField, type ProfileBuilder } from '../src/bots/evaluate.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * A/B a tuned BotParams set against a field, both using the same trained net for
 * stock value, across table sizes 2..5.
 *
 *   tsx scripts/abBotParams.ts <bot_params.json> [--net nets/champion.json]
 *       [--games 2400] [--seed 4242] [--vs default|random|<other_bot_params.json>]
 *
 * --vs default        : opponents = net + default params (isolates the tuning effect)
 * --vs random         : opponents = net + randomized-personality params (today's deployed bot)
 * --vs <path>.json     : opponents = net + that file's params (head-to-head vs. e.g. the
 *                        currently-shipped nets/bot_params.json, before promoting a candidate)
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

const paramsPath = process.argv[2];
if (!paramsPath || paramsPath.startsWith('--')) {
  console.error('usage: tsx scripts/abBotParams.ts <bot_params.json> [--net path] [--games N] [--seed N] [--vs default|random]');
  process.exit(1);
}

const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8')) as BotParams;
const netPath = strFlag('net', path.join(HERE, '..', 'nets', 'champion.json'));
const net = JSON.parse(fs.readFileSync(netPath, 'utf8')) as ValueNetWeights;
const games = flag('games', 2400);
const baseSeed = flag('seed', 4242);
const vs = strFlag('vs', 'default');

const catalog = loadCards(CARDS_DIR);
const subject: ProfileBuilder = () => makeBotProfile(params, net);
let field: ProfileBuilder;
let vsLabel: string;
if (vs === 'random') {
  field = rng => withValueNet(createBotProfile(rng), net);
  vsLabel = 'random-personality';
} else if (vs === 'default') {
  field = () => makeBotProfile(defaultBotParams(), net);
  vsLabel = 'default-params';
} else {
  const otherParams = JSON.parse(fs.readFileSync(vs, 'utf8')) as BotParams;
  field = () => makeBotProfile(otherParams, net);
  vsLabel = vs;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Tuned params (${paramsPath}) vs ${vsLabel} bot (both + net), ${games} games/count\n`);
console.log('count  winRate (95% CI)        fair   margin      verdict');
for (let n = 2; n <= 5; n++) {
  const r = evalSubjectVsField({ catalog, subject, field, games, numSeats: n, baseSeed: baseSeed + n });
  const beats = r.nnWinRateCi95[0] > r.fairShare;
  console.log(
    `  ${n}p   ${pct(r.nnWinRate)} (${pct(r.nnWinRateCi95[0])}..${pct(r.nnWinRateCi95[1])})   ` +
      `${pct(r.fairShare)}   $${r.meanMargin.toFixed(2).padStart(6)}   ${beats ? '✅ beats' : '≈ par'}` +
      (r.stuck ? `  (${r.stuck} stuck)` : '')
  );
}
