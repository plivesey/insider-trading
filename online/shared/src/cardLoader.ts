import fs from 'node:fs';
import path from 'node:path';
import type { ActionCard, GoalCard, InsiderTipCard, LoanCard, StockCard } from './cards.js';

export interface CardCatalog {
  stocks: StockCard[];
  actions: ActionCard[];
  insiderTips: InsiderTipCard[];
  goals: GoalCard[];
  loans: LoanCard[];
  /** The 8-card starter stock deck (2 basic stocks per color), dealt 1 per player at setup. */
  starterStocks: StockCard[];
}

interface StarterStockRaw {
  color: string;
  type: string;
}

/**
 * Load the five card JSON files plus the 8-card starter stock deck, and
 * attach uids + category discriminators.
 * uid scheme matches /playtest/init.js: stock-N, action-N, itip-N, goal-N,
 * loan-N. Starter stock cards use their own starter-stock-N prefix so the
 * frontend can detect starter-stock origin from the uid alone.
 */
export function loadCards(cardsDir: string): CardCatalog {
  const stocksRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'stock_cards.json'), 'utf8'));
  const actionsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'action_cards.json'), 'utf8'));
  const tipsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'insider_tip_cards.json'), 'utf8'));
  const goalsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'goal_cards.json'), 'utf8'));
  const loansRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'loan_cards.json'), 'utf8'));
  const starterRaw: StarterStockRaw[] = JSON.parse(
    fs.readFileSync(path.join(cardsDir, 'starter_deck.json'), 'utf8')
  );

  const stocks: StockCard[] = stocksRaw.map((c: Omit<StockCard, 'uid' | 'category'>, i: number) => ({
    ...c,
    category: 'stock',
    uid: `stock-${i + 1}`
  }));
  const actions: ActionCard[] = actionsRaw.map((c: Omit<ActionCard, 'uid' | 'category'>, i: number) => ({
    ...c,
    category: 'action',
    uid: `action-${i + 1}`
  }));
  const insiderTips: InsiderTipCard[] = tipsRaw.cards.map(
    (c: Omit<InsiderTipCard, 'uid' | 'category'>, i: number) => ({
      ...c,
      category: 'insider_tip',
      uid: `itip-${i + 1}`
    })
  );
  const goals: GoalCard[] = goalsRaw.cards.map((c: Omit<GoalCard, 'uid' | 'category'>, i: number) => ({
    ...c,
    category: 'goal',
    uid: `goal-${i + 1}`
  }));
  const loans: LoanCard[] = loansRaw.cards.map((c: Omit<LoanCard, 'uid' | 'category'>, i: number) => ({
    ...c,
    category: 'loan',
    uid: `loan-${i + 1}`
  }));

  const starterStocks: StockCard[] = starterRaw.map((c, i) => ({
    category: 'stock',
    uid: `starter-stock-${i + 1}`,
    color: c.color,
    type: c.type
  })) as StockCard[];

  return { stocks, actions, insiderTips, goals, loans, starterStocks };
}
