import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { makeRng } from '../src/domain/rng.js';
import { hashSeed } from '../src/bots/esCore.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import { playOneGame, type SelfPlaySeat } from '../src/bots/selfPlay.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Bake-off: seat N labeled BotParams variants (all sharing the same trained
 * value net, so any outcome difference is attributable to the heuristic
 * change alone) in a 4-player table, rotating which variant occupies which
 * seat across games to cancel seat-order bias, and report win rate / wealth
 * margin per variant with 95% CIs. See v5_tuning_notes.md item 18 (Track 1).
 *
 *   tsx scripts/tournamentVariants.ts [--games 10000] [--seed 31]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const NETS_DIR = path.join(HERE, '..', 'nets');

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

const GAMES = flag('games', 10000);
const SEED = flag('seed', 31);
const NUM_SEATS = 4; // bake-off is 4-player only, per plan

const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'champion.json'), 'utf8')) as ValueNetWeights;
const baseParams = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;

interface Variant {
  name: string;
  overrides: Partial<BotParams>;
}

const VARIANTS: Variant[] = [
  { name: 'control', overrides: {} },
  { name: 'loanFix', overrides: { loanWillingness: 1 } },
  { name: 'endgameFix', overrides: { endgameDiscountStrength: 0.5 } },
  { name: 'tipDelayFix', overrides: { tipPlayDelayThreshold: 3 } }
];

interface VariantStats {
  games: number;
  wins: number;
  marginSum: number;
  marginSumSq: number;
  seatGames: number[];
  seatWins: number[];
}

function freshStats(): VariantStats {
  return {
    games: 0,
    wins: 0,
    marginSum: 0,
    marginSumSq: 0,
    seatGames: new Array(NUM_SEATS).fill(0),
    seatWins: new Array(NUM_SEATS).fill(0)
  };
}

const stats = VARIANTS.map(freshStats);

const profileRng = makeRng(hashSeed(SEED, 0xabcdef));
let stuck = 0;

for (let g = 0; g < GAMES; g++) {
  // Random seat permutation, drawn fresh each game (Fisher-Yates on
  // profileRng) -- NOT a deterministic cyclic `(v + g) % NUM_SEATS` schedule.
  // A fixed cyclic schedule locks each variant to exactly one seat within
  // each `g mod NUM_SEATS` residue class forever; if gameSeed/tickSeed (both
  // derived from g) have *any* structural correlation with that residue --
  // even a tiny one -- a variant inherits 100% of it instead of it averaging
  // out. Confirmed empirically: the cyclic version showed a reproducible
  // ~1pp "advantage" for whichever variant sat at array index 3, persisting
  // across three different --seed values, even with four byte-identical
  // control copies. A true per-game random permutation doesn't have this
  // failure mode.
  const variantForSeat = [0, 1, 2, 3];
  for (let i = variantForSeat.length - 1; i > 0; i--) {
    const j = profileRng.int(i + 1);
    [variantForSeat[i], variantForSeat[j]] = [variantForSeat[j], variantForSeat[i]];
  }
  const seats: SelfPlaySeat[] = variantForSeat.map((variantIdx, s) => ({
    playerId: `p${s}`,
    name: `Bot${s}`,
    profile: makeProductionBotProfile(profileRng, net, { ...baseParams, ...VARIANTS[variantIdx].overrides })
  }));

  const res = playOneGame({
    catalog,
    seats,
    gameSeed: SEED + g,
    tickSeed: hashSeed(SEED, g + 1)
  });
  if (!res.finished || res.stuck) {
    stuck++;
    continue;
  }

  for (let s = 0; s < NUM_SEATS; s++) {
    const variantIdx = variantForSeat[s];
    const st = stats[variantIdx];
    const playerId = seats[s].playerId;
    const entry = res.breakdown.find(b => b.playerId === playerId)!;
    const opp = res.breakdown.filter(b => b.playerId !== playerId);
    const oppMean = opp.reduce((a, b) => a + b.total, 0) / Math.max(1, opp.length);
    const margin = entry.total - oppMean;

    st.games++;
    st.seatGames[s]++;
    st.marginSum += margin;
    st.marginSumSq += margin * margin;
    if (res.winnerPlayerIds.includes(playerId)) {
      st.wins++;
      st.seatWins[s]++;
    }
  }
}

const fairShare = 1 / NUM_SEATS;
const f1 = (x: number) => x.toFixed(3);
const fp = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`Variant bake-off — ${GAMES} games, ${NUM_SEATS}p, seed ${SEED} (stuck: ${stuck})\n`);
console.log('variant       n      winRate         95% CI        edge vs fair   meanMargin     95% CI');
for (let v = 0; v < VARIANTS.length; v++) {
  const st = stats[v];
  const n = Math.max(1, st.games);
  const winRate = st.wins / n;
  const winSe = Math.sqrt((winRate * (1 - winRate)) / n);
  const meanMargin = st.marginSum / n;
  const varM = st.marginSumSq / n - meanMargin * meanMargin;
  const marginSe = Math.sqrt(Math.max(0, varM) / Math.max(1, n - 1));
  console.log(
    `${VARIANTS[v].name.padEnd(12)} ${String(st.games).padStart(5)}  ${fp(winRate).padStart(6)}  ` +
      `[${fp(Math.max(0, winRate - 1.96 * winSe))}, ${fp(Math.min(1, winRate + 1.96 * winSe))}]  ` +
      `${fp(winRate - fairShare).padStart(8)}    ` +
      `${f1(meanMargin).padStart(6)}  [${f1(meanMargin - 1.96 * marginSe)}, ${f1(meanMargin + 1.96 * marginSe)}]`
  );
  const seatRates = st.seatWins.map((w, s) => (st.seatGames[s] > 0 ? w / st.seatGames[s] : 0));
  console.log(`             per-seat win rate: ${seatRates.map(fp).join(', ')}`);
}
