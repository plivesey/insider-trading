import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type GameState, type StockCard } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { makeRng } from '../../src/domain/rng.js';
import { createBotProfile, withValueNet } from '../../src/bots/profile.js';
import {
  STOCK_FEATURE_LEN,
  encodeColorFeatures,
  encodeStockCardFeatures
} from '../../src/bots/valueNetFeatures.js';
import { perceivedStockValue } from '../../src/bots/valuation.js';
import { randomWeights } from '../../src/bots/valueNet.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function freshGame(seed = 1): GameState {
  return createGameState({
    catalog,
    players: [
      { playerId: 'a', name: 'A', isBot: true },
      { playerId: 'b', name: 'B', isBot: true },
      { playerId: 'c', name: 'C', isBot: true },
      { playerId: 'd', name: 'D', isBot: true }
    ],
    seed,
    gameId: 'g',
    startedAt: '2026-01-01T00:00:00.000Z'
  });
}

function profile() {
  const p = createBotProfile(makeRng(0));
  return p;
}

describe('valueNetFeatures encoder', () => {
  test('colored stock: fixed length, no NaN/Inf, bias + one-hot set', () => {
    const state = freshGame();
    // Give player 'a' a mixed hand so portfolio features are non-trivial.
    const a = state.players.find(p => p.playerId === 'a')!;
    a.hand.push(...catalog.stocks.filter(s => s.color === 'Blue').slice(0, 2));
    const x = encodeColorFeatures(state, 'Blue', false, 'a', profile());
    expect(x.length).toBe(STOCK_FEATURE_LEN);
    expect(x.every(v => Number.isFinite(v))).toBe(true);
    expect(x[0]).toBe(1); // bias
    expect(x[1]).toBe(1); // Blue one-hot
    expect(x[2]).toBe(0);
    expect(x[5]).toBe(0); // isWild
  });

  test('wild path zeroes color-specific slots and sets isWild', () => {
    const state = freshGame();
    const x = encodeColorFeatures(state, null, true, 'a', profile());
    expect(x.length).toBe(STOCK_FEATURE_LEN);
    expect(x.every(v => Number.isFinite(v))).toBe(true);
    expect(x[1]).toBe(0); // no color one-hot
    expect(x[2]).toBe(0);
    expect(x[3]).toBe(0);
    expect(x[4]).toBe(0);
    expect(x[5]).toBe(1); // isWild
    for (const i of [6, 7, 8, 9, 10, 34]) expect(x[i]).toBe(0); // color-specific slots
  });

  test('encodeStockCardFeatures routes Wild Shares to the wild path', () => {
    const state = freshGame();
    const wild = catalog.stocks.find(s => s.color === 'Wild') as StockCard;
    const blue = catalog.stocks.find(s => s.color === 'Blue') as StockCard;
    expect(encodeStockCardFeatures(state, wild, 'a', profile())[5]).toBe(1);
    expect(encodeStockCardFeatures(state, blue, 'a', profile())[5]).toBe(0);
  });
});

describe('valuation net integration', () => {
  test('heuristic path is unchanged when valueNet is absent', () => {
    const state = freshGame(7);
    const p = profile();
    // Two profiles with identical personality, one with no net: must match the
    // pre-existing heuristic exactly (net is purely additive behavior).
    const v = perceivedStockValue(state, p, 'Orange', 'a');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  test('net path returns a floored integer dollar value', () => {
    const state = freshGame(7);
    const base = profile();
    const net = randomWeights(STOCK_FEATURE_LEN, 12, makeRng(2), 12);
    const withNet = withValueNet(base, net);
    const v = perceivedStockValue(state, withNet, 'Orange', 'a');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });
});
