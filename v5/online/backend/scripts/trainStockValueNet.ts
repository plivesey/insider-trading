import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type CardCatalog, type PlayerId } from '@insider-trading/shared';
import { makeRng } from '../src/domain/rng.js';
import { esStep, hashSeed } from '../src/bots/esCore.js';
import { createBotProfile, withValueNet, type BotProfile } from '../src/bots/profile.js';
import { playOneGame } from '../src/bots/selfPlay.js';
import { evalAcrossCounts } from '../src/bots/evaluate.js';
import {
  STOCK_FEATURE_LEN,
  flattenWeights,
  paramCount,
  randomWeights,
  unflattenWeights,
  type ValueNetWeights
} from '../src/bots/valueNet.js';

/**
 * Train the stock-valuation MLP with Evolution Strategies (OpenAI-style:
 * mirrored sampling + rank-normalized utilities + common-random-numbers per
 * generation). The candidate net plays one rotating seat against heuristic bots;
 * fitness is its end-game wealth margin over those opponents. No backprop, no
 * GPU — just forward passes through fast headless self-play.
 *
 *   tsx scripts/trainStockValueNet.ts [--gen 200] [--pop 32] [--games 12]
 *       [--sigma 0.05] [--lr 0.03] [--seats 4] [--hidden 28]
 *       [--valEvery 10] [--valGames 200] [--seed 1] [--out ./nets]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const OUT_SCALE = 12;

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}
function strFlag(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? String(process.argv[i + 1]) : dflt;
}

const GENERATIONS = flag('gen', 200);
const POP_PAIRS = flag('pop', 32); // P; population is 2P (antithetic)
const GAMES = flag('games', 15); // K games per candidate eval (≥ #table sizes)
const SIGMA = flag('sigma', 0.05);
const LR = flag('lr', 0.03);
// Table sizes to train/validate on. `--seats N` pins a single size; otherwise
// each game's player count is round-robin'd over [minSeats, maxSeats] so one
// generalist net learns every size. Default 2..5 (6-player is being dropped).
const FIXED_SEATS = process.argv.includes('--seats') ? flag('seats', 4) : 0;
const MIN_SEATS = FIXED_SEATS || flag('minSeats', 2);
const MAX_SEATS = FIXED_SEATS || flag('maxSeats', 5);
const COUNTS: number[] = [];
for (let n = MIN_SEATS; n <= MAX_SEATS; n++) COUNTS.push(n);
const HIDDEN = flag('hidden', 28);
const VAL_EVERY = flag('valEvery', 10);
const VAL_GAMES_PER_COUNT = flag('valGamesPerCount', 120);
const SEED = flag('seed', 1);
const OUT_DIR = strFlag('out', path.join(HERE, '..', 'nets'));
const RESUME = strFlag('resume', ''); // warm-start theta from this checkpoint JSON
const VAL_SEED_BASE = 100_000_007; // held-out: disjoint from training seeds

const INPUT_DIM = STOCK_FEATURE_LEN;
const DIM = paramCount(INPUT_DIM, HIDDEN);

const ids: PlayerId[] = [];
for (let s = 0; s < MAX_SEATS; s++) ids.push(`p${s}`);

/**
 * Per-generation fixed game set (common random numbers): same seeds, table
 * sizes, seat rotation, and opponent personalities for every population member,
 * so fitness differences reflect weights, not luck.
 */
interface GenGames {
  gameSeeds: number[];
  tickSeeds: number[];
  seatCounts: number[]; // player count per game (round-robin over COUNTS)
  candSeats: number[];
  basePersonas: BotProfile[][]; // [game][seat] immutable persona; cloned per episode
}

