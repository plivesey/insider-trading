import type {
  ActionCard,
  AnyCard,
  Color,
  GoalCard,
  HandCard,
  HotTipCard,
  InsiderTipCard,
  StockCard
} from './cards.js';

export type PlayerId = string;

export interface PlayerPrivate {
  playerId: PlayerId;
  name: string;
  cash: number;
  hand: HandCard[];
  hotTipAvailable: boolean;
  persistentEffects: ActionCard[];
  loans: number;
  endGameCashBonus: number;
  goalsClaimed: GoalCard[];
}

export interface PlayerPublic {
  playerId: PlayerId;
  name: string;
  cash: number;
  handSize: number;
  hotTipAvailable: boolean;
  persistentEffects: ActionCard[];
  loans: number;
  goalsClaimed: GoalCard[];
  connected: boolean;
}

export type StockPrices = Record<Color, number>;

export interface AuctionState {
  cardUid: string;
  auctioneerId: PlayerId;
  initialBid: number;
  currentHigh: number;
  currentHighBidderId: PlayerId;
  /** Players still able to raise (turn order, never includes current high bidder). */
  activeBidders: PlayerId[];
  /** Whose decision (bid or pass) the auction is waiting on. */
  awaitingBidderId: PlayerId | null;
}

export type PromptType =
  | 'auction_bid'
  | 'pick_color' // Tip-Off
  | 'peek_ack' // Scout / Informant / Hot Tip / Inside Track / Wiretap / 2P peek_tips
  | 'reorder_tips'
  | 'pick_color_amount' // The Squeeze, Rumor Mill per-color, 3 Purple, 2B+2Y, 2B+2P (per side)
  | 'pick_stock_from_hand' // Pump and Dump, sell_bonus_batch
  | 'pick_target_player' // Hostile Takeover step 1
  | 'pick_stock_from_target' // Hostile Takeover step 2
  | 'draw_and_keep' // Tipster's Choice, 2O+2P
  | 'wild_speculation_choice'
  | 'pick_market_card' // Corner the Market, swap_with_market step 1
  | 'pick_hand_stock_for_swap' // swap_with_market step 2
  | 'set_stock_choice' // 2Y goal
  | 'adjust_two_stocks_choice'; // 2B+2P

export interface PromptEnvelope {
  promptId: string;
  type: PromptType;
  playerId: PlayerId;
  payload: Record<string, unknown>;
  /** Free-text label the client can show. */
  message: string;
}

export type FreeActionRequest =
  | { kind: 'play_action_card'; cardUid: string; payload?: Record<string, unknown> }
  | { kind: 'use_hot_tip' }
  | { kind: 'claim_goal'; goalUid: string; stockAssignment: StockAssignment };

export interface StockAssignment {
  /** uid of stock card -> the color it satisfies. Wild Shares satisfy any one color. */
  cards: Record<string, Color>;
}

export interface FreeActionQueueEntry {
  playerId: PlayerId;
  request: FreeActionRequest;
}

export interface InsiderTipDeck {
  /** Face-down event deck — internal only. Never project to clients. */
  cards: InsiderTipCard[];
}

export interface GameOverBreakdownEntry {
  playerId: PlayerId;
  name: string;
  cash: number;
  stockValue: number;
  endGameBonus: number;
  loanPenalty: number;
  total: number;
  stocksHeld: number;
}

export interface GameOver {
  reason: 'insider_tip_deck_empty' | 'one_goal_remaining';
  winnerPlayerIds: PlayerId[]; // multiple = tie
  breakdown: GameOverBreakdownEntry[];
  endedAt: string; // ISO timestamp
}

export type LobbyMember = {
  playerId: PlayerId;
  name: string;
  connected: boolean;
};

export interface ServerState {
  mode: 'lobby' | 'in_game' | 'game_over';
  lobby: LobbyMember[];
  game: GameState | null;
}

export type TurnPhase =
  | 'awaiting_turn_action'
  | 'in_auction'
  | 'awaiting_die_roll'
  | 'turn_complete';

export interface GameState {
  gameId: string;
  startedAt: string; // ISO timestamp
  seed: number;
  /** Counter that drives the seeded RNG forward as the game progresses. */
  rngCursor: number;
  version: 4;
  status: 'in_progress' | 'finished';
  stockPrices: StockPrices;
  currentPlayerIndex: number;
  turnNumber: number;
  turnPhase: TurnPhase;
  /** Active auction, if `turnPhase === 'in_auction'`. */
  auction: AuctionState | null;
  players: PlayerPrivate[];
  market: (StockCard | ActionCard)[];
  mainDeck: (StockCard | ActionCard)[];
  discardPile: (StockCard | ActionCard | HotTipCard)[];
  insiderTipDeck: InsiderTipCard[];
  resolvedInsiderTips: InsiderTipCard[];
  activeGoals: GoalCard[];
  freeActionQueue: FreeActionQueueEntry[];
  /** Active per-player prompts. Only one entry per player. */
  pendingPrompts: Record<PlayerId, PromptEnvelope | null>;
  /** Set to non-null when the game ends. */
  gameOver: GameOver | null;
  log: GameLogEntry[];
  /** Counter for monotonic event numbering inside the per-game log file. */
  eventCounter: number;
  /** Track which players are currently connected (cosmetic). */
  connected: Record<PlayerId, boolean>;
}

export interface GameLogEntry {
  /** Monotonic sequence within the game. */
  seq: number;
  /** ISO timestamp when the entry was created. */
  ts: string;
  /** Turn number at the time. */
  turnNumber: number;
  /** Event type. Mirrors mutate labels. */
  type: string;
  /** Player who initiated (when applicable). */
  actor?: PlayerId;
  /** Human-readable message. */
  message: string;
  /** Free-form payload for replay. */
  payload?: Record<string, unknown>;
}

/** Per-player projection — strips other players' hands and tip deck contents. */
export interface ProjectedGameState {
  gameId: string;
  startedAt: string;
  version: 4;
  status: 'in_progress' | 'finished';
  stockPrices: StockPrices;
  currentPlayerIndex: number;
  turnNumber: number;
  players: PlayerPublic[];
  myPlayer: PlayerPrivate | null; // null if you're a spectator (won't happen post-game-start in practice)
  market: (StockCard | ActionCard)[];
  mainDeckSize: number;
  discardPileSize: number;
  insiderTipDeckSize: number;
  resolvedInsiderTips: InsiderTipCard[];
  activeGoals: GoalCard[];
  auction: AuctionState | null;
  myPrompt: PromptEnvelope | null;
  gameOver: GameOver | null;
}
