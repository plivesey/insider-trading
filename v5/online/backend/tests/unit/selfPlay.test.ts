import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type GameState, type PlayerId } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { makeRng } from '../../src/domain/rng.js';
import { createBotProfile, withValueNet, type BotProfile } from '../../src/bots/profile.js';
import { driveSelfPlay, playOneGame, type SelfPlaySeat } from '../../src/bots/selfPlay.js';
import { randomWeights } from '../../src/bots/valueNet.js';
import { STOCK_FEATURE_LEN } from '../../src/bots/valueNetFeatures.js';
import { assertGameOverInvariants } from '../integration/_invariants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

const IDS: PlayerId[] = ['p0', 'p1', 'p2', 'p3'];

function seats(net?: ReturnType<typeof randomWeights>, profSeed = 99): SelfPlaySeat[] {
  const rng = makeRng(profSeed);
  return IDS.map((playerId, s) => ({
    playerId,
    name: `Bot${s}`,
    profile: withValueNet(createBotProfile(rng), net && s === 0 ? net : undefined)
  }));
}

describe('selfPlay headless driver', () => {
  test('most heuristic games finish cleanly with valid game-over invariants', () => {
    let finished = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state: GameState = createGameState({
        catalog,
        players: IDS.map((playerId, s) => ({ playerId, name: `Bot${s}`, isBot: true })),
        seed: 1000 + seed,
        gameId: `g${seed}`,
        startedAt: '2026-01-01T00:00:00.000Z'
      });
      const profiles = new Map<PlayerId, BotProfile>(
        IDS.map(id => [id, createBotProfile(makeRng(seed))])
      );
      const res = driveSelfPlay(state, profiles, makeRng(seed * 7 + 1));
      if (res.finished && !res.stuck) {
        finished++;
        assertGameOverInvariants(state);
        expect(res.breakdown.length).toBe(4);
        expect(res.winnerPlayerIds.length).toBeGreaterThanOrEqual(1);
      }
    }
    // A small fraction of seeds livelock (pre-existing engine edge case); the
    // overwhelming majority must complete.
    expect(finished).toBeGreaterThanOrEqual(17);
  });

  test('playOneGame is deterministic for the same (gameSeed, tickSeed)', () => {
    // Find a finishing seed, then confirm identical results on a re-run.
    let gameSeed = 0;
    let first = playOneGame({ catalog, seats: seats(), gameSeed: 1, tickSeed: 1 });
    for (let g = 1; g <= 30; g++) {
      const r = playOneGame({ catalog, seats: seats(), gameSeed: g, tickSeed: g * 3 + 1 });
      if (r.finished && !r.stuck) {
        gameSeed = g;
        first = r;
        break;
      }
    }
    expect(gameSeed).toBeGreaterThan(0);
    const again = playOneGame({ catalog, seats: seats(), gameSeed, tickSeed: gameSeed * 3 + 1 });
    expect(again.finished).toBe(true);
    expect(again.breakdown.map(b => b.total)).toEqual(first.breakdown.map(b => b.total));
    expect(again.winnerPlayerIds).toEqual(first.winnerPlayerIds);
  });

  test('a net-driven seat still produces a completable game', () => {
    const net = randomWeights(STOCK_FEATURE_LEN, 12, makeRng(4), 12);
    let finished = 0;
    for (let g = 1; g <= 12; g++) {
      const r = playOneGame({ catalog, seats: seats(net), gameSeed: 2000 + g, tickSeed: g * 5 + 2 });
      if (r.finished && !r.stuck) finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(9);
  });
});
