import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type CardCatalog, type PlayerId } from '@insider-trading/shared';
import { makeRng } from '../src/domain/rng.js';
import { esStep, hashSeed } from '../src/bots/esCore.js';
import {
  PARAM_DIM,
  decodeParams,
  defaultBotParams,
  defaultVector,
  encodeParams,
  makeBotProfile,
  type BotParams
} from '../src/bots/botParams.js';
import { playOneGame } from '../src/bots/selfPlay.js';
import { evalAcrossCountsBuilders, type ProfileBuilder } from '../src/bots/evaluate.js';
import { STOCK_FEATURE_LEN } from '../src/bots/valueNet.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Optimize the bot's hand-coded constants (BotParams) with Evolution Strategies,
 * holding the trained stock-valuation net fixed. Candidate = net + tuned params;
 * baseline field = net + default params (or, with --vsPool, a fixed pool of real
 * opponents -- see below). Same machinery as trainStockValueNet.ts (placement
 * fitness, CRN, seat rotation, per-count validation) — only the thing being
 * perturbed differs (a ~29-dim constant vector vs net weights).
 *
 *   tsx scripts/trainBotParams.ts [--gen 200] [--pop 32] [--games 16]
 *       [--sigma 0.15] [--lr 0.05] [--minSeats 2] [--maxSeats 5]
 *       [--valEvery 10] [--valGamesPerCount 120] [--seed 1]
 *       [--net nets/champion.json] [--resume bot_params.json] [--out ./nets]
 *       [--vsPool defaults,nets/bot_params_bot1.json,nets/bot_params_bot3.json]
 *
 * --vsPool (optional): comma-separated list of opponents to train/validate
 * against, each either the literal "defaults" or a path to a saved
 * bot_params.json. Without it, behavior is unchanged (single DEFAULTS field --
 * the original mode). WITH it:
 *   - each training game's field seat is a round-robin pick from the pool
 *     (same per-game game budget as before -- just diversifying who fills the
 *     non-candidate seats instead of always DEFAULTS).
 *   - validation/promotion scores EVERY pool member separately and gates on
 *     the WORST member's avgEdge, not an average across the pool -- the same
 *     "worst edge, not average" rule evalSubjectVsPool/validateVsPool.ts
 *     already use, because an average can hide a candidate that's badly
 *     exploitable by one specific opponent (see v5_tuning_notes.md item 18).
 * This directly targets the failure mode a fixed-DEFAULTS-only run can fall
 * into: a candidate that scores well by specializing against DEFAULTS'
 * specific weaknesses without being a stronger player against real opponents.
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

const GENERATIONS = flag('gen', 200);
const POP_PAIRS = flag('pop', 32);
const GAMES = flag('games', 16);
const SIGMA = flag('sigma', 0.15); // larger than the net's: ~29 well-scaled dims
const LR = flag('lr', 0.05);
const MIN_SEATS = flag('minSeats', 2);
const MAX_SEATS = flag('maxSeats', 5);
const COUNTS: number[] = [];
for (let n = MIN_SEATS; n <= MAX_SEATS; n++) COUNTS.push(n);
const VAL_EVERY = flag('valEvery', 10);
const VAL_GAMES_PER_COUNT = flag('valGamesPerCount', 120);
const SEED = flag('seed', 1);
const OUT_DIR = strFlag('out', path.join(HERE, '..', 'nets'));
const NET_PATH = strFlag('net', path.join(HERE, '..', 'nets', 'champion.json'));
const RESUME = strFlag('resume', '');
const VS_POOL = strFlag('vsPool', '');
const VAL_SEED_BASE = 200_000_033;

const DEFAULTS = defaultBotParams();

// A saved BotParams file can predate a param added since it was written; merge
// onto defaults first so encodeParams/decodeParams never see a missing field
// (see the encodeParams doc comment in botParams.ts -- this bit a training run
// once already).
function loadParamsFile(spec: string): BotParams {
  if (spec === 'defaults') return DEFAULTS;
  const raw = JSON.parse(fs.readFileSync(spec, 'utf8')) as Partial<BotParams>;
  return { ...DEFAULTS, ...raw };
}

const POOL: BotParams[] = VS_POOL
  ? VS_POOL.split(',').map(s => loadParamsFile(s.trim()))
  : [DEFAULTS];

