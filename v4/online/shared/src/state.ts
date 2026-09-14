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
  persistentEffects: ActionCard[];
  loans: number;
  endGameCashBonus: number;
  goalsClaimed: GoalCard[];
  isBot?: boolean;
}

export interface PlayerPublic {
  playerId: PlayerId;
  name: string;
  cash: number;
  handSize: number;
  persistentEffects: ActionCard[];
  loans: number;
  goalsClaimed: GoalCard[];
  connected: boolean;
  isBot?: boolean;
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
  /**
   * Set when this is a Black Market side-auction for a face-down Insider Tip
   * drawn from the unused pool. The winner takes this tip into their hand
   * (private). The auctioned tip is NOT in `state.market`; when the auction
   * resolves we skip the market-splice path used for normal auctions.
   */
  sideAuctionTip?: InsiderTipCard;
  /** When `sideAuctionTip` is set, restore this turnPhase after resolution. */
  resumePhase?: TurnPhase;
}

export type PromptType =
  | 'auction_bid'
  | 'pick_color' // Tip-Off
  | 'peek_ack' // Scout / Informant / Hot Tip / 2P peek_tips
  | 'peek_bottom_choice' // peek top N tips, optionally move one to the bottom
  | 'pick_color_amount' // The Squeeze, Rumor Mill per-color, 3 Purple, 2B+2Y, 2B+2P (per side)
  | 'pick_stock_from_hand' // Pump and Dump, sell_bonus_batch
  | 'pick_target_player' // Hostile Takeover step 1
  | 'pick_stock_from_target' // Hostile Takeover step 2
  | 'draw_and_keep' // Tipster's Choice, 2O+2P
  | 'wild_speculation_choice'
  | 'pick_market_card' // Corner the Market, swap_with_market step 1
  | 'pick_hand_stock_for_swap' // swap_with_market step 2
  | 'set_stock_choice' // 2Y goal
  | 'adjust_two_stocks_choice' // 2B+2P
  | 'final_tip_play_choice'; // Insider Source drew the LAST tip — play it now or let game end

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
  | { kind: 'play_insider_tip'; cardUid: string }
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
  isBot?: boolean;
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
  /**
   * Face-up market. Normally stocks/actions from the main deck, but a player
   * can swap an Insider Tip into it (via the swap-with-market goal reward); a
   * tip sitting in the market is auctioned like any other card.
   */
  market: (StockCard | ActionCard | InsiderTipCard)[];
  mainDeck: (StockCard | ActionCard)[];
  discardPile: (StockCard | ActionCard | HotTipCard)[];
  insiderTipDeck: InsiderTipCard[];
  resolvedInsiderTips: InsiderTipCard[];
  /**
   * Tips from the 16-card pool that weren't dealt into `insiderTipDeck` at
   * setup. Black Market side-auctions draw a random tip from here.
   */
  unusedInsiderTipPool: InsiderTipCard[];
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
  /**
   * Experimental rule toggles for game-length tuning. Optional — absent means
   * the default ruleset (see DEFAULT_RULES / createGameState).
   */
  rules?: RulesConfig;
}

/**
 * Game-balance rule knobs. `DEFAULT_RULES` is the live, shipped ruleset (the
 * "1+2+3" config: starting Market Order card, +1 goal & end at 2 remaining, and
 * one fewer insider tip). Pass a partial override to `createGameState` to run a
 * different configuration (e.g. the classic game, or game-length experiments).
 */
export interface RulesConfig {
  /** Deal every player a free single-use "buy a market stock at current price" card. */
  startingBuyCard: boolean;
  /** End the game when this many goals (or fewer) remain visible. */
  goalStopCount: number;
  /** Extra active goals beyond players+2. */
  extraGoals: number;
  /** Reduce the insider-tip deck by this many cards from 2×players (floored at MIN_TIPS). */
  tipReduction: number;
}

/** Minimum insider tips dealt regardless of reduction (keeps 2-player games playable). */
export const MIN_TIPS = 4;

/** The live, shipped ruleset. */
export const DEFAULT_RULES: RulesConfig = {
  startingBuyCard: true,
  goalStopCount: 2,
  extraGoals: 1,
  tipReduction: 1
};

/** The original V4 ruleset (no starting card, end at 1 goal, full tip deck). */
export const CLASSIC_RULES: RulesConfig = {
  startingBuyCard: false,
  goalStopCount: 1,
  extraGoals: 0,
  tipReduction: 0
};

/**
 * Hard cap on how many loans a single player may ever hold. Players cannot take
 * a 4th loan, and cannot bid/spend in a way that would require one. A loan is
 * $10 cash, so a player's maximum committable spend is
 * `cash + (MAX_LOANS - loans) * 10`.
 */
export const MAX_LOANS = 3;
export const LOAN_CASH = 10;

/** Maximum a player can commit to a payment given the loan cap. */
export function maxAffordableSpend(cash: number, loans: number): number {
  return cash + Math.max(0, MAX_LOANS - loans) * LOAN_CASH;
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
  market: (StockCard | ActionCard | InsiderTipCard)[];
  mainDeckSize: number;
  discardPileSize: number;
  insiderTipDeckSize: number;
  resolvedInsiderTips: InsiderTipCard[];
  activeGoals: GoalCard[];
  auction: AuctionState | null;
  myPrompt: PromptEnvelope | null;
  gameOver: GameOver | null;
  /** Populated only when the game is finished — every player's full hand. */
  revealedHands?: Record<PlayerId, HandCard[]>;
}
