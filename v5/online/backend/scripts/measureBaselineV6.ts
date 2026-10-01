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
 * One-off baseline table (Mean/P10/P50/P90/P95/Min/Max), matching the format
 * used in v5_game_length_log.md, for the Phase 3 pre-rule-change baseline
 * measurement (see v6_game_length_log.md / the V6 plan). Unlike
 * measureGameLength.ts (which sweeps rule-config variants), this just runs the
 * current default rules + production bots once per player count.
 *
 *   tsx scripts/measureBaselineV6.ts [--games 100000] [--counts 2,3,4,5,6] [--seed 31]
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

const GAMES = flag('games', 100000);
const SEED = flag('seed', 31);
const COUNTS = strFlag('counts', '2,3,4,5,6')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(n => n >= 2 && n <= 6);

const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'champion.json'), 'utf8')) as ValueNetWeights;
const params = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

console.log(`Baseline game-length table — production bots, ${GAMES} games/count, counts [${COUNTS.join(',')}]\n`);
console.log('| Players | Games | Mean | P10 | P50 (Median) | P90 | P95 | Min | Max |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

for (const numSeats of COUNTS) {
  const personaRng = makeRng(hashSeed(SEED, numSeats * 7919));
  const ids = Array.from({ length: numSeats }, (_, s) => `p${s}`);
  const turns: number[] = [];
  let stuck = 0;
  for (let g = 0; g < GAMES; g++) {
    const seats: SelfPlaySeat[] = ids.map(playerId => ({
      playerId,
      name: playerId,
      profile: makeProductionBotProfile(personaRng, net, params)
    }));
    const res = playOneGame({
      catalog,
      seats,
      gameSeed: SEED + g,
      tickSeed: hashSeed(SEED, g + 1),
      rules: {}
    });
    if (!res.finished || res.stuck) {
      stuck++;
      continue;
    }
    turns.push(res.turnNumber);
  }
  turns.sort((a, b) => a - b);
  const n = turns.length;
  const mean = turns.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const row = [
    numSeats,
    n + (stuck > 0 ? ` (${stuck} stuck)` : ''),
    mean.toFixed(1),
    pctile(turns, 0.1),
    pctile(turns, 0.5),
    pctile(turns, 0.9),
    pctile(turns, 0.95),
    turns[0] ?? 'n/a',
    turns[n - 1] ?? 'n/a'
  ];
  console.log(`| ${row.join(' | ')} |`);
}
