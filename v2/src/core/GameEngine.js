/**
 * Game Engine - main orchestrator for the Insider Trading board game
 */
import { EventEmitter } from './EventEmitter.js';
import { GameState } from './GameState.js';
import { DeckManager } from '../managers/DeckManager.js';
import { AuctionManager } from '../managers/AuctionManager.js';
import { TradingManager } from '../managers/TradingManager.js';
import { GoalResolutionManager } from '../managers/GoalResolutionManager.js';
import { SellManager } from '../managers/SellManager.js';
import { StockPriceSystem } from '../systems/StockPriceSystem.js';
import { RewardSystem } from '../systems/RewardSystem.js';
import { ValidationSystem } from '../systems/ValidationSystem.js';
import { TurnSystem } from '../systems/TurnSystem.js';
import { CardLoader } from '../utils/CardLoader.js';
import { GAME_STATUS, PHASES, EVENT_TYPES, ACTION_TYPES } from '../utils/Constants.js';

export class GameEngine {
  constructor(config = {}) {
    this.config = config;
    this.state = null;

    // Event system
    this.eventEmitter = new EventEmitter();

    // Systems
    this.stockPriceSystem = new StockPriceSystem(config);
    this.deckManager = new DeckManager(this.eventEmitter);
    this.validationSystem = new ValidationSystem();
    this.turnSystem = new TurnSystem(this.eventEmitter);
    this.rewardSystem = new RewardSystem(this.eventEmitter, this.deckManager, this.stockPriceSystem);

    // Managers
    this.auctionManager = new AuctionManager(this.eventEmitter, this.deckManager);
    this.tradingManager = new TradingManager(this.eventEmitter);
    this.goalResolutionManager = new GoalResolutionManager(
      this.eventEmitter,
      this.rewardSystem,
      this.stockPriceSystem
    );
    this.sellManager = new SellManager(this.eventEmitter, this.deckManager);

    // Managers object for TurnSystem
    this.managers = {
      auctionManager: this.auctionManager,
      tradingManager: this.tradingManager,
      goalResolutionManager: this.goalResolutionManager,
      sellManager: this.sellManager
    };
  }

  /**
   * Initialize a new game
   * @param {Array} players - Array of player info {id, name}
   * @param {Array} resourceCards - Resource card deck (optional, will create standard if not provided)
   * @param {Array} goalCards - Goal card deck
   */
  async initialize(players, resourceCards = null, goalCards = []) {
    if (players.length < 3) {
      throw new Error('Need at least 3 players');
    }

    // Create initial state
    this.state = GameState.createInitialState(this.config, players);

    // Set up resource deck
    if (resourceCards) {
      this.state.resourceDeck.drawPile = resourceCards;
    } else {
      this.state.resourceDeck.drawPile = CardLoader.createStandardResourceDeck(10);
    }

    // Shuffle resource deck
    this.deckManager.shuffle(this.state.resourceDeck.drawPile);

    // Set up goal deck
    this.state.goalDeck.undealt = goalCards;
    // Shuffle goal deck
    this.deckManager.shuffle(this.state.goalDeck.undealt);

    // Deal initial cards
    this.dealInitialCards();

    this.eventEmitter.emit(EVENT_TYPES.GAME_INITIALIZED, {
      gameId: this.state.gameId,
      playerCount: players.length
    });
  }

  /**
   * Deal initial cards to players
   */
  dealInitialCards() {
    // Deal resource cards
    for (const player of this.state.players) {
      const cards = this.deckManager.draw(
        this.state.resourceDeck,
        this.state.config.startingResourceCards
      );
      player.hand.push(...cards);
    }

    // Deal goal cards
    for (const player of this.state.players) {
      for (let i = 0; i < this.state.config.startingGoalCards; i++) {
        if (this.state.goalDeck.undealt.length > 0) {
          const goalCard = this.state.goalDeck.undealt.shift();
          GameState.addGoalCard(this.state, player.id, goalCard);
        }
      }
    }
  }

  /**
   * Start the game
   */
  start() {
    if (this.state.status !== GAME_STATUS.NOT_STARTED) {
      throw new Error('Game already started');
    }

    this.state.status = GAME_STATUS.IN_PROGRESS;

    this.eventEmitter.emit(EVENT_TYPES.GAME_STARTED, {
      gameId: this.state.gameId
    });

    // Start first auction phase
    this.turnSystem.transitionToPhase(this.state, PHASES.AUCTION, this.managers);
  }

