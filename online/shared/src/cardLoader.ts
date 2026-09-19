import fs from 'node:fs';
import path from 'node:path';
import type {
  ActionCard,
  BonusCard,
  GoalCard,
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
  /** Setup-only deck: 12 basic stocks + 7 playable + 5 hidden bonus starter action cards. */
  starterDeck: (StockCard | ActionCard | BonusCard)[];
  /**
   * Alternate variant only: Backroom Deal / Double Down / Foresight, re-wrapped
   * as ordinary Market Deck action cards. Same source starter_deck.json
   * entries (ids 103, 106, 107) as their Classic starter-deck counterparts --
   * edit those once, not here, to change their text/effect.
   */
  promotedActions: ActionCard[];
  /**
   * Alternate variant only: 2 basic stocks per color (8 total), a subset of
   * the same printed starter-stock entries used by Classic's 12-card (3/color)
   * starter deck.
   */
  alternateStarterStocks: StockCard[];
}

interface StarterStockRaw {
  color: string;
  type: string;
}
interface StarterActionRaw {
  id: number;
  name: string;
  description: string;
  hidden: boolean;
  effect: Record<string, unknown> & { type: string };
}

function isStarterStockRaw(c: StarterStockRaw | StarterActionRaw): c is StarterStockRaw {
  return 'color' in c;
}

/**
 * Load the five card JSON files plus the Starter Deck, and attach uids +
 * category discriminators.
 * uid scheme matches /playtest/init.js: stock-N, action-N, itip-N, goal-N,
 * loan-N. Starter Deck cards use their own starter-stock-N / starter-action-N
 * / bonus-N prefixes so the frontend can detect starter-deck origin from the
 * uid alone. The N counter is per-category (not global), but stays unique
 * because of the prefix.
 */
export function loadCards(cardsDir: string): CardCatalog {
  const stocksRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'stock_cards.json'), 'utf8'));
  const actionsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'action_cards.json'), 'utf8'));
  const tipsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'insider_tip_cards.json'), 'utf8'));
  const goalsRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'goal_cards.json'), 'utf8'));
  const loansRaw = JSON.parse(fs.readFileSync(path.join(cardsDir, 'loan_cards.json'), 'utf8'));
  const starterRaw: Array<StarterStockRaw | StarterActionRaw> = JSON.parse(
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

  let stockN = 0;
  let actionN = 0;
  let bonusN = 0;
  const starterDeck: (StockCard | ActionCard | BonusCard)[] = starterRaw.map((c) => {
    if (isStarterStockRaw(c)) {
      stockN += 1;
      return {
        category: 'stock',
        uid: `starter-stock-${stockN}`,
        color: c.color,
        type: c.type
      } as StockCard;
    }
    if (c.hidden) {
      bonusN += 1;
      return {
        category: 'bonus',
        uid: `bonus-${bonusN}`,
        id: c.id,
        name: c.name,
        description: c.description,
        effect: c.effect
      } as BonusCard;
    }
    actionN += 1;
    return {
      category: 'action',
      uid: `starter-action-${actionN}`,
      id: c.id,
      name: c.name,
      description: c.description,
      persistent: false,
      effect: c.effect
    } as ActionCard;
  });

  // Alternate variant: promote Foresight (103), Backroom Deal (106), and
  // Double Down (107) into the Market Deck's action pool. Re-derived from the
  // same starterRaw entries every load -- editing starter_deck.json is the
  // only place these cards' text/effect need to change.
  const PROMOTED_STARTER_ACTION_IDS = new Set([103, 106, 107]);
  let promotedN = 0;
  const promotedActions: ActionCard[] = starterRaw
    .filter((c): c is StarterActionRaw => !isStarterStockRaw(c) && PROMOTED_STARTER_ACTION_IDS.has(c.id))
    .map(c => {
      promotedN += 1;
      return {
        category: 'action',
        uid: `promoted-action-${promotedN}`,
        id: c.id,
        name: c.name,
        description: c.description,
        persistent: false,
        effect: c.effect
      } as ActionCard;
    });

  // Alternate variant: an 8-card mini starter deck (2 basic stocks per
  // color), a subset of the same printed stock entries above.
  const colorCounts: Record<string, number> = {};
  let altStockN = 0;
  const alternateStarterStocks: StockCard[] = starterRaw
    .filter(isStarterStockRaw)
    .filter(c => {
      colorCounts[c.color] = (colorCounts[c.color] ?? 0) + 1;
      return colorCounts[c.color] <= 2;
    })
    .map(c => {
      altStockN += 1;
      return { category: 'stock', uid: `alt-starter-stock-${altStockN}`, color: c.color, type: c.type } as StockCard;
    });

  return { stocks, actions, insiderTips, goals, loans, starterDeck, promotedActions, alternateStarterStocks };
}
