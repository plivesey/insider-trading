import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  MAX_LOANS,
  maxAffordableSpend,
  type GameState,
  type GameLogEntry
} from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { startAuction } from '../../src/engine/auction.js';
import { payBank } from '../../src/engine/turn.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function mkState(): GameState {
  return createGameState({
    catalog,
    players: [
      { playerId: 'p1', name: 'A' },
      { playerId: 'p2', name: 'B' }
    ],
    seed: 1,
    gameId: 'g',
    startedAt: '2026-01-01T00:00:00.000Z'
  });
}

describe('loan cap (max 3 loans)', () => {
  test('maxAffordableSpend = cash + (3 - loans) * 10', () => {
    expect(maxAffordableSpend(30, 0)).toBe(60);
    expect(maxAffordableSpend(5, 1)).toBe(25);
    expect(maxAffordableSpend(5, 3)).toBe(5); // no loans left
    expect(maxAffordableSpend(5, 4)).toBe(5); // never negative capacity
  });

  test('startAuction rejects a bid that would need a 4th loan, allows at the cap', () => {
    const s = mkState();
    const p1 = s.players.find(p => p.playerId === 'p1')!;
    s.currentPlayerIndex = s.players.findIndex(p => p.playerId === 'p1');
    s.turnPhase = 'awaiting_turn_action';
    p1.cash = 5;
    p1.loans = MAX_LOANS; // already at the cap → max spend is just cash (5)
    const cardUid = s.market[0].uid;

    const over = startAuction(s, 'p1', cardUid, 6);
    expect(over.ok).toBe(false);
    expect(over.error).toMatch(/loan limit/);

    const ok = startAuction(s, 'p1', cardUid, 5);
    expect(ok.ok).toBe(true);
  });

  test('payBank never pushes a player past MAX_LOANS', () => {
    const s = mkState();
    const p1 = s.players.find(p => p.playerId === 'p1')!;
    p1.cash = 5;
    p1.loans = 2; // only one loan of headroom
    const events: GameLogEntry[] = [];
    payBank(p1, 30, events); // would naively need 3 loans; capped to 1
    expect(p1.loans).toBe(MAX_LOANS);
  });
});
