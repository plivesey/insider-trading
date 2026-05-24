// Card type definitions matching /cards/*.json exactly.
// Every card gets a `uid` and a `category` discriminator at load time.

export type Color = 'Blue' | 'Orange' | 'Yellow' | 'Purple';
export type StockColor = Color | 'Wild';

export type StockType = 'blank' | 'extra_up' | 'other_up' | 'peek_buy' | 'peek_sell' | 'wild';

export interface StockCard {
  category: 'stock';
  uid: string;
  color: StockColor;
  type: StockType;
  name?: string;
  ability?: string;
}

export type ActionEffect =
  | { type: 'draw_and_choose'; drawCount: number; keepCount: number }
  | { type: 'take_face_up' }
  | { type: 'sell_double'; count: number }
  | { type: 'adjust_stock'; amount: number }
  | { type: 'flip_and_adjust'; amount: number }
  | { type: 'tie_breaker' }
  | { type: 'goal_discount'; discount: number }
  | { type: 'steal_stock'; compensation: number }
  | { type: 'adjust_all_stocks'; amount: number }
  | { type: 'peek_reorder_tips'; count: number };

export interface ActionCard {
  category: 'action';
  uid: string;
  id: number;
  name: string;
  description: string;
  persistent: boolean;
  effect: ActionEffect;
}

export type InsiderTipEffect =
  | { type: 'halve'; color: Color }
  | { type: 'adjust'; changes: Partial<Record<Color, number>> };

export interface InsiderTipCard {
  category: 'insider_tip';
  uid: string;
  id: number;
  type: 'crash' | 'surge' | 'slump';
  text: string;
  effect: InsiderTipEffect;
}

export type GoalRequirementType = 'pair' | 'three_of_a_kind' | 'two_pair';

export type GoalReward =
  | { type: 'gain_cash'; amount: number }
  | { type: 'adjust_stock'; amount: number }
  | { type: 'set_stock'; amount: number }
  | { type: 'peek_tips'; count: number }
  | { type: 'steal_from_all'; amount: number }
  | { type: 'sell_bonus_batch'; bonus: number }
  | { type: 'adjust_all_stocks'; amount: number }
  | { type: 'adjust_two_stocks'; up: number; down: number }
  | { type: 'swap_with_market' }
  | { type: 'draw_and_choose'; drawCount: number; keepCount: number }
  | { type: 'end_game_cash'; amount: number };

export interface GoalCard {
  category: 'goal';
  uid: string;
  id: number;
  difficulty: 'easy' | 'hard';
  goal: {
    text: string;
    parsed: {
      type: GoalRequirementType;
      requirements: Partial<Record<Color, number>>;
    };
  };
  reward: {
    text: string;
    parsed: GoalReward;
  };
}

export interface LoanCard {
  category: 'loan';
  uid: string;
  id: number;
  name: 'Bank Loan';
  cashOnTake: number;
  endGameValue: number;
}

export interface HotTipCard {
  category: 'hot_tip';
  uid: string;
  id: number;
  name: 'Hot Tip';
  description: string;
  uses: number;
}

export type AnyCard = StockCard | ActionCard | InsiderTipCard | GoalCard | LoanCard | HotTipCard;
export type DeckCard = StockCard | ActionCard;
export type HandCard = StockCard | ActionCard;

export const COLORS: Color[] = ['Blue', 'Orange', 'Yellow', 'Purple'];

export function isStock(card: AnyCard): card is StockCard {
  return card.category === 'stock';
}
export function isAction(card: AnyCard): card is ActionCard {
  return card.category === 'action';
}
export function isInsiderTip(card: AnyCard): card is InsiderTipCard {
  return card.category === 'insider_tip';
}
export function isGoal(card: AnyCard): card is GoalCard {
  return card.category === 'goal';
}
export function isHotTip(card: AnyCard): card is HotTipCard {
  return card.category === 'hot_tip';
}
