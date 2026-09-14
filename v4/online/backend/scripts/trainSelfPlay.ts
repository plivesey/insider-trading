import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type CardCatalog, type PlayerId } from '@insider-trading/shared';
import { makeRng } from '../src/domain/rng.js';
import { esStep, hashSeed } from '../src/bots/esCore.js';
import { withValueNet, type BotProfile } from '../src/bots/profile.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { playOneGame } from '../src/bots/selfPlay.js';
import { evalAcrossCountsBuilders } from '../src/bots/evaluate.js';
import {
  flattenWeights,
  paramCount,
  unflattenWeights,
  type ValueNetWeights
} from '../src/bots/valueNet.js';

/**
 * Retrain the stock-valuation net by ITERATED SELF-PLAY against the current
 * champion, in the production environment (trained params + per-bot variety +
 * min-bid bidding — all baked into makeProductionBotProfile + decide.ts).
 *
 * Each round: warm-start the candidate from the current champion and run ES with
 * the OTHER seats playing the (frozen) champion net. Fitness = placement vs those
 * champion opponents. Validate the round's best candidate vs the frozen champion
 * on held-out seeds; if it beats it by >= promoteThreshold avgEdge, PROMOTE it to
 * be the next round's opponent and repeat. Stop when a round yields no gain.
 *
 * The starting champion (nets/champion.json) is the production artifact and is
 * NEVER overwritten here — the evolving best is written to champion_selfplay.json
 * and promoted to production manually after verification.
 *
 *   tsx scripts/trainSelfPlay.ts [--gen 120] [--pop 24] [--games 16]
 *       [--sigma 0.05] [--lr 0.03] [--minSeats 2] [--maxSeats 5]
 *       [--valEvery 10] [--valGamesPerCount 200] [--promoteThreshold 0.01]
 *       [--maxRounds 6] [--params nets/bot_params.json]
 *       [--champion nets/champion.json] [--out nets] [--seed 1]
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

const GENERATIONS = flag('gen', 120);
const POP_PAIRS = flag('pop', 24); // population = 2P (antithetic)
const GAMES = flag('games', 16); // games per candidate eval (>= #table sizes)
const SIGMA = flag('sigma', 0.05);
const LR = flag('lr', 0.03);
const MIN_SEATS = flag('minSeats', 2);
const MAX_SEATS = flag('maxSeats', 5);
const COUNTS: number[] = [];
for (let n = MIN_SEATS; n <= MAX_SEATS; n++) COUNTS.push(n);
const VAL_EVERY = flag('valEvery', 10);
const VAL_GAMES_PER_COUNT = flag('valGamesPerCount', 200);
const PROMOTE_THRESHOLD = flag('promoteThreshold', 0.01); // min avgEdge over champ to promote
// Selection maximizes AVERAGE edge across counts; a per-count (e.g. 2p)
// regression is acceptable if the average improves a lot (one net can't be
// optimal at every player count).
// Anneal sigma/lr down to this fraction of their initial value over a round, so
// ES settles into a good region instead of drifting back out of it.
const ANNEAL_TO = flag('annealTo', 0.3);
const MAX_ROUNDS = flag('maxRounds', 6);
const SEED = flag('seed', 1);
const CHAMP_PATH = strFlag('champion', path.join(NETS_DIR, 'champion.json'));
const PARAMS_PATH = strFlag('params', path.join(NETS_DIR, 'bot_params.json'));
const OUT_DIR = strFlag('out', NETS_DIR);
const VAL_SEED_BASE = 100_000_007; // held-out: disjoint from training seeds

const ZERO_INPUTS = strFlag('zeroInputs', '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(n => Number.isInteger(n));

const catalog = loadCards(CARDS_DIR);
const trainedParams = JSON.parse(fs.readFileSync(PARAMS_PATH, 'utf8')) as BotParams;
const startingChampion = JSON.parse(fs.readFileSync(CHAMP_PATH, 'utf8')) as ValueNetWeights;
// Zero specific input columns of w1 so newly-added features start with no effect:
// the seed then behaves identically to the deployed champion, and self-play
// learns their weights from a clean baseline. Also save the seed for A/B.
if (ZERO_INPUTS.length) {
  for (const i of ZERO_INPUTS) {
    for (let h = 0; h < startingChampion.hiddenDim; h++) {
      startingChampion.w1[h * startingChampion.inputDim + i] = 0;
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'champion_seed.json'), JSON.stringify(startingChampion));
  console.log(`zeroed w1 input columns [${ZERO_INPUTS.join(',')}] → seed saved to champion_seed.json`);
}
const INPUT_DIM = startingChampion.inputDim;
const HIDDEN = startingChampion.hiddenDim;
const OUT_SCALE = startingChampion.outScale;
const DIM = paramCount(INPUT_DIM, HIDDEN);

const ids: PlayerId[] = [];
for (let s = 0; s < MAX_SEATS; s++) ids.push(`p${s}`);

const decode = (flat: Float64Array): ValueNetWeights =>
  unflattenWeights(flat, INPUT_DIM, HIDDEN, OUT_SCALE);

/**
 * Per-generation fixed game set (common random numbers). Personas carry the
 * production params + variety; their net is overridden per seat in evalCandidate.
 */
