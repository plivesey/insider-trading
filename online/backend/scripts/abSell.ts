import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { evalSubjectVsField, type ProfileBuilder } from '../src/bots/evaluate.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * A/B emergency-sell thresholds. The emergency-sell rule fires when
 * `cash < cashThreshold && loans >= minLoans`. Compares each variant against the
 * current baseline (cash<10, loans>=1) head-to-head, using the production net +
 * params + loan cap, across table sizes.
 *
 *   tsx scripts/abSell.ts [--games 1500] [--counts 2,3,4,5] [--net path]
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

const GAMES = flag('games', 1500);
const COUNTS = strFlag('counts', '2,3,4,5').split(',').map(s => Number(s.trim()));
const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(strFlag('net', path.join(NETS_DIR, 'champion.json')), 'utf8')) as ValueNetWeights;
const params = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;

interface SellCfg {
  name: string;
  cash: number;
  loans: number;
}
const BASELINE: SellCfg = { name: 'baseline (<10 & 1 loan)', cash: 10, loans: 1 };
const VARIANTS: SellCfg[] = [
  { name: '<5 & 1 loan', cash: 5, loans: 1 },
  { name: '<10 & 2 loans', cash: 10, loans: 2 },
  { name: '<5 & 2 loans', cash: 5, loans: 2 }
];

function builder(cfg: SellCfg): ProfileBuilder {
  return rng => {
    const p = makeProductionBotProfile(rng, net, params);
    p.params = { ...p.params, emergencySellCash: cfg.cash };
    p.emergencySellMinLoans = cfg.loans;
    return p;
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Emergency-sell A/B — each variant vs ${BASELINE.name}, ${GAMES} games/count\n`);
const field = builder(BASELINE);
for (const v of VARIANTS) {
  console.log(`=== ${v.name} (subject) vs ${BASELINE.name} (field) ===`);
  console.log('count  winRate (95% CI)        fair   verdict');
  const subject = builder(v);
  for (const n of COUNTS) {
    const r = evalSubjectVsField({ catalog, subject, field, games: GAMES, numSeats: n, baseSeed: 5000 + n });
    const beats = r.nnWinRateCi95[0] > r.fairShare;
    const worse = r.nnWinRateCi95[1] < r.fairShare;
    console.log(
      `  ${n}p   ${pct(r.nnWinRate)} (${pct(r.nnWinRateCi95[0])}..${pct(r.nnWinRateCi95[1])})   ${pct(r.fairShare)}   ` +
        `${beats ? '✅ better' : worse ? '❌ worse' : '≈ same'}`
    );
  }
  console.log('');
}