function buildGenGames(catalog: CardCatalog, gen: number): GenGames {
  const base = hashSeed(SEED, gen + 1);
  const personaRng = makeRng(hashSeed(base, 0xfeed));
  const gameSeeds: number[] = [];
  const tickSeeds: number[] = [];
  const seatCounts: number[] = [];
  const candSeats: number[] = [];
  const basePersonas: BotProfile[][] = [];
  for (let k = 0; k < GAMES; k++) {
    const n = COUNTS[k % COUNTS.length]; // even coverage of every table size
    gameSeeds.push(base + k);
    tickSeeds.push(hashSeed(base, k + 1));
    seatCounts.push(n);
    candSeats.push(k % n);
    const personas: BotProfile[] = [];
    for (let s = 0; s < n; s++) personas.push(createBotProfile(personaRng));
    basePersonas.push(personas);
  }
  void catalog;
  return { gameSeeds, tickSeeds, seatCounts, candSeats, basePersonas };
}

/**
 * Fitness of one candidate over the generation's game set. Uses a scale-free
 * PLACEMENT score per game — fraction of opponents the net finished above,
 * centered to [-0.5, 0.5] — so no table size dominates (a $-margin would: a
 * 2-player margin dwarfs a 5-player one). 0.5 = beat everyone (a win),
 * -0.5 = last. Averaged across the mixed-size games.
 */
function evalCandidate(catalog: CardCatalog, net: ValueNetWeights, gg: GenGames): number {
  let sum = 0;
  let counted = 0;
  for (let k = 0; k < GAMES; k++) {
    const candSeat = gg.candSeats[k];
    const seats = gg.basePersonas[k].map((persona, s) => ({
      playerId: ids[s],
      name: `Bot${s}`,
      // withValueNet returns a FRESH profile (resets per-game mutable state),
      // so reusing the persona objects across candidates is safe.
      profile: withValueNet(persona, s === candSeat ? net : undefined)
    }));
    const res = playOneGame({
      catalog,
      seats,
      gameSeed: gg.gameSeeds[k],
      tickSeed: gg.tickSeeds[k]
    });
    // A small % of games livelock regardless of weights (a pre-existing engine
    // edge case). Exclude them rather than penalize, so a candidate isn't graded
    // on dodging/causing a seed-driven stuck game. CRN makes which games stick
    // roughly the same across candidates anyway.
    if (!res.finished || res.stuck) continue;
    counted++;
    const nnId = ids[candSeat];
    const nn = res.breakdown.find(b => b.playerId === nnId)!;
    const opp = res.breakdown.filter(b => b.playerId !== nnId);
    let beaten = 0;
    for (const o of opp) {
      if (nn.total > o.total) beaten += 1;
      else if (nn.total === o.total) beaten += 0.5; // split ties
    }
    sum += beaten / Math.max(1, opp.length) - 0.5;
  }
  return counted > 0 ? sum / counted : -1;
}