interface GenGames {
  gameSeeds: number[];
  tickSeeds: number[];
  candSeats: number[];
  basePersonas: BotProfile[][];
}

function buildGenGames(base: number): GenGames {
  const personaRng = makeRng(hashSeed(base, 0xfeed));
  const gameSeeds: number[] = [];
  const tickSeeds: number[] = [];
  const candSeats: number[] = [];
  const basePersonas: BotProfile[][] = [];
  for (let k = 0; k < GAMES; k++) {
    const n = COUNTS[k % COUNTS.length]; // even coverage of every table size
    gameSeeds.push(base + k);
    tickSeeds.push(hashSeed(base, k + 1));
    candSeats.push(k % n);
    const personas: BotProfile[] = [];
    // Net here is a placeholder (startingChampion); evalCandidate assigns the
    // real per-seat net via withValueNet. Only the params+variety are used.
    for (let s = 0; s < n; s++) {
      personas.push(makeProductionBotProfile(personaRng, startingChampion, trainedParams));
    }
    basePersonas.push(personas);
  }
  return { gameSeeds, tickSeeds, candSeats, basePersonas };
}

/**
 * Placement fitness of one candidate net vs the frozen champion field, over the
 * generation's game set. Fraction of opponents the candidate finished above,
 * centered to [-0.5, 0.5]; averaged across mixed-size games. Stuck games excluded.
 */
function evalCandidate(candNet: ValueNetWeights, frozenField: ValueNetWeights, gg: GenGames): number {
  let sum = 0;
  let counted = 0;
  for (let k = 0; k < GAMES; k++) {
    const candSeat = gg.candSeats[k];
    const seats = gg.basePersonas[k].map((persona, s) => ({
      playerId: ids[s],
      name: `Bot${s}`,
      profile: withValueNet(persona, s === candSeat ? candNet : frozenField)
    }));
    const res = playOneGame({
      catalog,
      seats,
      gameSeed: gg.gameSeeds[k],
      tickSeed: gg.tickSeeds[k]
    });
    if (!res.finished || res.stuck) continue;
    counted++;
    const nnId = ids[candSeat];
    const nn = res.breakdown.find(b => b.playerId === nnId)!;
    const opp = res.breakdown.filter(b => b.playerId !== nnId);
    let beaten = 0;
    for (const o of opp) {
      if (nn.total > o.total) beaten += 1;
      else if (nn.total === o.total) beaten += 0.5;
    }
    sum += beaten / Math.max(1, opp.length) - 0.5;
  }
  return counted > 0 ? sum / counted : -1;
}

/** Validate a candidate vs the frozen champion (both production profiles). */
function validate(candNet: ValueNetWeights, frozenField: ValueNetWeights) {
  return evalAcrossCountsBuilders({
    catalog,
    subject: rng => makeProductionBotProfile(rng, candNet, trainedParams),
    field: rng => makeProductionBotProfile(rng, frozenField, trainedParams),
    counts: COUNTS,
    gamesPerCount: VAL_GAMES_PER_COUNT,
    baseSeed: VAL_SEED_BASE
  });
}

