/**
 * Game constants for Insider Trading board game
 */

export const COLORS = ['Blue', 'Red', 'Yellow', 'Black'];

export const PHASES = {
  AUCTION: 'auction',
  TRADING: 'trading',
  GOAL_RESOLUTION: 'goal_resolution',
  SELL: 'sell'
};

export const GAME_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
};

export const CARD_TYPES = {
  RESOURCE: 'resource',
  GOAL: 'goal'
};

export const OFFER_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  ACCEPTED: 'accepted'
};

export const GOAL_TYPES = {
  PAIR: 'pair',
  PAIR_PLUS_SPECIFIC: 'pair_plus_specific',
  THREE_OF_A_KIND: 'three_of_a_kind',
  THREE_DIFFERENT: 'three_different',
  TWO_PAIR: 'two_pair',
  ONE_OF_EVERY: 'one_of_every'
};

export const STOCK_CHANGE_TYPES = {
  SINGLE_UP: 'single_up',
  SINGLE_DOWN: 'single_down',
  SINGLE_UP_TWICE: 'single_up_twice',
  SINGLE_DOWN_TWICE: 'single_down_twice',
  DOUBLE_UP: 'double_up',
  DOUBLE_DOWN: 'double_down',
  MIXED: 'mixed'
};

export const REWARD_TYPES = {
  GAIN_CASH: 'gain_cash',
  STEAL_CASH: 'steal_cash',
  ADJUST_STOCK: 'adjust_stock',
  LOOK_AT_GOAL_CARD: 'look_at_goal_card',
  CHOOSE_INVESTIGATION: 'choose_investigation',
  NEXT_AUCTION_DISCOUNT: 'next_auction_discount',
  EXTRA_TURN: 'extra_turn',
  SWAP_WITH_FACE_UP: 'swap_with_face_up',
  ADJUST_STOCK_2: 'adjust_stock_2',
  PEEK_AND_REARRANGE_5: 'peek_and_rearrange_5'
};

export const DEFAULT_CONFIG = {
  startingCash: 6,
  startingResourceCards: 2,
  startingGoalCards: 3,
  startingStockPrice: 4,
  totalRounds: 3,
  tradingDuration: 120000, // 2 minutes in milliseconds
  minStockPrice: 1,
  maxStockPrice: 10
};

export const EVENT_TYPES = {
  // Game lifecycle
  GAME_INITIALIZED: 'GAME_INITIALIZED',
  GAME_STARTED: 'GAME_STARTED',
  GAME_ENDED: 'GAME_ENDED',
  PHASE_CHANGED: 'PHASE_CHANGED',

  // Auction events
  AUCTION_STARTED: 'AUCTION_STARTED',
  CARD_REVEALED: 'CARD_REVEALED',
  BID_PLACED: 'BID_PLACED',
  PLAYER_PASSED: 'PLAYER_PASSED',
  AUCTION_WON: 'AUCTION_WON',
  AUCTION_CARD_COMPLETE: 'AUCTION_CARD_COMPLETE',
  AUCTION_PHASE_COMPLETE: 'AUCTION_PHASE_COMPLETE',

  // Trading events
  TRADING_PHASE_STARTED: 'TRADING_PHASE_STARTED',
  TRADE_PROPOSED: 'TRADE_PROPOSED',
  TRADE_ACCEPTED: 'TRADE_ACCEPTED',
  TRADE_CANCELLED: 'TRADE_CANCELLED',
  TRADE_COMPLETED: 'TRADE_COMPLETED',
  TRADING_TIMER_TICK: 'TRADING_TIMER_TICK',
  TRADING_PHASE_ENDED: 'TRADING_PHASE_ENDED',

  // Goal resolution events
  GOAL_RESOLUTION_STARTED: 'GOAL_RESOLUTION_STARTED',
  GOAL_REVEALED: 'GOAL_REVEALED',
  STOCK_PRICES_UPDATED: 'STOCK_PRICES_UPDATED',
  GOAL_CHECKED: 'GOAL_CHECKED',
  REWARD_AVAILABLE: 'REWARD_AVAILABLE',
  REWARD_EXECUTED: 'REWARD_EXECUTED',
  GOAL_RESOLUTION_PLAYER_COMPLETE: 'GOAL_RESOLUTION_PLAYER_COMPLETE',
  GOAL_RESOLUTION_PHASE_COMPLETE: 'GOAL_RESOLUTION_PHASE_COMPLETE',

  // Sell events
  SELL_PHASE_STARTED: 'SELL_PHASE_STARTED',
  CARDS_SELECTED_TO_SELL: 'CARDS_SELECTED_TO_SELL',
  PLAYER_COMMITTED_SELL: 'PLAYER_COMMITTED_SELL',
  ALL_SELLS_COMMITTED: 'ALL_SELLS_COMMITTED',
  SELLS_REVEALED: 'SELLS_REVEALED',
  SELL_PHASE_COMPLETE: 'SELL_PHASE_COMPLETE',

  // Player state events
  PLAYER_CASH_CHANGED: 'PLAYER_CASH_CHANGED',
  PLAYER_RECEIVED_CARD: 'PLAYER_RECEIVED_CARD',
  PLAYER_LOST_CARD: 'PLAYER_LOST_CARD',

  // Deck events
  DECK_SHUFFLED: 'DECK_SHUFFLED',
  CARD_DRAWN: 'CARD_DRAWN',

  // Error events
  ACTION_INVALID: 'ACTION_INVALID',
  ERROR: 'ERROR'
};

export const ACTION_TYPES = {
  // Auction actions
  PLACE_BID: 'PLACE_BID',
  PASS: 'PASS',

  // Trading actions
  PROPOSE_TRADE: 'PROPOSE_TRADE',
  ACCEPT_TRADE: 'ACCEPT_TRADE',
  CANCEL_TRADE: 'CANCEL_TRADE',
  END_TRADING: 'END_TRADING',

  // Goal resolution actions
  REVEAL_GOAL: 'REVEAL_GOAL',
  EXECUTE_REWARD: 'EXECUTE_REWARD',

  // Sell actions
  SELECT_CARDS_TO_SELL: 'SELECT_CARDS_TO_SELL',
  COMMIT_SELL: 'COMMIT_SELL'
};
