import type { GameState } from '@insider-trading/shared';
import { expect } from '@jest/globals';

/**
 * Post-game invariants reused across full-game integration tests
 * (full_game.test.ts and bot_full_game.test.ts). Asserts every player's
 * breakdown matches the actual hand state, and that no card uids leak.
 *
 * The loan-penalty and bonus-card math is recomputed independently here
 * (not by calling engine/scoring.ts's own functions) so this check can
 * actually catch a regression there instead of tautologically re-verifying it.
 */
function independentLoanPenalty(loans: number, hasEasyCredit: boolean): number {
  if (loans <= 0) return 0;
  if (hasEasyCredit) return loans * 10;
  if (loans === 1) return 12;
  return 26; // 2 loans (the max)
}

export function assertGameOverInvariants(state: GameState): void {
  expect(state.gameOver).not.toBeNull();
  const reason = state.gameOver!.reason;
  expect(reason).toBe('progress_threshold_reached');
  expect(state.progressTracker).toBeGreaterThanOrEqual(state.progressThreshold);

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

    let bonusTotal = 0;
    let hasEasyCredit = false;
    for (const c of player.hand) {
      if (c.category !== 'bonus') continue;
      switch (c.effect.type) {
        case 'flat_cash':
          bonusTotal += c.effect.amount;
          break;
        case 'per_stock_held':
          bonusTotal += c.effect.amount * stocksHeld;
          break;
        case 'per_goal_completed':
          bonusTotal += c.effect.amount * player.goalsClaimed.length;
          break;
        case 'no_loans_bonus':
          if (player.loans === 0) bonusTotal += c.effect.amount;
          break;
        case 'easy_credit':
          hasEasyCredit = true;
          break;
      }
    }
    const expectedEndGameBonus = player.endGameCashBonus + bonusTotal;
    expect(b.endGameBonus).toBe(expectedEndGameBonus);

    const expectedLoanPenalty = independentLoanPenalty(player.loans, hasEasyCredit);
    expect(b.loanPenalty).toBe(expectedLoanPenalty);
    expect(b.total).toBe(player.cash + stockValue + expectedEndGameBonus - expectedLoanPenalty);
  }

  // No card uid leaks: each uid appears exactly once across all live
  // locations. The one documented exception is a simultaneous public-goal
  // dual-claim (rules.md): the same goal uid can legitimately appear in TWO
  // different players' `goalsClaimed` -- it's checked separately below,
  // since it's still not allowed to also appear anywhere else (hand,
  // market, any deck).
  const all: string[] = [];
  for (const p of state.players) {
    all.push(...p.hand.map(c => c.uid), ...p.persistentEffects.map(c => c.uid));
  }
  all.push(...state.market.map(c => c.uid));
  all.push(...state.mainDeck.map(c => c.uid));
  all.push(...state.discardPile.map(c => c.uid));
  all.push(...state.goalRow.map(c => c.uid));
  all.push(...state.eventDeck.map(c => c.uid));
  all.push(...state.resolvedEventCards.map(c => c.uid));
  expect(new Set(all).size).toBe(all.length);

  const allSet = new Set(all);
  const claimedUids = state.players.flatMap(p => p.goalsClaimed.map(c => c.uid));
  for (const uid of claimedUids) {
    expect(allSet.has(uid)).toBe(false);
  }
}
