// Card type definitions matching /cards/*.json exactly.
// Every card gets a `uid` and a `category` discriminator at load time.

export type Color = 'Blue' | 'Orange' | 'Green' | 'Purple';
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
  | { type: 'sell_same_bonus'; bonus: number }
  | { type: 'adjust_stock'; amount: number }
  | { type: 'flip_and_adjust'; amount: number }
  | { type: 'tie_breaker' }
  | { type: 'steal_stock' }
  | { type: 'adjust_all_stocks'; amount: number }
  | { type: 'draw_tip'; count?: number }
  | { type: 'broker_discount'; color: Color }
  | { type: 'fire_sale' }
  | { type: 'first_look' }
  | { type: 'foresight' }
  | { type: 'windfall' }
  | { type: 'market_panic' }
  | { type: 'backroom_deal' }
  | { type: 'double_down' };

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
  /** 'shift' is the same `adjust` effect shape as 'slump', just one color up and one down instead of both down. */
  type: 'crash' | 'surge' | 'slump' | 'shift';
  text: string;
  effect: InsiderTipEffect;
}

export type GoalRequirementType = 'pair' | 'three_of_a_kind' | 'two_pair' | 'four_of_a_kind' | 'full_spread';

export type GoalReward =
  | { type: 'gain_cash'; amount: number }
  | { type: 'adjust_stock'; amount: number }
  | { type: 'set_stock'; amount: number }
  | { type: 'peek_tips'; count: number }
  | { type: 'peek_tips_bottom'; count: number }
  | { type: 'draw_tips'; count: number }
  | { type: 'steal_from_all'; amount: number }
  | { type: 'sell_bonus_batch'; bonus: number }
  | { type: 'adjust_all_stocks'; amount: number }
  | { type: 'adjust_two_stocks'; up: number; down: number }
  | { type: 'swap_with_market' }
  | { type: 'draw_and_choose'; drawCount: number; keepCount: number }
  | { type: 'draw_deck_tip'; cash: number }
  | { type: 'end_game_cash'; amount: number };

export interface GoalCard {
  category: 'goal';
  uid: string;
  id: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
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

/**
 * "Hidden end-game bonus" cards from the Starter Deck. Never played -- they
 * sit secretly in a player's hand for the whole game and auto-score at final
 * wealth calculation (see engine/scoring.ts). No `persistent` field: the
 * concept doesn't apply since there's no "play" action for these at all.
 */
export type BonusEffect =
  | { type: 'flat_cash'; amount: number }
  | { type: 'per_stock_held'; amount: number }
  | { type: 'per_goal_completed'; amount: number }
  | { type: 'no_loans_bonus'; amount: number }
  | { type: 'easy_credit' };

export interface BonusCard {
  category: 'bonus';
  uid: string;
  id: number;
  name: string;
  description: string;
  effect: BonusEffect;
}

export type AnyCard = StockCard | ActionCard | InsiderTipCard | GoalCard | LoanCard | BonusCard;
export type DeckCard = StockCard | ActionCard;
/**
 * Everything that can legally sit in a player's hand. V5 widens this from V4's
 * 3-member union to also include GoalCard (a privately-drafted/drawn secret
 * goal) and BonusCard (a hidden end-game bonus card).
 */
export type HandCard = StockCard | ActionCard | InsiderTipCard | GoalCard | BonusCard;

export const COLORS: Color[] = ['Blue', 'Orange', 'Green', 'Purple'];

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
export function isBonus(card: AnyCard): card is BonusCard {
  return card.category === 'bonus';
}
