import fs from 'node:fs';
import path from 'node:path';
import type {
  ActionCard,
  GoalCard,
  HotTipCard,
  InsiderTipCard,
  LoanCard,
  StockCard
} from './cards.js';

export interface CardCatalog {
  stocks: StockCard[];
  actions: ActionCard[];
  insiderTips: InsiderTipCard[];
  goals: GoalCard[];
  loans: LoanCard[];
  hotTips: HotTipCard[];
}

/**
 * Load the six card JSON files and attach uids + category discriminators.
 * uid scheme matches /playtest/init.js: stock-N, action-N, itip-N, goal-N, loan-N, hot-N.
 * The N counter is per-category (not global), but stays unique because of the prefix.
 */
export function loadCards(cardsDir: string): CardCatalog {
  const stocksRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'stock_cards.json'), 'utf8'));
  const actionsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'action_cards.json'), 'utf8'));
  const tipsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'insider_tip_cards.json'), 'utf8'));
  const goalsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'goal_cards.json'), 'utf8'));
  const loansRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'loan_cards.json'), 'utf8'));
  const hotTipsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'peek_cards.json'), 'utf8'));

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
  const hotTips: HotTipCard[] = hotTipsRaw.cards.map(
    (c: Omit<HotTipCard, 'uid' | 'category'>, i: number) => ({
      ...c,
      category: 'hot_tip',
      uid: `hot-${i + 1}`
    })
  );

  return { stocks, actions, insiderTips, goals, loans, hotTips };
}
