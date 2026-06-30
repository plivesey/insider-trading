import type { CardCatalog, PlayerId } from '@insider-trading/shared';
import { makeRng, type Rng } from '../domain/rng.js';
import { createBotProfile, withValueNet, type BotProfile } from './profile.js';
import { playOneGame } from './selfPlay.js';
import { hashSeed } from './esCore.js';
import type { ValueNetWeights } from './valueNet.js';

/**
 * Shared evaluation harness: pit a "subject" bot against a "field" of opponent
 * bots and report how the subject does. The subject occupies a rotating seat
 * each game (seat = game % numSeats) so seat order can't bias the result.
 *
 * Both the subject and the field are produced by builders, so this serves every
 * matchup we need: net-bot vs heuristic (net training/validation) and
 * tuned-params-bot vs default-params-bot (constant optimization). Used by the
 * in-training validators and the standalone A/B harness, so the "is it working?"
 * metric is computed exactly one way.
 */

/** Builds a fresh per-game profile. `rng` lets the heuristic field draw varied personalities. */
export type ProfileBuilder = (rng: Rng) => BotProfile;

export interface EvalResult {
  games: number;
  numSeats: number;
  counted: number; // games that finished cleanly (stuck/unfinished excluded)
  stuck: number;
  nnWins: number; // subject wins
  nnWinRate: number; // subject win rate
  nnWinRateCi95: [number, number];
  fairShare: number; // 1 / numSeats — break-even win rate
  meanMargin: number; // mean(subjectTotal − mean(opponentTotals))
  marginCi95: [number, number];
  perSeatWinRate: number[]; // subject win rate per seat
}

export function evalSubjectVsField(opts: {
  catalog: CardCatalog;
  subject: ProfileBuilder;
  field: ProfileBuilder;
  games: number;
  numSeats?: number;
  baseSeed?: number;
}): EvalResult {
  const numSeats = opts.numSeats ?? 4;
  const baseSeed = opts.baseSeed ?? 1;
  // Deterministic personalities for the field opponents (and any subject randomness).
  const profileRng = makeRng(hashSeed(baseSeed, 0xabcdef));

  const ids: PlayerId[] = [];
  for (let s = 0; s < numSeats; s++) ids.push(`p${s}`);

  let counted = 0;
  let stuck = 0;
  let subjWins = 0;
  const margins: number[] = [];
  const seatWins = new Array<number>(numSeats).fill(0);
  const seatCounts = new Array<number>(numSeats).fill(0);

  for (let g = 0; g < opts.games; g++) {
    const subjSeat = g % numSeats;
    const seats = ids.map((playerId, s) => ({
      playerId,
      name: `Bot${s}`,
      profile: (s === subjSeat ? opts.subject : opts.field)(profileRng)
    }));
    const res = playOneGame({
      catalog: opts.catalog,
      seats,
      gameSeed: baseSeed + g,
      tickSeed: hashSeed(baseSeed, g + 1)
    });
    if (!res.finished || res.stuck) {
      stuck++;
      continue;
    }
    counted++;
    seatCounts[subjSeat]++;
    const subjId = ids[subjSeat];
    const subjEntry = res.breakdown.find(b => b.playerId === subjId)!;
    const opp = res.breakdown.filter(b => b.playerId !== subjId);
    const oppMean = opp.reduce((a, b) => a + b.total, 0) / Math.max(1, opp.length);
    margins.push(subjEntry.total - oppMean);
    if (res.winnerPlayerIds.includes(subjId)) {
      subjWins++;
      seatWins[subjSeat]++;
    }
  }

  const n = Math.max(1, counted);
  const winRate = subjWins / n;
  const winSe = Math.sqrt((winRate * (1 - winRate)) / n);
  const meanMargin = margins.reduce((a, b) => a + b, 0) / n;
  let varM = 0;
  for (const m of margins) varM += (m - meanMargin) ** 2;
  const marginSe = Math.sqrt(varM / Math.max(1, n - 1)) / Math.sqrt(n);

  return {
    games: opts.games,
    numSeats,
    counted,
    stuck,
    nnWins: subjWins,
    nnWinRate: winRate,
    nnWinRateCi95: [winRate - 1.96 * winSe, winRate + 1.96 * winSe],
    fairShare: 1 / numSeats,
    meanMargin,
    marginCi95: [meanMargin - 1.96 * marginSe, meanMargin + 1.96 * marginSe],
    perSeatWinRate: seatWins.map((w, s) => (seatCounts[s] > 0 ? w / seatCounts[s] : 0))
  };
}

/** Net bot vs pure-heuristic field (the original NN evaluation). */
export function evalNetVsHeuristic(opts: {
  catalog: CardCatalog;
  net: ValueNetWeights;
  games: number;
  numSeats?: number;
  baseSeed?: number;
}): EvalResult {
  return evalSubjectVsField({
    catalog: opts.catalog,
    games: opts.games,
    numSeats: opts.numSeats,
    baseSeed: opts.baseSeed,
    subject: rng => withValueNet(createBotProfile(rng), opts.net),
    field: rng => createBotProfile(rng)
  });
}

export interface MultiCountEvalResult {
  perCount: EvalResult[];
  /** Mean over table sizes of (winRate − fairShare). >0 means the subject beats the field on average. */
  avgEdge: number;
  /** Worst (winRate − fairShare) across table sizes — the regression guard. */
  minEdge: number;
}

/**
 * Evaluate a subject vs field across several table sizes, so a single generalist
 * config is scored without favoring any one count. Each count uses a disjoint
 * held-out seed band.
 */
export function evalAcrossCountsBuilders(opts: {
  catalog: CardCatalog;
  subject: ProfileBuilder;
  field: ProfileBuilder;
  counts: number[];
  gamesPerCount: number;
  baseSeed: number;
}): MultiCountEvalResult {
  const perCount = opts.counts.map((numSeats, i) =>
    evalSubjectVsField({
      catalog: opts.catalog,
      subject: opts.subject,
      field: opts.field,
      games: opts.gamesPerCount,
      numSeats,
      baseSeed: opts.baseSeed + i * 1_000_003
    })
  );
  const edges = perCount.map(r => r.nnWinRate - r.fairShare);
  return {
    perCount,
    avgEdge: edges.reduce((a, b) => a + b, 0) / edges.length,
    minEdge: Math.min(...edges)
  };
}

/** Net bot vs heuristic field across table sizes (NN trainer validation / abWinRate). */
export function evalAcrossCounts(opts: {
  catalog: CardCatalog;
  net: ValueNetWeights;
  counts: number[];
  gamesPerCount: number;
  baseSeed: number;
}): MultiCountEvalResult {
  return evalAcrossCountsBuilders({
    catalog: opts.catalog,
    counts: opts.counts,
    gamesPerCount: opts.gamesPerCount,
    baseSeed: opts.baseSeed,
    subject: rng => withValueNet(createBotProfile(rng), opts.net),
    field: rng => createBotProfile(rng)
  });
}
