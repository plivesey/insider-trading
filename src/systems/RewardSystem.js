/**
 * Reward System - handles interactive reward execution
 */
import { EVENT_TYPES, REWARD_TYPES } from '../utils/Constants.js';
import { GameState } from '../core/GameState.js';

export class RewardSystem {
  constructor(eventEmitter, deckManager, stockPriceSystem) {
    this.eventEmitter = eventEmitter;
    this.deckManager = deckManager;
    this.stockPriceSystem = stockPriceSystem;
  }

  /**
   * Execute a reward
   * @param {Object} state - Game state
   * @param {string} playerId - Player executing reward
   * @param {Object} rewardParsed - Parsed reward info
   * @param {Object} choices - Player choices (if reward requires input)
   * @returns {boolean} True if reward executed, false if waiting for input
   */
  executeReward(state, playerId, rewardParsed, choices = null) {
    const rewardType = rewardParsed.type;

    // Check if reward needs input and choices not provided
    if ((rewardParsed.requiresTarget || rewardParsed.requiresChoice) && !choices) {
      return false; // Need to wait for player input
    }

    switch (rewardType) {
      case REWARD_TYPES.GAIN_CASH:
        return this.executeGainCash(state, playerId, rewardParsed.amount || 1);

      case REWARD_TYPES.STEAL_CASH:
        return this.executeStealCash(state, playerId, choices.targetPlayerId, rewardParsed.amount || 1);

      case REWARD_TYPES.ADJUST_STOCK:
        return this.executeAdjustStock(state, choices.color, choices.direction, 1);

      case REWARD_TYPES.LOOK_AT_GOAL_CARD:
        return this.executeLookAtGoalCard(state, playerId, choices.targetPlayerId);

      case REWARD_TYPES.CHOOSE_INVESTIGATION:
        // TODO: Implement choose_investigation - player chooses which investigation to perform
        return this.executeChooseInvestigation(state, playerId, choices);

      case REWARD_TYPES.NEXT_AUCTION_DISCOUNT:
        // TODO: Implement next_auction_discount - player gets discount on next auction purchase
        return this.executeNextAuctionDiscount(state, playerId, rewardParsed);

      case REWARD_TYPES.EXTRA_TURN:
        // TODO: Implement extra_turn - player gets an extra turn
        return this.executeExtraTurn(state, playerId);

      case REWARD_TYPES.SWAP_WITH_FACE_UP:
        // TODO: Implement swap_with_face_up - swap a card with a face-up card
        return this.executeSwapWithFaceUp(state, playerId, choices);

      case REWARD_TYPES.ADJUST_STOCK_2:
        return this.executeAdjustStock(state, choices.color, choices.direction, 2);

      case REWARD_TYPES.PEEK_AND_REARRANGE_5:
        // TODO: Implement peek_and_rearrange_5 - peek at top 5 and rearrange
        return this.executePeekAndRearrange5(state, playerId, choices);

      default:
        console.warn(`Unknown reward type: ${rewardType}`);
        return true; // Mark as complete
    }
  }

  /**
   * Gain cash reward
   */
  executeGainCash(state, playerId, amount) {
    GameState.adjustPlayerCash(state, playerId, amount);

    this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
      playerId,
      newCash: GameState.getPlayer(state, playerId).cash,
      reason: 'reward'
    });

    return true;
  }

  /**
   * Steal cash from another player
   */
  executeStealCash(state, playerId, targetPlayerId, amount) {
    const target = GameState.getPlayer(state, targetPlayerId);
    const actualAmount = Math.min(amount, target.cash);

    GameState.adjustPlayerCash(state, targetPlayerId, -actualAmount);
    GameState.adjustPlayerCash(state, playerId, actualAmount);

    this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
      playerId: targetPlayerId,
      newCash: target.cash,
      reason: 'stolen'
    });

    this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
      playerId,
      newCash: GameState.getPlayer(state, playerId).cash,
      reason: 'reward'
    });

    return true;
  }

  /**
   * Adjust any stock by ±amount
   */
  executeAdjustStock(state, color, direction, amount = 1) {
    const change = direction * amount;
    const changes = { [color]: change };
    state.stockPrices = this.stockPriceSystem.applyChanges(state.stockPrices, changes);

    this.eventEmitter.emit(EVENT_TYPES.STOCK_PRICES_UPDATED, {
      changes,
      newPrices: state.stockPrices,
      reason: 'reward'
    });

    return true;
  }

  /**
   * Look at another player's goal card
   */
  executeLookAtGoalCard(state, playerId, targetPlayerId) {
    const target = GameState.getPlayer(state, targetPlayerId);

    this.eventEmitter.emit(EVENT_TYPES.REWARD_EXECUTED, {
      type: 'look_at_goal_card',
      playerId,
      targetPlayerId,
      goalCards: target.goalCards
    });

    return true;
  }

  /**
   * Choose investigation reward
   * TODO: Full implementation needed
   */
  executeChooseInvestigation(state, playerId, choices) {
    this.eventEmitter.emit(EVENT_TYPES.REWARD_EXECUTED, {
      type: 'choose_investigation',
      playerId
    });

    return true;
  }

  /**
   * Next auction discount reward
   * TODO: Full implementation needed
   */
  executeNextAuctionDiscount(state, playerId, rewardParsed) {
    const player = GameState.getPlayer(state, playerId);
    player.nextAuctionDiscount = rewardParsed.amount || 1;

    this.eventEmitter.emit(EVENT_TYPES.REWARD_EXECUTED, {
      type: 'next_auction_discount',
      playerId,
      discount: player.nextAuctionDiscount
    });

    return true;
  }

  /**
   * Extra turn reward
   * TODO: Full implementation needed
   */
  executeExtraTurn(state, playerId) {
    this.eventEmitter.emit(EVENT_TYPES.REWARD_EXECUTED, {
      type: 'extra_turn',
      playerId
    });

    return true;
  }

  /**
   * Swap with face-up card reward
   * TODO: Full implementation needed
   */
  executeSwapWithFaceUp(state, playerId, choices) {
    this.eventEmitter.emit(EVENT_TYPES.REWARD_EXECUTED, {
      type: 'swap_with_face_up',
      playerId
    });

    return true;
  }

  /**
   * Peek at top 5 cards and rearrange them
   * TODO: Full implementation needed
   */
  executePeekAndRearrange5(state, playerId, choices) {
    this.eventEmitter.emit(EVENT_TYPES.REWARD_EXECUTED, {
      type: 'peek_and_rearrange_5',
      playerId
    });

    return true;
  }
}