function saveNet(file: string, flat: Float64Array): void {
  fs.writeFileSync(file, JSON.stringify(decode(flat)));
}

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const csvPath = path.join(OUT_DIR, 'selfplay_log.csv');
  const wrCols = COUNTS.map(n => `wr${n}p`).join(',');
  fs.writeFileSync(csvPath, `round,gen,meanFit,bestFit,avgEdge,minEdge,${wrCols},wallMs\n`);

  const noiseRng = makeRng(hashSeed(SEED, 0x1234));
  let currentChampion = startingChampion;
  let promoted = 0;

  console.log(
    `Self-play ES: net=${INPUT_DIM}x${HIDDEN} (params=${DIM}), pop=${2 * POP_PAIRS}, ` +
      `games/eval=${GAMES}, seats=[${COUNTS.join(',')}], gen/round=${GENERATIONS}, ` +
      `maxRounds=${MAX_ROUNDS}, promoteThreshold=${(PROMOTE_THRESHOLD * 100).toFixed(1)}%`
  );

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const frozenField = currentChampion;
    let theta = flattenWeights(currentChampion);
    let bestEdge = -Infinity;
    let bestTheta = theta.slice();
    console.log(`\n=== Round ${round} (vs frozen champion) ===`);

    for (let gen = 0; gen < GENERATIONS; gen++) {
      const t0 = Date.now();
      const gg = buildGenGames(hashSeed(SEED, round * 10_007 + gen + 1));
      // Linearly anneal sigma/lr from full → ANNEAL_TO over the round.
      const frac = GENERATIONS > 1 ? gen / (GENERATIONS - 1) : 0;
      const decay = 1 - (1 - ANNEAL_TO) * frac;
      const { fits } = esStep(
        theta,
        cand => evalCandidate(decode(cand), frozenField, gg),
        { popPairs: POP_PAIRS, sigma: SIGMA * decay, lr: LR * decay, noiseRng }
      );
      const meanFit = fits.reduce((a, b) => a + b, 0) / fits.length;
      const bestFit = Math.max(...fits);
      const wallMs = Date.now() - t0;

      let valStr = '';
      let csvVal = `,,${COUNTS.map(() => '').join(',')}`;
      if (gen % VAL_EVERY === 0 || gen === GENERATIONS - 1) {
        const v = validate(decode(theta), frozenField);
        const perCountStr = v.perCount
          .map(r => `${r.numSeats}p:${(r.nnWinRate * 100).toFixed(0)}/${(r.fairShare * 100).toFixed(0)}`)
          .join(' ');
        valStr = ` | edgeVsChamp=${(v.avgEdge * 100).toFixed(1)}% min=${(v.minEdge * 100).toFixed(1)}% [${perCountStr}]`;
        const wr = v.perCount.map(r => r.nnWinRate.toFixed(4)).join(',');
        csvVal = `${v.avgEdge.toFixed(4)},${v.minEdge.toFixed(4)},${wr}`;
        // Keep the best-by-average-edge checkpoint across the whole run, saving
        // it immediately so a later drift can't lose the peak.
        if (v.avgEdge > bestEdge) {
          bestEdge = v.avgEdge;
          bestTheta = theta.slice();
          saveNet(path.join(OUT_DIR, 'champion_selfplay.json'), bestTheta);
          valStr += ' *best';
        }
      }
      console.log(
        `r${round} gen ${String(gen).padStart(4)} | meanFit=${meanFit.toFixed(3)} ` +
          `bestFit=${bestFit.toFixed(3)} | ${wallMs}ms${valStr}`
      );
      fs.appendFileSync(
        csvPath,
        `${round},${gen},${meanFit.toFixed(4)},${bestFit.toFixed(4)},${csvVal},${wallMs}\n`
      );
    }

    if (bestEdge >= PROMOTE_THRESHOLD) {
      currentChampion = decode(bestTheta);
      promoted++;
      saveNet(path.join(OUT_DIR, 'champion_selfplay.json'), bestTheta);
      console.log(
        `Round ${round}: PROMOTED (edgeVsPrev=${(bestEdge * 100).toFixed(1)}%) → champion_selfplay.json`
      );
    } else {
      const bestStr = Number.isFinite(bestEdge)
        ? `${(bestEdge * 100).toFixed(1)}%`
        : 'none dominated';
      console.log(
        `Round ${round}: no improvement (best dominating avgEdge=${bestStr} < ` +
          `${(PROMOTE_THRESHOLD * 100).toFixed(1)}%) — stopping.`
      );
      break;
    }
  }

  if (promoted === 0) {
    console.log('\nDone. No round beat the starting champion; champion_selfplay.json not written.');
  } else {
    console.log(
      `\nDone. Promoted ${promoted} round(s). Best net → ${path.join(OUT_DIR, 'champion_selfplay.json')}`
    );
    console.log('Next: A/B vs the ORIGINAL champion, then promote to champion.json if improved.');
  }
}

main();