  /**
   * Execute an action
   * @param {Object} action - Action to execute
   */
  executeAction(action) {
    // Validate action
    const validation = this.validationSystem.validateAction(this.state, action);

    if (!validation.valid) {
      this.eventEmitter.emit(EVENT_TYPES.ACTION_INVALID, {
        action,
        reason: validation.error
      });
      throw new Error(validation.error);
    }

    // Record in history
    GameState.recordAction(this.state, action);

    // Dispatch to appropriate handler
    this.dispatchAction(action);

    // Check for phase transitions
    if (this.turnSystem.canAdvancePhase(this.state, this.managers)) {
      this.turnSystem.advancePhase(this.state, this.managers);
    }
  }

  /**
   * Dispatch action to appropriate manager
   * @param {Object} action - Action to dispatch
   */
  dispatchAction(action) {
    switch (action.type) {
      case ACTION_TYPES.PLACE_BID:
        this.auctionManager.placeBid(this.state, action);
        break;

      case ACTION_TYPES.PASS:
        this.auctionManager.pass(this.state, action);
        break;

      case ACTION_TYPES.PROPOSE_TRADE:
        this.tradingManager.proposeTrade(this.state, action);
        break;

      case ACTION_TYPES.ACCEPT_TRADE:
        this.tradingManager.acceptTrade(this.state, action);
        break;

      case ACTION_TYPES.CANCEL_TRADE:
        this.tradingManager.cancelTrade(this.state, action);
        break;

      case ACTION_TYPES.END_TRADING:
        this.turnSystem.manuallyEndPhase(this.state, this.managers);
        break;

      case ACTION_TYPES.REVEAL_GOAL:
        this.goalResolutionManager.revealGoal(this.state, action);
        break;

      case ACTION_TYPES.EXECUTE_REWARD:
        this.goalResolutionManager.executeReward(this.state, action);
        break;

      case ACTION_TYPES.SELECT_CARDS_TO_SELL:
        this.sellManager.selectCardsToSell(this.state, action);
        break;

      case ACTION_TYPES.COMMIT_SELL:
        this.sellManager.commitSell(this.state, action);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Subscribe to game events
   * @param {string} eventType - Event type (or '*' for all events)
   * @param {Function} handler - Event handler
   */
  on(eventType, handler) {
    this.eventEmitter.on(eventType, handler);
  }

  /**
   * Unsubscribe from game events
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   */
  off(eventType, handler) {
    this.eventEmitter.off(eventType, handler);
  }

  /**
   * Get current game state
   * @returns {Object} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get state filtered for a specific player (hides hidden information)
   * @param {string} playerId - Player ID
   * @returns {Object} Filtered state
   */
  getVisibleState(playerId) {
    return GameState.filterForPlayer(this.state, playerId);
  }

  /**
   * Get available actions for a player
   * @param {string} playerId - Player ID
   * @returns {Array} Array of available action types
   */
  getAvailableActions(playerId) {
    const actions = [];

    if (!this.state || this.state.status !== GAME_STATUS.IN_PROGRESS) {
      return actions;
    }

    switch (this.state.currentPhase) {
      case PHASES.AUCTION:
        actions.push(ACTION_TYPES.PLACE_BID);
        actions.push(ACTION_TYPES.PASS);
        break;

      case PHASES.TRADING:
        actions.push(ACTION_TYPES.PROPOSE_TRADE);
        actions.push(ACTION_TYPES.ACCEPT_TRADE);
        actions.push(ACTION_TYPES.CANCEL_TRADE);
        actions.push(ACTION_TYPES.END_TRADING);
        break;

      case PHASES.GOAL_RESOLUTION:
        const goalResolution = this.state.phaseState.goalResolution;
        const currentPlayerId = this.state.turnOrder[goalResolution.currentPlayerIndex];

        if (currentPlayerId === playerId) {
          if (goalResolution.pendingRewardExecution) {
            actions.push(ACTION_TYPES.EXECUTE_REWARD);
          } else {
            actions.push(ACTION_TYPES.REVEAL_GOAL);
          }
        }
        break;

      case PHASES.SELL:
        actions.push(ACTION_TYPES.SELECT_CARDS_TO_SELL);
        actions.push(ACTION_TYPES.COMMIT_SELL);
        break;
    }

    return actions;
  }

  /**
   * Get final scores
   * @returns {Array} Final scores
   */
  getFinalScores() {
    if (this.state.status !== GAME_STATUS.COMPLETED) {
      throw new Error('Game not yet completed');
    }

    return GameState.getFinalScores(this.state);
  }

  /**
   * Check if game is over
   * @returns {boolean} True if game is over
   */
  isGameOver() {
    return this.state && this.state.status === GAME_STATUS.COMPLETED;
  }
}