function loadNet(): ValueNetWeights {
  const net = JSON.parse(fs.readFileSync(NET_PATH, 'utf8')) as ValueNetWeights;
  if (net.inputDim !== STOCK_FEATURE_LEN) {
    throw new Error(`net inputDim ${net.inputDim} != STOCK_FEATURE_LEN ${STOCK_FEATURE_LEN}`);
  }
  return net;
}

const ids: PlayerId[] = [];
for (let s = 0; s < MAX_SEATS; s++) ids.push(`p${s}`);

interface GenGames {
  gameSeeds: number[];
  tickSeeds: number[];
  seatCounts: number[];
  candSeats: number[];
  poolIdx: number[]; // which POOL member fills the non-candidate seats this game
}

function buildGenGames(gen: number): GenGames {
  const base = hashSeed(SEED, gen + 1);
  const gameSeeds: number[] = [];
  const tickSeeds: number[] = [];
  const seatCounts: number[] = [];
  const candSeats: number[] = [];
  const poolIdx: number[] = [];
  for (let k = 0; k < GAMES; k++) {
    const n = COUNTS[k % COUNTS.length];
    gameSeeds.push(base + k);
    tickSeeds.push(hashSeed(base, k + 1));
    seatCounts.push(n);
    candSeats.push(k % n);
    // Round-robin (not randomized) so every generation gives each pool member
    // an even share of the fixed GAMES budget -- no extra games/cost vs the
    // single-DEFAULTS mode, just who fills the other seats.
    poolIdx.push(k % POOL.length);
  }
  return { gameSeeds, tickSeeds, seatCounts, candSeats, poolIdx };
}

/**
 * Placement fitness of one candidate param set: net + candidate params in a
 * rotating seat against net + default params elsewhere, scored by fraction of
 * opponents finished above (centered to [-0.5, 0.5]), averaged over the games.
 */
