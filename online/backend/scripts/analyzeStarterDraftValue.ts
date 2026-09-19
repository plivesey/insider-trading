import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BonusCard,
  GameLogEntry,
  GameState,
  GoalCard,
  HandCard,
  PlayerId
} from '@insider-trading/shared';
import { loadCards } from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng, type Rng } from '../src/domain/rng.js';
import { advance } from '../src/engine/advance.js';
import { createBotProfile, type BotProfile } from '../src/bots/profile.js';
import { decideBotAction } from '../src/bots/decide.js';
import { executeBotActionDirect } from '../src/bots/selfPlay.js';

/**
 * Statistical value of each starter-draft card: run many all-bot games,
 * snapshot every player's final 3-card drafted starting hand the instant the
 * setup draft completes, then correlate "held this card at setup" with final
 * placement. Correlational, not causal (a hand is 3 cards at once, and bot
 * play itself has noise) -- but with thousands of samples per card it's a
 * solid signal for relative value.
 *
 * usage: tsx scripts/analyzeStarterDraftValue.ts [--gamesPerCount 2000] [--seed 900001]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const OUT_DIR = path.join(HERE, 'output');

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

const GAMES_PER_COUNT = flag('gamesPerCount', 2000);
const BASE_SEED = flag('seed', 900001);
const PLAYER_COUNTS = [2, 3, 4, 5, 6];
const MAX_TICKS = 20000;

const catalog = loadCards(CARDS_DIR);

// ---- card identity -----------------------------------------------------------

type Bucket =
  | 'Basic Starter Stock'
  | 'Starter Action Card'
  | 'Hidden Bonus Card'
  | 'Insider Tip Card'
  | 'Goal Card (drafted as private)';

function cardIdentity(c: HandCard): { bucket: Bucket; key: string } | null {
  switch (c.category) {
    case 'stock':
      return { bucket: 'Basic Starter Stock', key: `Starter Stock: ${c.color}` };
    case 'action':
      return { bucket: 'Starter Action Card', key: c.name };
    case 'bonus':
      return { bucket: 'Hidden Bonus Card', key: (c as BonusCard).name };
    case 'insider_tip':
      return { bucket: 'Insider Tip Card', key: c.text };
    case 'goal': {
      // `title` flows through from cards/goal_cards.json at load time but
      // isn't declared on the GoalCard TS interface.
      const title = (c as GoalCard & { title?: string }).title;
      return { bucket: 'Goal Card (drafted as private)', key: title ?? c.goal.text };
    }
    default:
      return null; // stock/action cards with abilities never enter the draft pool
  }
}

// ---- per-tick driver with a starting-hand snapshot hook -----------------------

interface StartingHands {
  [playerId: string]: HandCard[];
}

function driveAndSnapshot(
  state: GameState,
  profiles: Map<PlayerId, BotProfile>,
  rng: Rng
): { finished: boolean; stuck: boolean; startingHands: StartingHands | null } {
  let ticks = 0;
  let stuck = false;
  let startingHands: StartingHands | null = null;
  try {
    advance(state, []);
    while (!state.gameOver && ticks < MAX_TICKS) {
      ticks++;
      let acted = false;
      for (const player of state.players) {
        const profile = profiles.get(player.playerId);
        if (!profile) continue;
        const action = decideBotAction(state, player.playerId, profile, { rng });
        if (!action) continue;
        const events: GameLogEntry[] = [];
        const ok = executeBotActionDirect(state, player.playerId, action, events);
        if (!ok) {
          stuck = true;
          break;
        }
        acted = true;
        break;
      }
      if (stuck) break;
      if (!acted) {
        stuck = true;
        break;
      }
      if (!startingHands && state.turnPhase !== 'setup_draft') {
        startingHands = {};
        for (const p of state.players) startingHands[p.playerId] = p.hand.map(c => ({ ...c }));
      }
    }
  } catch {
    stuck = true;
  }
  if (ticks >= MAX_TICKS && !state.gameOver) stuck = true;
  return { finished: !!state.gameOver, stuck, startingHands };
}

// ---- aggregation ---------------------------------------------------------------

interface Agg {
  bucket: Bucket;
  key: string;
  samples: number;
  wins: number;
  percentileSum: number;
  marginSum: number;
}

const agg = new Map<string, Agg>();

function record(bucket: Bucket, key: string, percentile: number, won: boolean, margin: number) {
  const mapKey = `${bucket}::${key}`;
  let a = agg.get(mapKey);
  if (!a) {
    a = { bucket, key, samples: 0, wins: 0, percentileSum: 0, marginSum: 0 };
    agg.set(mapKey, a);
  }
  a.samples++;
  if (won) a.wins++;
  a.percentileSum += percentile;
  a.marginSum += margin;
}

// ---- run -------------------------------------------------------------------

let completed = 0;
let skipped = 0;
const t0 = Date.now();

for (const n of PLAYER_COUNTS) {
  for (let g = 0; g < GAMES_PER_COUNT; g++) {
    const gameSeed = BASE_SEED + n * 1_000_000 + g;
    const tickSeed = BASE_SEED + n * 2_000_003 + g * 7 + 13;
    const profileSeed = BASE_SEED + n * 3_000_017 + g * 11 + 29;

    const players = Array.from({ length: n }, (_, i) => ({
      playerId: `p${i}`,
      name: `Bot${i}`,
      isBot: true
    }));
    const state = createGameState({
      catalog,
      players,
      seed: gameSeed,
      gameId: `draft-value-${n}p-${g}`,
      startedAt: '2026-01-01T00:00:00.000Z'
    });
    const profileRng = makeRng(profileSeed);
    const profiles = new Map<PlayerId, BotProfile>();
    for (const p of players) profiles.set(p.playerId, createBotProfile(profileRng));
    const tickRng = makeRng(tickSeed);

    const result = driveAndSnapshot(state, profiles, tickRng);
    if (!result.finished || result.stuck || !result.startingHands || !state.gameOver) {
      skipped++;
      continue;
    }
    completed++;

    const breakdown = state.gameOver.breakdown;
    const winnerTotal = Math.max(...breakdown.map(b => b.total));
    // Standard competition ranking (1,1,3,...): place = 1 + count of players
    // strictly ahead of you.
    const withPlace = breakdown.map(b => ({
      ...b,
      place: 1 + breakdown.filter(o => o.total > b.total).length
    }));

    for (const entry of withPlace) {
      const N = withPlace.length;
      const percentile = N > 1 ? (N - entry.place) / (N - 1) : 1;
      const won = state.gameOver.winnerPlayerIds.includes(entry.playerId);
      const margin = entry.total - winnerTotal;
      const hand = result.startingHands[entry.playerId] ?? [];
      for (const c of hand) {
        const id = cardIdentity(c);
        if (!id) continue;
        record(id.bucket, id.key, percentile, won, margin);
      }
    }
  }
  console.log(`  ${n}p: ${GAMES_PER_COUNT} games done (running total: ${completed} completed, ${skipped} skipped)`);
}

const elapsedMs = Date.now() - t0;

// ---- report ------------------------------------------------------------------

interface ReportRow {
  bucket: Bucket;
  card: string;
  samples: number;
  winRate: number;
  avgPercentile: number;
  approxPlaceAt4: number;
  avgMargin: number;
}

const rows: ReportRow[] = [...agg.values()]
  .map(a => ({
    bucket: a.bucket,
    card: a.key,
    samples: a.samples,
    winRate: a.wins / a.samples,
    avgPercentile: a.percentileSum / a.samples,
    approxPlaceAt4: 1 + (1 - a.percentileSum / a.samples) * 3,
    avgMargin: a.marginSum / a.samples
  }))
  .sort((x, y) => y.avgPercentile - x.avgPercentile);

console.log(`\n${'='.repeat(90)}`);
console.log(
  `Starter-draft card value: ${completed} games completed (${skipped} skipped), ` +
    `${GAMES_PER_COUNT}/count over players=[${PLAYER_COUNTS.join(',')}], ` +
    `baseSeed=${BASE_SEED}, elapsed=${(elapsedMs / 1000).toFixed(1)}s`
);
console.log('='.repeat(90));

const BUCKET_ORDER: Bucket[] = [
  'Basic Starter Stock',
  'Starter Action Card',
  'Hidden Bonus Card',
  'Insider Tip Card',
  'Goal Card (drafted as private)'
];
for (const bucket of BUCKET_ORDER) {
  const bucketRows = rows.filter(r => r.bucket === bucket).sort((a, b) => b.avgPercentile - a.avgPercentile);
  if (bucketRows.length === 0) continue;
  console.log(`\n-- ${bucket} --`);
  for (const r of bucketRows) {
    console.log(
      `  ${r.card.padEnd(34)} n=${String(r.samples).padStart(5)}  ` +
        `win%=${(r.winRate * 100).toFixed(1).padStart(5)}  ` +
        `avgPct=${r.avgPercentile.toFixed(3)}  ` +
        `place@4p≈${r.approxPlaceAt4.toFixed(2)}  ` +
        `avgMargin=${r.avgMargin >= 0 ? '+' : ''}${r.avgMargin.toFixed(2)}`
    );
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'starterDraftValue.json');
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      meta: {
        gamesPerCount: GAMES_PER_COUNT,
        playerCounts: PLAYER_COUNTS,
        baseSeed: BASE_SEED,
        seedScheme: {
          gameSeed: 'BASE_SEED + n*1_000_000 + g',
          tickSeed: 'BASE_SEED + n*2_000_003 + g*7 + 13',
          profileSeed: 'BASE_SEED + n*3_000_017 + g*11 + 29'
        },
        totalGamesAttempted: PLAYER_COUNTS.length * GAMES_PER_COUNT,
        completed,
        skipped,
        elapsedMs
      },
      rows
    },
    null,
    2
  )
);
console.log(`\nWrote ${outPath}`);
