import type {
  GameOverBreakdownEntry,
  GameState,
  PlayerPrivate,
  StockCard
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';

/**
 * Per-player escalating loan penalty. The n-th loan a player takes is worth
 * `LOAN_BASE_PENALTY + n` at game end:
 *   1st loan  → $12
 *   2nd loan  → $13
 *   3rd loan  → $14
 *   ...
 * Total for `loans` loans = sum_{k=1..loans}(11 + k) = 11·loans + loans·(loans+1)/2.
 */
const LOAN_BASE_PENALTY = 11; // n-th loan costs LOAN_BASE_PENALTY + n

export function loanPenaltyFor(loans: number): number {
  if (loans <= 0) return 0;
  return LOAN_BASE_PENALTY * loans + (loans * (loans + 1)) / 2;
}

export function computePlayerWealth(state: GameState, player: PlayerPrivate): GameOverBreakdownEntry {
  let stockValue = 0;
  let stocksHeld = 0;
  for (const c of player.hand) {
    if (c.category !== 'stock') continue;
    stocksHeld += 1;
    if (c.color === 'Wild') continue; // Wild Shares are $0
    stockValue += state.stockPrices[c.color];
  }
  const loanPenalty = loanPenaltyFor(player.loans);
  const endGameBonus = player.endGameCashBonus;
  const total = player.cash + stockValue + endGameBonus - loanPenalty;
  return {
    playerId: player.playerId,
    name: player.name,
    cash: player.cash,
    stockValue,
    endGameBonus,
    loanPenalty,
    total,
    stocksHeld
  };
}

export function computeBreakdown(state: GameState): GameOverBreakdownEntry[] {
  return state.players.map(p => computePlayerWealth(state, p));
}

export function selectWinners(breakdown: GameOverBreakdownEntry[]): string[] {
  let max = -Infinity;
  for (const b of breakdown) if (b.total > max) max = b.total;
  const top = breakdown.filter(b => b.total === max);
  if (top.length === 1) return [top[0].playerId];
  // Tiebreaker: most stocks held.
  let maxStocks = -Infinity;
  for (const b of top) if (b.stocksHeld > maxStocks) maxStocks = b.stocksHeld;
  const top2 = top.filter(b => b.stocksHeld === maxStocks);
  return top2.map(b => b.playerId);
}

export function _stockCardsInHand(p: PlayerPrivate): StockCard[] {
  return p.hand.filter((c): c is StockCard => c.category === 'stock');
}