function evalCandidateParams(
  catalog: CardCatalog,
  net: ValueNetWeights,
  params: BotParams,
  gg: GenGames
): number {
  let sum = 0;
  let counted = 0;
  for (let k = 0; k < GAMES; k++) {
    const candSeat = gg.candSeats[k];
    const n = gg.seatCounts[k];
    const fieldParams = POOL[gg.poolIdx[k]];
    const seats = [];
    for (let s = 0; s < n; s++) {
      seats.push({
        playerId: ids[s],
        name: `Bot${s}`,
        profile: makeBotProfile(s === candSeat ? params : fieldParams, net)
      });
    }
    const res = playOneGame({ catalog, seats, gameSeed: gg.gameSeeds[k], tickSeed: gg.tickSeeds[k] });
    if (!res.finished || res.stuck) continue;
    counted++;
    const candId = ids[candSeat];
    const cand = res.breakdown.find(b => b.playerId === candId)!;
    const opp = res.breakdown.filter(b => b.playerId !== candId);
    let beaten = 0;
    for (const o of opp) {
      if (cand.total > o.total) beaten += 1;
      else if (cand.total === o.total) beaten += 0.5;
    }
    sum += beaten / Math.max(1, opp.length) - 0.5;
  }
  return counted > 0 ? sum / counted : -1;
}

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const csvPath = path.join(OUT_DIR, 'bot_params_log.csv');
  const wrCols = COUNTS.map(n => `wr${n}p`).join(',');
  fs.writeFileSync(csvPath, `gen,meanFit,bestFit,avgEdge,minEdge,${wrCols},wallMs\n`);

  const catalog = loadCards(CARDS_DIR);
  const net = loadNet();
  let theta = RESUME
    ? encodeParams(JSON.parse(fs.readFileSync(RESUME, 'utf8')) as BotParams)
    : defaultVector();
  const noiseRng = makeRng(hashSeed(SEED, 0x5151));

  // With one pool member (the original, default mode) worstMemberEdge ==
  // avgEdge, so the single-opponent behavior/promotion criterion is unchanged.
  const validate = (t: Float64Array) => {
    const params = decodeParams(t);
    const subject: ProfileBuilder = () => makeBotProfile(params, net);
    const perMember = POOL.map(p =>
      evalAcrossCountsBuilders({
        catalog,
        subject,
        field: () => makeBotProfile(p, net),
        counts: COUNTS,
        gamesPerCount: VAL_GAMES_PER_COUNT,
        baseSeed: VAL_SEED_BASE
      })
    );
    const avgEdge = perMember.reduce((a, m) => a + m.avgEdge, 0) / perMember.length;
    const minEdge = Math.min(...perMember.map(m => m.minEdge));
    const worstMemberEdge = Math.min(...perMember.map(m => m.avgEdge));
    return { avgEdge, minEdge, worstMemberEdge, perMember };
  };

  // Champion bar starts at the default config (theta decodes to defaults at gen 0
  // unless resuming), so only a genuine improvement is saved. Gated on
  // worstMemberEdge, not avgEdge, so a candidate can't look good purely by
  // averaging a strong matchup against one pool member with a weak one against
  // another (see the worst-edge rationale in evalSubjectVsPool).
  const startVal = validate(theta);
  let bestValScore = startVal.worstMemberEdge;
  console.log(
    `ES bot-params: dim=${PARAM_DIM}, pop=${2 * POP_PAIRS}, games/eval=${GAMES}, ` +
      `seats=[${COUNTS.join(',')}], gen=${GENERATIONS}, pool=${POOL.length}, ` +
      `start worstMemberEdge=${(bestValScore * 100).toFixed(1)}% (avgEdge=${(startVal.avgEdge * 100).toFixed(1)}%)`
  );
  saveParams(path.join(OUT_DIR, 'bot_params.json'), theta);

  for (let gen = 0; gen < GENERATIONS; gen++) {
    const t0 = Date.now();
    const gg = buildGenGames(gen);

    const { fits } = esStep(
      theta,
      cand => evalCandidateParams(catalog, net, decodeParams(cand), gg),
      { popPairs: POP_PAIRS, sigma: SIGMA, lr: LR, noiseRng }
    );

    const meanFit = fits.reduce((a, b) => a + b, 0) / fits.length;
    const bestFit = Math.max(...fits);
    const wallMs = Date.now() - t0;

    let valStr = '';
    let csvVal = `,,${COUNTS.map(() => '').join(',')}`;
    if (gen % VAL_EVERY === 0 || gen === GENERATIONS - 1) {
      const v = validate(theta);
      const perMemberStr = v.perMember.map((m, i) => `member${i}:${(m.avgEdge * 100).toFixed(1)}%`).join(' ');
      // perCount breakdown shown against pool member 0 only (kept for the CSV's
      // win-rate columns / familiar single-opponent read); perMemberStr above
      // is the real multi-opponent picture when POOL.length > 1.
      const perCountStr = v.perMember[0].perCount
        .map(r => `${r.numSeats}p:${(r.nnWinRate * 100).toFixed(0)}/${(r.fairShare * 100).toFixed(0)}`)
        .join(' ');
      valStr =
        ` | avgEdge=${(v.avgEdge * 100).toFixed(1)}% worstMemberEdge=${(v.worstMemberEdge * 100).toFixed(1)}%` +
        ` minEdge=${(v.minEdge * 100).toFixed(1)}% [${perCountStr}]` +
        (POOL.length > 1 ? ` {${perMemberStr}}` : '');
      const wr = v.perMember[0].perCount.map(r => r.nnWinRate.toFixed(4)).join(',');
      csvVal = `${v.avgEdge.toFixed(4)},${v.minEdge.toFixed(4)},${wr}`;
      if (v.worstMemberEdge > bestValScore) {
        bestValScore = v.worstMemberEdge;
        saveParams(path.join(OUT_DIR, 'bot_params.json'), theta);
        valStr += ' ⭐ new champion';
      }
      saveParams(path.join(OUT_DIR, 'bot_params_latest.json'), theta);
    }

    console.log(
      `gen ${String(gen).padStart(4)} | meanFit=${meanFit.toFixed(4)} bestFit=${bestFit.toFixed(4)} | ${wallMs}ms${valStr}`
    );
    fs.appendFileSync(csvPath, `${gen},${meanFit.toFixed(4)},${bestFit.toFixed(4)},${csvVal},${wallMs}\n`);
  }

  console.log(
    `\nDone. Best params (worstMemberEdge=${(bestValScore * 100).toFixed(1)}%) → ${path.join(OUT_DIR, 'bot_params.json')}`
  );
}

function saveParams(file: string, theta: Float64Array): void {
  fs.writeFileSync(file, JSON.stringify(decodeParams(theta), null, 2));
}

main();
