import type {
  GameOverBreakdownEntry,
  GameState,
  PlayerPrivate,
  StockCard
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';

const LOAN_PENALTY = 12;

export function computePlayerWealth(state: GameState, player: PlayerPrivate): GameOverBreakdownEntry {
  let stockValue = 0;
  let stocksHeld = 0;
  for (const c of player.hand) {
    if (c.category !== 'stock') continue;
    stocksHeld += 1;
    if (c.color === 'Wild') continue; // Wild Shares are $0
    stockValue += state.stockPrices[c.color];
  }
  const loanPenalty = player.loans * LOAN_PENALTY;
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