function saveNet(file: string, theta: Float64Array): void {
  const net = unflattenWeights(theta, INPUT_DIM, HIDDEN, OUT_SCALE);
  fs.writeFileSync(file, JSON.stringify(net));
}

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const csvPath = path.join(OUT_DIR, 'training_log.csv');
  const wrCols = COUNTS.map(n => `wr${n}p`).join(',');
  fs.writeFileSync(csvPath, `gen,meanFit,bestFit,avgEdge,minEdge,${wrCols},wallMs\n`);

  const catalog = loadCards(CARDS_DIR);
  const paramRng = makeRng(SEED);
  let theta: Float64Array;
  if (RESUME) {
    const loaded = JSON.parse(fs.readFileSync(RESUME, 'utf8')) as ValueNetWeights;
    if (loaded.inputDim !== INPUT_DIM || loaded.hiddenDim !== HIDDEN) {
      throw new Error(
        `resume net structure (${loaded.inputDim}x${loaded.hiddenDim}) != requested (${INPUT_DIM}x${HIDDEN})`
      );
    }
    theta = flattenWeights(loaded);
    console.log(`resumed theta from ${RESUME}`);
  } else {
    theta = flattenWeights(randomWeights(INPUT_DIM, HIDDEN, paramRng, OUT_SCALE));
  }
  const noiseRng = makeRng(hashSeed(SEED, 0x1234));

  const validate = (t: Float64Array) =>
    evalAcrossCounts({
      catalog,
      net: unflattenWeights(t, INPUT_DIM, HIDDEN, OUT_SCALE),
      counts: COUNTS,
      gamesPerCount: VAL_GAMES_PER_COUNT,
      baseSeed: VAL_SEED_BASE
    });

  let bestValScore = -Infinity;
  if (RESUME) {
    // Seed the champion bar from the resumed net so a worse checkpoint can't
    // clobber a good champion early in this iteration.
    const v0 = validate(theta);
    bestValScore = v0.avgEdge;
    console.log(`resumed avgEdge=${(v0.avgEdge * 100).toFixed(1)}% minEdge=${(v0.minEdge * 100).toFixed(1)}%`);
  }
  console.log(
    `ES training: params=${DIM} (in=${INPUT_DIM}, hidden=${HIDDEN}), pop=${2 * POP_PAIRS}, ` +
      `games/eval=${GAMES}, seats=[${COUNTS.join(',')}], gen=${GENERATIONS}`
  );

  for (let gen = 0; gen < GENERATIONS; gen++) {
    const t0 = Date.now();
    const gg = buildGenGames(catalog, gen);

    const { fits } = esStep(
      theta,
      cand => evalCandidate(catalog, unflattenWeights(cand, INPUT_DIM, HIDDEN, OUT_SCALE), gg),
      { popPairs: POP_PAIRS, sigma: SIGMA, lr: LR, noiseRng }
    );

    const meanFit = fits.reduce((a, b) => a + b, 0) / fits.length;
    const bestFit = Math.max(...fits);
    const wallMs = Date.now() - t0;

    let valStr = '';
    let csvVal = `,,${COUNTS.map(() => '').join(',')}`;
    if (gen % VAL_EVERY === 0 || gen === GENERATIONS - 1) {
      const v = validate(theta);
      // Per-count win rate vs that count's fair share (1/n). avgEdge selects the
      // champion (lift everything); minEdge is watched as the regression guard.
      const perCountStr = v.perCount
        .map(r => `${r.numSeats}p:${(r.nnWinRate * 100).toFixed(0)}/${(r.fairShare * 100).toFixed(0)}`)
        .join(' ');
      valStr =
        ` | avgEdge=${(v.avgEdge * 100).toFixed(1)}% minEdge=${(v.minEdge * 100).toFixed(1)}% [${perCountStr}]`;
      const wr = v.perCount.map(r => r.nnWinRate.toFixed(4)).join(',');
      csvVal = `${v.avgEdge.toFixed(4)},${v.minEdge.toFixed(4)},${wr}`;
      // Champion = best average edge across table sizes (the generalist metric).
      if (v.avgEdge > bestValScore) {
        bestValScore = v.avgEdge;
        saveNet(path.join(OUT_DIR, 'champion.json'), theta);
        valStr += ' ⭐ new champion';
      }
      saveNet(path.join(OUT_DIR, 'latest.json'), theta);
    }

    console.log(
      `gen ${String(gen).padStart(4)} | meanFit=${meanFit.toFixed(3)} bestFit=${bestFit.toFixed(3)} ` +
        `| ${wallMs}ms${valStr}`
    );
    fs.appendFileSync(
      csvPath,
      `${gen},${meanFit.toFixed(4)},${bestFit.toFixed(4)},${csvVal},${wallMs}\n`
    );
  }

  saveNet(path.join(OUT_DIR, 'latest.json'), theta);
  console.log(`\nDone. Champion (best avgEdge=${(bestValScore * 100).toFixed(1)}%) → ${path.join(OUT_DIR, 'champion.json')}`);
  console.log(`Evaluate it: tsx scripts/abWinRate.ts ${path.join(OUT_DIR, 'champion.json')}`);
}

main();
