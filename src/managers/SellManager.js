/**
 * Sell Manager - handles simultaneous sell phase
 */
import { EVENT_TYPES } from '../utils/Constants.js';
import { GameState } from '../core/GameState.js';

export class SellManager {
  constructor(eventEmitter, deckManager) {
    this.eventEmitter = eventEmitter;
    this.deckManager = deckManager;
  }

  /**
   * Initialize sell phase
   * @param {Object} state - Game state
   */
  initializeSell(state) {
    const playerSelections = {};

    for (const player of state.players) {
      playerSelections[player.id] = {
        cardsToSell: [],
        committed: false
      };
    }

    state.phaseState.sell = {
      playerSelections,
      allCommitted: false
    };

    this.eventEmitter.emit(EVENT_TYPES.SELL_PHASE_STARTED, {});
  }

  /**
   * Player selects cards to sell
   * @param {Object} state - Game state
   * @param {Object} action - { playerId, cardIds }
   */
  selectCardsToSell(state, action) {
    const { playerId, cardIds } = action;
    const sell = state.phaseState.sell;

    if (!sell.playerSelections[playerId]) {
      return;
    }

    sell.playerSelections[playerId].cardsToSell = cardIds || [];

    this.eventEmitter.emit(EVENT_TYPES.CARDS_SELECTED_TO_SELL, {
      playerId,
      cardCount: cardIds ? cardIds.length : 0
    });
  }

  /**
   * Player commits their sell selection
   * @param {Object} state - Game state
   * @param {Object} action - { playerId }
   */
  commitSell(state, action) {
    const { playerId } = action;
    const sell = state.phaseState.sell;

    if (!sell.playerSelections[playerId]) {
      return;
    }

    sell.playerSelections[playerId].committed = true;

    this.eventEmitter.emit(EVENT_TYPES.PLAYER_COMMITTED_SELL, {
      playerId
    });

    // Check if all players committed
    const allCommitted = Object.values(sell.playerSelections).every(s => s.committed);

    if (allCommitted) {
      sell.allCommitted = true;
      this.eventEmitter.emit(EVENT_TYPES.ALL_SELLS_COMMITTED, {});
      this.executeSells(state);
    }
  }

  /**
   * Execute all sells simultaneously
   * @param {Object} state - Game state
   */
  executeSells(state) {
    const sell = state.phaseState.sell;
    const sales = [];

    for (const [playerId, selection] of Object.entries(sell.playerSelections)) {
      const player = GameState.getPlayer(state, playerId);
      if (!player) continue;

      const cardsToSell = [];
      let earnings = 0;

      // Sell each card
      for (const cardId of selection.cardsToSell) {
        const card = GameState.removeCardFromHand(state, playerId, cardId);
        if (card && card.color) {
          const price = state.stockPrices[card.color];
          let salePrice = price;

          // Apply sell bonus if player has one
          if (player.sellBonus > 0) {
            salePrice += player.sellBonus;
          }

          earnings += salePrice;
          cardsToSell.push({ ...card, price, salePrice });

          // Discard the card
          this.deckManager.discard(state.resourceDeck, [card]);
        }
      }

      // Add earnings to player
      if (earnings > 0) {
        GameState.adjustPlayerCash(state, playerId, earnings);

        this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
          playerId,
          newCash: player.cash,
          reason: 'sold_cards'
        });
      }

      // Reset sell bonus
      if (player.sellBonus > 0) {
        player.sellBonus = 0;
      }

      sales.push({
        playerId,
        cards: cardsToSell,
        earnings
      });
    }

    this.eventEmitter.emit(EVENT_TYPES.SELLS_REVEALED, {
      sales
    });

    this.eventEmitter.emit(EVENT_TYPES.SELL_PHASE_COMPLETE, {});
  }

  /**
   * Check if all players have committed
   * @param {Object} state - Game state
   * @returns {boolean} True if all committed
   */
  areAllCommitted(state) {
    const sell = state.phaseState.sell;
    return sell && sell.allCommitted;
  }
}
