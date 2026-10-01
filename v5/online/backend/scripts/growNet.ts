import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng } from '../src/domain/rng.js';
import { hashSeed } from '../src/bots/esCore.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { forward, type ValueNetWeights } from '../src/bots/valueNet.js';
import { STOCK_FEATURE_LEN, encodeColorFeatures } from '../src/bots/valueNetFeatures.js';

/**
 * One-time migration: pad an existing net's `w1` matrix with zero-initialized
 * columns so its `inputDim` matches the current (larger) `STOCK_FEATURE_LEN`.
 * A net's forward pass only reads `x[0..inputDim-1]` (see valueNet.ts's
 * `forward`), so an un-migrated net simply ignores new feature slots rather
 * than crashing -- but it can never learn to use them until its matrix is
 * actually grown. Zero-initializing the new columns means the grown net's
 * forward pass is byte-identical to the original for every input (verified
 * below), so this migration itself changes nothing about deployed behavior;
 * only a subsequent retrain (e.g. trainSelfPlay.ts --zeroInputs, redundant
 * with the zero-init here but a cheap extra safety check) can move it.
 *
 *   tsx scripts/growNet.ts <in.json> <out.json>
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error('usage: tsx scripts/growNet.ts <in.json> <out.json>');
  process.exit(1);
}

const net = JSON.parse(fs.readFileSync(inPath, 'utf8')) as ValueNetWeights;
if (net.inputDim >= STOCK_FEATURE_LEN) {
  console.error(`net inputDim ${net.inputDim} is already >= STOCK_FEATURE_LEN ${STOCK_FEATURE_LEN} -- nothing to grow`);
  process.exit(1);
}

const oldDim = net.inputDim;
const newDim = STOCK_FEATURE_LEN;
const hidden = net.hiddenDim;
const newW1 = new Array<number>(newDim * hidden).fill(0);
for (let h = 0; h < hidden; h++) {
  for (let i = 0; i < oldDim; i++) {
    newW1[h * newDim + i] = net.w1[h * oldDim + i];
  }
  // columns [oldDim..newDim) stay 0 -- the new features start with no effect
}

const grown: ValueNetWeights = { ...net, inputDim: newDim, w1: newW1 };

// Verify byte-identical forward-pass output on a sample of real game states
// before writing anything -- the whole point of this migration is that it
// changes nothing observable until a retrain moves the new columns.
const catalog = loadCards(CARDS_DIR);
const paramsPath = path.join(HERE, '..', 'nets', 'bot_params.json');
const baseParams = JSON.parse(fs.readFileSync(paramsPath, 'utf8')) as BotParams;

let checked = 0;
let mismatches = 0;
for (let seed = 1; seed <= 5; seed++) {
  const players = [0, 1, 2, 3].map(s => ({ playerId: `p${s}`, name: `Bot${s}`, isBot: true }));
  const state = createGameState({
    catalog,
    players,
    seed,
    gameId: `grow-check-${seed}`,
    startedAt: '2026-01-01T00:00:00.000Z'
  });
  const rng = makeRng(hashSeed(seed, 1));
  const profile = makeProductionBotProfile(rng, net, baseParams);
  // Give players varied hands/cash/loans so the sampled feature vectors aren't
  // all near-identical turn-1 states.
  state.players[0].hand.push(...catalog.stocks.filter(s => s.color === 'Blue').slice(0, 2));
  state.players[1].cash = 3;
  state.players[1].loans = 2;
  state.progressTracker = Math.max(0, state.progressThreshold - 1);
  for (const p of state.players) {
    for (const color of ['Blue', 'Orange', 'Green', 'Purple'] as const) {
      const x = encodeColorFeatures(state, color, false, p.playerId, profile);
      const oldOut = forward(net, x);
      const newOut = forward(grown, x);
      checked++;
      if (Math.abs(oldOut - newOut) > 1e-9) mismatches++;
    }
  }
}

if (mismatches > 0) {
  console.error(`FAILED: ${mismatches}/${checked} sampled forward-pass outputs differ between old and grown net`);
  process.exit(1);
}
console.log(`Verified: ${checked} sampled forward-pass outputs are byte-identical (old ${oldDim}-dim vs grown ${newDim}-dim net).`);

fs.writeFileSync(outPath, JSON.stringify(grown, null, 2));
console.log(`Wrote grown net (inputDim ${oldDim} -> ${newDim}) to ${outPath}`);
