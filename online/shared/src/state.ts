import type {
  ActionCard,
  Color,
  GoalCard,
  HandCard,
  InsiderTipCard,
  StockCard
} from './cards.js';
import type { DieId } from './dice.js';

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
}

export type PromptType =
  | 'auction_bid'
  | 'pick_color' // Tip-Off
  | 'peek_ack' // Scout / Informant / 2P peek_tips
  | 'peek_bottom_choice' // peek top N tips, optionally move one to the bottom
  | 'pick_color_amount' // The Squeeze, Rumor Mill per-color, 3 Purple, 2B+2G, 2B+2P (per side)
  | 'pick_stock_from_hand' // Pump and Dump, sell_bonus_batch
  | 'pick_target_player' // Hostile Takeover step 1
  | 'pick_stock_from_target' // Hostile Takeover step 2
  | 'draw_and_keep' // Tipster's Choice, 2O+2P
  | 'wild_speculation_choice'
  | 'pick_market_card' // Corner the Market, Fire Sale, swap_with_market step 1
  | 'pick_hand_stock_for_swap' // swap_with_market step 2
  | 'set_stock_choice' // 2G goal
  | 'adjust_two_stocks_choice' // 2B+2P
  | 'setup_draft_pick' // pass-and-draft setup: keep 1 of N, pass the rest left
  | 'foresight_reorder' // look at top 4 event cards, reorder / optionally bury 1
  | 'backroom_deal_pick_own_card' // Backroom Deal step 1: pick a card from your own hand
  | 'double_down_pick_card' // Double Down: pick a different single-use action card in hand to resolve twice
  | 'final_goal_offer'; // game-ending final call: claim a currently-completable goal before scoring, or skip

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
  | { kind: 'play_market_movement'; cardUid: string }
  | { kind: 'claim_goal'; goalUid: string; stockAssignment: StockAssignment }
  | { kind: 'claim_private_goal'; goalUid: string; stockAssignment: StockAssignment };

export interface StockAssignment {
  /** uid of stock card -> the color it satisfies. Wild Shares satisfy any one color. */
  cards: Record<string, Color>;
}

export interface FreeActionQueueEntry {
  playerId: PlayerId;
  request: FreeActionRequest;
}

/**
 * Transient state for the setup pass-and-draft procedure (rules.md "Setup"
 * step 6). Exists only while `turnPhase === 'setup_draft'`; null otherwise.
 * `hands` holds each player's current round candidates (not their permanent
 * hand yet -- kept cards move into `PlayerPrivate.hand` as players pick).
 */
