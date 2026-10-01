import fs from 'node:fs';
import { PARAM_SPECS, type BotParams } from '../src/bots/botParams.js';
import { makeRng } from '../src/domain/rng.js';

/**
 * Generate a uniformly-random BotParams vector within PARAM_SPECS bounds, to
 * use as a `trainBotParams.ts --resume` starting point far from the current
 * defaults/trained values (a different ES basin than a `--resume`-less run,
 * which always starts at today's defaults).
 *
 *   tsx scripts/randomizeBotParams.ts <out.json> [--seed 1]
 */

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

const out = process.argv[2];
if (!out || out.startsWith('--')) {
  console.error('usage: tsx scripts/randomizeBotParams.ts <out.json> [--seed 1]');
  process.exit(1);
}
const seed = flag('seed', 1);
const rng = makeRng(seed);

const params = {} as BotParams;
for (const spec of PARAM_SPECS) {
  const v = spec.min + (spec.max - spec.min) * rng.next();
  params[spec.key] = spec.int ? Math.round(v) : v;
}

fs.writeFileSync(out, JSON.stringify(params, null, 2));
console.log(`Wrote random BotParams (seed=${seed}) -> ${out}`);
