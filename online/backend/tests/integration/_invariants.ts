import type { GameState } from '@insider-trading/shared';
import { expect } from '@jest/globals';

/**
 * Post-game invariants reused across full-game integration tests
 * (full_game.test.ts and bot_full_game.test.ts). Asserts every player's
 * breakdown matches the actual hand state, and that no card uids leak.
 */
export function assertGameOverInvariants(state: GameState): void {
  expect(state.gameOver).not.toBeNull();
  const reason = state.gameOver!.reason;
  expect(['insider_tip_deck_empty', 'one_goal_remaining']).toContain(reason);
  for (const b of state.gameOver!.breakdown) {
    const player = state.players.find(p => p.playerId === b.playerId)!;
    let stockValue = 0;
    let stocksHeld = 0;
    for (const c of player.hand) {
      if (c.category !== 'stock') continue;
      stocksHeld++;
      if (c.color === 'Wild') continue;
      stockValue += state.stockPrices[c.color];
    }
    expect(b.stocksHeld).toBe(stocksHeld);
    expect(b.stockValue).toBe(stockValue);
    expect(b.cash).toBe(player.cash);
    expect(b.endGameBonus).toBe(player.endGameCashBonus);
    expect(b.loanPenalty).toBe(player.loans * 12);
    expect(b.total).toBe(
      player.cash + stockValue + player.endGameCashBonus - player.loans * 12
    );
  }
  if (reason === 'insider_tip_deck_empty') {
    expect(state.insiderTipDeck).toHaveLength(0);
  }
  // No card uid leaks: each uid appears exactly once across all locations.
  const all: string[] = [];
  for (const p of state.players) {
    all.push(
      ...p.hand.map(c => c.uid),
      ...p.persistentEffects.map(c => c.uid),
      ...p.goalsClaimed.map(c => c.uid)
    );
  }
  all.push(...state.market.map(c => c.uid));
  all.push(...state.mainDeck.map(c => c.uid));
  all.push(...state.discardPile.map(c => c.uid));
  all.push(...state.activeGoals.map(c => c.uid));
  all.push(...state.insiderTipDeck.map(c => c.uid));
  all.push(...state.resolvedInsiderTips.map(c => c.uid));
  expect(new Set(all).size).toBe(all.length);
}