export interface DraftState {
  round: 1 | 2 | 3;
  hands: Record<PlayerId, HandCard[]>;
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
  reason: 'progress_threshold_reached';
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
  | 'setup_draft'
  | 'awaiting_turn_action'
  | 'in_auction'
  | 'awaiting_dice_bag_draw'
  | 'turn_complete'
  /** Progress threshold reached; waiting on final-goal-offer prompts before the game actually ends. */
  | 'game_ending';

export interface GameState {
  gameId: string;
  startedAt: string; // ISO timestamp
  seed: number;
  /** Counter that drives the seeded RNG forward as the game progresses. */
  rngCursor: number;
  version: 5;
  status: 'in_progress' | 'finished';
  stockPrices: StockPrices;
  currentPlayerIndex: number;
  turnNumber: number;
  turnPhase: TurnPhase;
  /** Active auction, if `turnPhase === 'in_auction'`. */
  auction: AuctionState | null;
  players: PlayerPrivate[];
  /**
   * Face-up market. Normally stocks/actions from the market deck, but a
   * player can swap an event-deck card (market-movement or even a private
   * goal) into it via Backroom Deal or the swap_with_market goal reward; any
   * such card sitting in the market is auctioned like any other card.
   */
  market: (StockCard | ActionCard | InsiderTipCard | GoalCard)[];
  mainDeck: (StockCard | ActionCard)[];
  discardPile: (StockCard | ActionCard)[];
  /** Merged market-movement + goal deck (rules.md "Event Deck"). Never reshuffled. */
  eventDeck: (InsiderTipCard | GoalCard)[];
  resolvedEventCards: InsiderTipCard[];
  /** Public goal row. Any qualifying player may claim from here. */
  goalRow: GoalCard[];
  /** Progress tracker: up-counter from 0 to `progressThreshold`. Game ends the instant it's reached. */
  progressTracker: number;
  progressThreshold: number;
  /** Dice remaining in the shared bag; refills to all 6 (ALL_DICE) when emptied. */
  diceBagRemaining: DieId[];
  /** Non-null only during the setup pass-and-draft procedure. */
  draft: DraftState | null;
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
   * Experimental rule toggles for game-length tuning. Optional -- absent means
   * the default ruleset (see DEFAULT_RULES / createGameState).
   */
  rules?: RulesConfig;
  /** Which setup variant this game was created under. See GameVariant. */
  variant: GameVariant;
}

/**
 * Selectable game-setup ruleset, chosen when a game is started.
 * - `classic`: the shipped V5 setup (24-card starter deck, combined
 *   event+starter draft pile, full 15-card action pool minus the global cuts
 *   below).
 * - `alternate`: leaner setup (8-card basic-stock-only starter deck dealt 1
 *   per player, event-deck-only draft, 3 starter actions promoted into the
 *   Market Deck, no hidden bonus cards, flat 4x-players progress threshold).
 */
export type GameVariant = 'classic' | 'alternate';

/**
 * Game-balance rule knobs for V5's still-being-playtested numbers (see
 * v5_tuning_notes.md items 1-2). Pass a partial override to `createGameState`
 * to run a different configuration (e.g. game-length experiments).
 */
export interface RulesConfig {
  /** How many goal cards to reveal face-up at setup, before the rest of the event deck is reshuffled. */
  initialGoalRevealCount: number;
  /** Progress-tracker threshold = numPlayers * progressThresholdPerPlayer + progressThresholdBase. A placeholder linear formula -- see v5_tuning_notes.md item 2. */
  progressThresholdPerPlayer: number;
  /** Flat offset added to the per-player scaling above. */
  progressThresholdBase: number;
}

/** The live, shipped Classic ruleset. 2p:8, 3p:11, 4p:14, 5p:17, 6p:20. */
export const DEFAULT_RULES: RulesConfig = {
  initialGoalRevealCount: 4,
  progressThresholdPerPlayer: 3,
  progressThresholdBase: 2
};

/** Alternate: same goal-reveal count as Classic, but a flat 4x-players threshold (no base offset). 2p:8, 3p:12, 4p:16, 5p:20, 6p:24. */
export const ALTERNATE_DEFAULT_RULES: RulesConfig = {
  ...DEFAULT_RULES,
  progressThresholdPerPlayer: 4,
  progressThresholdBase: 0
};

/** Default rules for each selectable variant -- `createGameState` starts from this, then applies any `input.rules` override on top. */
export const VARIANT_DEFAULT_RULES: Record<GameVariant, RulesConfig> = {
  classic: DEFAULT_RULES,
  alternate: ALTERNATE_DEFAULT_RULES
};

/** Computes the progress-tracker threshold for a given player count under the given rules. */
export function computeProgressThreshold(numPlayers: number, rules: RulesConfig): number {
  return numPlayers * rules.progressThresholdPerPlayer + rules.progressThresholdBase;
}

/**
 * Hard cap on how many loans a single player may ever hold. Players cannot take
 * a 3rd loan, and cannot bid/spend in a way that would require one. A loan is
 * $10 cash, so a player's maximum committable spend is
 * `cash + (MAX_LOANS - loans) * 10`.
 */
export const MAX_LOANS = 2;
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

/** Per-player projection -- strips other players' hands and event deck contents. */
export interface ProjectedGameState {
  gameId: string;
  startedAt: string;
  version: 5;
  variant: GameVariant;
  status: 'in_progress' | 'finished';
  stockPrices: StockPrices;
  currentPlayerIndex: number;
  turnNumber: number;
  players: PlayerPublic[];
  myPlayer: PlayerPrivate | null; // null if you're a spectator (won't happen post-game-start in practice)
  market: (StockCard | ActionCard | InsiderTipCard | GoalCard)[];
  mainDeckSize: number;
  discardPileSize: number;
  eventDeckSize: number;
  resolvedEventCards: InsiderTipCard[];
  goalRow: GoalCard[];
  progressTracker: number;
  progressThreshold: number;
  auction: AuctionState | null;
  myPrompt: PromptEnvelope | null;
  gameOver: GameOver | null;
  /** Populated only when the game is finished -- every player's full hand. */
  revealedHands?: Record<PlayerId, HandCard[]>;
}
