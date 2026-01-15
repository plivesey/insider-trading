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
        return this.executeAdjustStock(state, choices.color, choices.direction);

      case REWARD_TYPES.LOOK_AT_HAND:
        return this.executeLookAtHand(state, playerId, choices.targetPlayerId);

      case REWARD_TYPES.PEEK_AND_PLACE:
        return this.executePeekAndPlace(state, playerId, choices.placement);

      case REWARD_TYPES.SWAP_WITH_DECK:
        return this.executeSwapWithDeck(state, playerId, choices.cardId);

      case REWARD_TYPES.REARRANGE_TOP_5:
        return this.executeRearrangeTop5(state, choices.newOrder);

      case REWARD_TYPES.TAKE_AND_GIVE_CARD:
        return this.executeTakeAndGiveCard(state, playerId, choices);

      case REWARD_TYPES.BUY_WITH_DISCOUNT:
        return this.executeBuyWithDiscount(state, playerId, choices.color, rewardParsed.discount || 1);

      case REWARD_TYPES.SELL_BONUS:
        return this.executeSellBonus(state, playerId, rewardParsed.bonus || 1);

      case REWARD_TYPES.GAIN_LOWEST_STOCK:
        return this.executeGainLowestStock(state, playerId);

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
   * Adjust any stock by ±1
   */
  executeAdjustStock(state, color, direction) {
    const changes = { [color]: direction };
    state.stockPrices = this.stockPriceSystem.applyChanges(state.stockPrices, changes);

    this.eventEmitter.emit(EVENT_TYPES.STOCK_PRICES_UPDATED, {
      changes,
      newPrices: state.stockPrices,
      reason: 'reward'
    });

    return true;
  }

  /**
   * Look at another player's hand (UI-only, no state change)
   */
  executeLookAtHand(state, playerId, targetPlayerId) {
    const target = GameState.getPlayer(state, targetPlayerId);

    // This is handled by the UI - just emit event with hand info
    this.eventEmitter.emit(EVENT_TYPES.REWARD_EXECUTED, {
      type: 'look_at_hand',
      playerId,
      targetPlayerId,
      hand: target.hand
    });

    return true;
  }

  /**
   * Peek at top card and place on top or bottom
   */
  executePeekAndPlace(state, playerId, placement) {
    const topCard = this.deckManager.peekTop(state.resourceDeck, 1)[0];

    if (!topCard) {
      return true; // Deck empty, nothing to do
    }

    if (placement === 'bottom') {
      const card = this.deckManager.draw(state.resourceDeck, 1)[0];
      this.deckManager.placeOnBottom(state.resourceDeck, card);
    }

    // If 'top', do nothing (card stays on top)

    return true;
  }

  /**
   * Swap one of your cards with top of deck
   */
  executeSwapWithDeck(state, playerId, cardId) {
    const cardFromHand = GameState.removeCardFromHand(state, playerId, cardId);

    if (!cardFromHand) {
      return true; // Card not found, skip
    }

    try {
      const topCard = this.deckManager.swapWithTop(state.resourceDeck, cardFromHand);
      GameState.addCardToHand(state, playerId, topCard);
    } catch (error) {
      // Deck empty, just put card back
      GameState.addCardToHand(state, playerId, cardFromHand);
    }

    return true;
  }

  /**
   * Rearrange top 5 cards
   */
  executeRearrangeTop5(state, newOrder) {
    try {
      this.deckManager.rearrangeTop(state.resourceDeck, newOrder);
    } catch (error) {
      console.warn('Failed to rearrange cards:', error.message);
    }

    return true;
  }

  /**
   * Take random card from another player and give them one of your choice
   */
  executeTakeAndGiveCard(state, playerId, choices) {
    const { targetPlayerId, cardIdToGive } = choices;

    const target = GameState.getPlayer(state, targetPlayerId);
    if (!target || target.hand.length === 0) {
      return true; // No cards to take
    }

    // Take random card from target
    const randomIndex = Math.floor(Math.random() * target.hand.length);
    const takenCard = target.hand[randomIndex];
    GameState.removeCardFromHand(state, targetPlayerId, takenCard.id);
    GameState.addCardToHand(state, playerId, takenCard);

    // Give card to target
    const cardToGive = GameState.removeCardFromHand(state, playerId, cardIdToGive);
    if (cardToGive) {
      GameState.addCardToHand(state, targetPlayerId, cardToGive);
    }

    return true;
  }

  /**
   * Buy a stock for discounted price
   */
  executeBuyWithDiscount(state, playerId, color, discount) {
    const price = state.stockPrices[color];
    const discountedPrice = Math.max(0, price - discount);

    const player = GameState.getPlayer(state, playerId);
    if (player.cash < discountedPrice) {
      // Can't afford even with discount
      return true;
    }

    // Draw a card of the specified color from deck
    const colorCards = state.resourceDeck.drawPile.filter(c => c.color === color);

    if (colorCards.length > 0) {
      const card = colorCards[0];
      const cardIndex = state.resourceDeck.drawPile.indexOf(card);
      state.resourceDeck.drawPile.splice(cardIndex, 1);

      GameState.addCardToHand(state, playerId, card);
      GameState.adjustPlayerCash(state, playerId, -discountedPrice);

      this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
        playerId,
        newCash: player.cash,
        reason: 'buy_with_discount'
      });
    }

    return true;
  }

  /**
   * All cards sold this round get +$1 bonus
   */
  executeSellBonus(state, playerId, bonus) {
    const player = GameState.getPlayer(state, playerId);
    player.sellBonus = bonus;

    return true;
  }

  /**
   * Gain a card of the lowest value stock
   */
  executeGainLowestStock(state, playerId) {
    const lowestColors = this.stockPriceSystem.getLowestPriceColors(state.stockPrices);

    // Pick random color from lowest
    const color = lowestColors[Math.floor(Math.random() * lowestColors.length)];

    // Find card of that color in deck
    const colorCards = state.resourceDeck.drawPile.filter(c => c.color === color);

    if (colorCards.length > 0) {
      const card = colorCards[0];
      const cardIndex = state.resourceDeck.drawPile.indexOf(card);
      state.resourceDeck.drawPile.splice(cardIndex, 1);

      GameState.addCardToHand(state, playerId, card);

      this.eventEmitter.emit(EVENT_TYPES.PLAYER_RECEIVED_CARD, {
        playerId,
        cardCount: 1
      });
    }

    return true;
  }
}
