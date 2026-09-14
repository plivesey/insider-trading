import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { evalSubjectVsField, type ProfileBuilder } from '../src/bots/evaluate.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * A/B two stock-valuation nets head to head, BOTH wearing the production profile
 * (trained params + per-bot variety + min-bid bidding), across table sizes 2..5.
 * This is the "did the retrained net actually beat the old champion?" test.
 *
 *   tsx scripts/abNets.ts <subject.json> <field.json>
 *       [--params nets/bot_params.json] [--games 2400] [--seed 4242]
 *
 * subject = the candidate net; field = the reference (e.g. the old champion).
 * winRate > fairShare ⇒ subject beats field.
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

const subjectPath = process.argv[2];
const fieldPath = process.argv[3];
if (!subjectPath || !fieldPath || subjectPath.startsWith('--') || fieldPath.startsWith('--')) {
  console.error('usage: tsx scripts/abNets.ts <subject.json> <field.json> [--params path] [--games N] [--seed N]');
  process.exit(1);
}

const paramsPath = strFlag('params', path.join(HERE, '..', 'nets', 'bot_params.json'));
const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8')) as BotParams;
const subjectNet = JSON.parse(fs.readFileSync(subjectPath, 'utf8')) as ValueNetWeights;
const fieldNet = JSON.parse(fs.readFileSync(fieldPath, 'utf8')) as ValueNetWeights;
const games = flag('games', 2400);
const baseSeed = flag('seed', 4242);

const catalog = loadCards(CARDS_DIR);
const subject: ProfileBuilder = rng => makeProductionBotProfile(rng, subjectNet, params);
const field: ProfileBuilder = rng => makeProductionBotProfile(rng, fieldNet, params);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Subject net (${path.basename(subjectPath)}) vs field net (${path.basename(fieldPath)}),`);
console.log(`both + trained params + variety, ${games} games/count\n`);
console.log('count  winRate (95% CI)        fair   margin      verdict');
for (let n = 2; n <= 5; n++) {
  const r = evalSubjectVsField({ catalog, subject, field, games, numSeats: n, baseSeed: baseSeed + n });
  const beats = r.nnWinRateCi95[0] > r.fairShare;
  const regress = r.nnWinRateCi95[1] < r.fairShare;
  console.log(
    `  ${n}p   ${pct(r.nnWinRate)} (${pct(r.nnWinRateCi95[0])}..${pct(r.nnWinRateCi95[1])})   ` +
      `${pct(r.fairShare)}   $${r.meanMargin.toFixed(2).padStart(6)}   ` +
      `${beats ? '✅ beats' : regress ? '❌ regress' : '≈ par'}` +
      (r.stuck ? `  (${r.stuck} stuck)` : '')
  );
}
