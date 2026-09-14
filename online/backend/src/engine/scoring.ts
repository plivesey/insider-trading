import type {
  BonusCard,
  GameOverBreakdownEntry,
  GameState,
  PlayerPrivate,
  StockCard
} from '@insider-trading/shared';

/**
 * Per-player loan penalty: 1st loan costs $12, 2nd (and max) loan costs $14
 * -- $26 total for 2. If the player holds an unplayed Easy Credit bonus
 * card, every loan instead costs a flat $10 each.
 */
const LOAN_PENALTY_SCHEDULE = [0, 12, 26]; // index = number of loans

export function loanPenaltyFor(loans: number, hasEasyCredit = false): number {
  if (loans <= 0) return 0;
  if (hasEasyCredit) return loans * 10;
  return LOAN_PENALTY_SCHEDULE[Math.min(loans, LOAN_PENALTY_SCHEDULE.length - 1)];
}

function bonusCardsInHand(player: PlayerPrivate): BonusCard[] {
  return player.hand.filter((c): c is BonusCard => c.category === 'bonus');
}

/** Sum of every hidden end-game bonus card's contribution, given the player's final state. */
function computeBonusCardTotal(player: PlayerPrivate, stocksHeld: number): number {
  let total = 0;
  for (const bonus of bonusCardsInHand(player)) {
    switch (bonus.effect.type) {
      case 'flat_cash':
        total += bonus.effect.amount;
        break;
      case 'per_stock_held':
        total += bonus.effect.amount * stocksHeld;
        break;
      case 'per_goal_completed':
        total += bonus.effect.amount * player.goalsClaimed.length;
        break;
      case 'no_loans_bonus':
        if (player.loans === 0) total += bonus.effect.amount;
        break;
      case 'easy_credit':
        // Handled separately via loanPenaltyFor's hasEasyCredit flag.
        break;
    }
  }
  return total;
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
  const hasEasyCredit = bonusCardsInHand(player).some(b => b.effect.type === 'easy_credit');
  const loanPenalty = loanPenaltyFor(player.loans, hasEasyCredit);
  const endGameBonus = player.endGameCashBonus + computeBonusCardTotal(player, stocksHeld);
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
