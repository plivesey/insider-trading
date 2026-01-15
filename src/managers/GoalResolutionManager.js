/**
 * Goal Resolution Manager - handles sequential goal reveal and resolution
 */
import { EVENT_TYPES, COLORS } from '../utils/Constants.js';
import { GameState } from '../core/GameState.js';
import { GoalParser } from '../parsers/GoalParser.js';

export class GoalResolutionManager {
  constructor(eventEmitter, rewardSystem, stockPriceSystem) {
    this.eventEmitter = eventEmitter;
    this.rewardSystem = rewardSystem;
    this.stockPriceSystem = stockPriceSystem;
  }

  /**
   * Initialize goal resolution phase
   * @param {Object} state - Game state
   */
  initializeGoalResolution(state) {
    state.phaseState.goalResolution = {
      currentPlayerIndex: 0,
      revealedGoals: [],
      pendingRewardExecution: null
    };

    this.eventEmitter.emit(EVENT_TYPES.GOAL_RESOLUTION_STARTED, {
      playerOrder: state.turnOrder
    });
  }

  /**
   * Player reveals a goal card
   * @param {Object} state - Game state
   * @param {Object} action - { playerId, goalCardId }
   */
  revealGoal(state, action) {
    const { playerId, goalCardId } = action;
    const player = GameState.getPlayer(state, playerId);

    const goalCard = player.goalCards.find(g => g.id === goalCardId);
    if (!goalCard) {
      return;
    }

    // Mark card as revealed
    goalCard.revealed = true;

    this.eventEmitter.emit(EVENT_TYPES.GOAL_REVEALED, {
      playerId,
      goalCard
    });

    // Apply stock change immediately
    this.applyStockChange(state, goalCard);

    // Check if goal is met
    const goalMet = GoalParser.checkGoal(goalCard, player.hand);

    this.eventEmitter.emit(EVENT_TYPES.GOAL_CHECKED, {
      playerId,
      goalCard,
      goalMet
    });

    // Record revealed goal
    const goalResolution = state.phaseState.goalResolution;
    goalResolution.revealedGoals.push({
      playerId,
      goalCard,
      goalMet,
      rewardExecuted: false
    });

    // If goal met, execute reward
    if (goalMet) {
      this.initiateRewardExecution(state, playerId, goalCard);
    } else {
      // Move to next player
      this.advanceToNextPlayer(state);
    }
  }

  /**
   * Apply stock change from a goal card
   * @param {Object} state - Game state
   * @param {Object} goalCard - Goal card
   */
  applyStockChange(state, goalCard) {
    const stockChangeParsed = goalCard.metadata.stockChangeParsed;

    if (stockChangeParsed && Object.keys(stockChangeParsed).length > 0) {
      state.stockPrices = this.stockPriceSystem.applyChanges(state.stockPrices, stockChangeParsed);

      this.eventEmitter.emit(EVENT_TYPES.STOCK_PRICES_UPDATED, {
        changes: stockChangeParsed,
        newPrices: state.stockPrices,
        reason: 'goal_revealed'
      });
    }
  }

  /**
   * Initiate reward execution
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @param {Object} goalCard - Goal card
   */
  initiateRewardExecution(state, playerId, goalCard) {
    const rewardParsed = goalCard.metadata.rewardParsed;

    this.eventEmitter.emit(EVENT_TYPES.REWARD_AVAILABLE, {
      playerId,
      rewardType: rewardParsed.type,
      requiresInput: rewardParsed.requiresTarget || rewardParsed.requiresChoice
    });

    // Try to execute reward
    const executed = this.rewardSystem.executeReward(state, playerId, rewardParsed);

    if (executed) {
      // Reward executed immediately
      this.completeRewardExecution(state, playerId);
    } else {
      // Reward needs player input - pause and wait
      const goalResolution = state.phaseState.goalResolution;
      goalResolution.pendingRewardExecution = {
        playerId,
        rewardType: rewardParsed.type,
        goalCard
      };
    }
  }

  /**
   * Execute a pending reward with player choices
   * @param {Object} state - Game state
   * @param {Object} action - { playerId, choices }
   */
  executeReward(state, action) {
    const { playerId, choices } = action;
    const goalResolution = state.phaseState.goalResolution;

    if (!goalResolution.pendingRewardExecution) {
      return;
    }

    const pending = goalResolution.pendingRewardExecution;
    const goalCard = pending.goalCard;
    const rewardParsed = goalCard.metadata.rewardParsed;

    // Execute reward with choices
    const executed = this.rewardSystem.executeReward(state, playerId, rewardParsed, choices);

    if (executed) {
      this.completeRewardExecution(state, playerId);
    }
  }

  /**
   * Complete reward execution and advance
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   */
  completeRewardExecution(state, playerId) {
    const goalResolution = state.phaseState.goalResolution;

    // Mark reward as executed
    const revealedGoal = goalResolution.revealedGoals.find(g => g.playerId === playerId && !g.rewardExecuted);
    if (revealedGoal) {
      revealedGoal.rewardExecuted = true;
    }

    this.eventEmitter.emit(EVENT_TYPES.REWARD_EXECUTED, {
      playerId
    });

    // Clear pending reward
    goalResolution.pendingRewardExecution = null;

    this.eventEmitter.emit(EVENT_TYPES.GOAL_RESOLUTION_PLAYER_COMPLETE, {
      playerId
    });

    // Advance to next player
    this.advanceToNextPlayer(state);
  }

  /**
   * Advance to next player in goal resolution
   * @param {Object} state - Game state
   */
  advanceToNextPlayer(state) {
    const goalResolution = state.phaseState.goalResolution;

    goalResolution.currentPlayerIndex++;

    if (goalResolution.currentPlayerIndex >= state.players.length) {
      // All players have resolved
      this.eventEmitter.emit(EVENT_TYPES.GOAL_RESOLUTION_PHASE_COMPLETE, {});
    }
  }

  /**
   * Check if goal resolution phase is complete
   * @param {Object} state - Game state
   * @returns {boolean} True if complete
   */
  isGoalResolutionComplete(state) {
    const goalResolution = state.phaseState.goalResolution;
    return goalResolution &&
           goalResolution.currentPlayerIndex >= state.players.length &&
           !goalResolution.pendingRewardExecution;
  }

  /**
   * Check if waiting for player input on reward
   * @param {Object} state - Game state
   * @returns {boolean} True if waiting
   */
  isWaitingForRewardInput(state) {
    const goalResolution = state.phaseState.goalResolution;
    return goalResolution && goalResolution.pendingRewardExecution !== null;
  }
}
