/**
 * Game State - central state management and helper methods
 */
import { uuid } from '../utils/uuid.js';
import { GAME_STATUS, PHASES, DEFAULT_CONFIG, COLORS } from '../utils/Constants.js';

export class GameState {
  /**
   * Create initial game state
   * @param {Object} config - Game configuration
   * @param {Array} players - Array of player info {id, name}
   * @returns {Object} Initial game state
   */
  static createInitialState(config = {}, players = []) {
    const gameConfig = { ...DEFAULT_CONFIG, ...config };

    return {
      gameId: uuid(),
      status: GAME_STATUS.NOT_STARTED,
      currentRound: 1,
      currentPhase: null,

      players: players.map((p, index) => ({
        id: p.id || uuid(),
        name: p.name || `Player ${index + 1}`,
        cash: gameConfig.startingCash,
        hand: [],
        goalCards: [],
        isActive: true,
        turnOrder: index,
        sellBonus: 0 // For sell phase bonus rewards
      })),

      stockPrices: this.createInitialPrices(gameConfig.startingStockPrice),

      resourceDeck: {
        drawPile: [],
        discardPile: []
      },

      goalDeck: {
        undealt: []
      },

      phaseState: {
        auction: null,
        trading: null,
        goalResolution: null,
        sell: null
      },

      turnOrder: players.map((p, i) => p.id || `player-${i}`),
      currentPlayerIndex: 0,
      dealerIndex: 0,

      history: [],
      config: gameConfig
    };
  }

  /**
   * Create initial stock prices
   * @param {number} price - Starting price
   * @returns {Object} Stock prices
   */
  static createInitialPrices(price) {
    const prices = {};
    for (const color of COLORS) {
      prices[color] = price;
    }
    return prices;
  }

  /**
   * Get a player by ID
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @returns {Object|null} Player or null
   */
  static getPlayer(state, playerId) {
    return state.players.find(p => p.id === playerId) || null;
  }

  /**
   * Get current player (based on currentPlayerIndex)
   * @param {Object} state - Game state
   * @returns {Object|null} Current player
   */
  static getCurrentPlayer(state) {
    const playerId = state.turnOrder[state.currentPlayerIndex];
    return this.getPlayer(state, playerId);
  }

  /**
   * Add cash to a player
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @param {number} amount - Amount to add (can be negative)
   */
  static adjustPlayerCash(state, playerId, amount) {
    const player = this.getPlayer(state, playerId);
    if (player) {
      player.cash += amount;
      if (player.cash < 0) {
        player.cash = 0; // Can't go negative
      }
    }
  }

  /**
   * Add a card to player's hand
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @param {Object} card - Card to add
   */
  static addCardToHand(state, playerId, card) {
    const player = this.getPlayer(state, playerId);
    if (player) {
      player.hand.push(card);
    }
  }

  /**
   * Remove a card from player's hand
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @param {string} cardId - Card ID to remove
   * @returns {Object|null} Removed card or null
   */
  static removeCardFromHand(state, playerId, cardId) {
    const player = this.getPlayer(state, playerId);
    if (!player) return null;

    const index = player.hand.findIndex(c => c.id === cardId);
    if (index === -1) return null;

    const [removedCard] = player.hand.splice(index, 1);
    return removedCard;
  }

  /**
   * Remove cards of a specific color from player's hand
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @param {string} color - Color to remove
   * @param {number} count - Number to remove
   * @returns {Array} Removed cards
   */
  static removeCardsByColor(state, playerId, color, count) {
    const player = this.getPlayer(state, playerId);
    if (!player) return [];

    const removed = [];
    const cardsOfColor = player.hand.filter(c => c.color === color);

    for (let i = 0; i < Math.min(count, cardsOfColor.length); i++) {
      const card = cardsOfColor[i];
      const index = player.hand.indexOf(card);
      if (index !== -1) {
        player.hand.splice(index, 1);
        removed.push(card);
      }
    }

    return removed;
  }

  /**
   * Add a goal card to player
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @param {Object} goalCard - Goal card to add
   */
  static addGoalCard(state, playerId, goalCard) {
    const player = this.getPlayer(state, playerId);
    if (player) {
      player.goalCards.push(goalCard);
    }
  }

  /**
   * Calculate player's total wealth (cash + card values)
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @returns {number} Total wealth
   */
  static calculatePlayerWealth(state, playerId) {
    const player = this.getPlayer(state, playerId);
    if (!player) return 0;

    let wealth = player.cash;

    // Add value of resource cards
    for (const card of player.hand) {
      if (card.color && state.stockPrices[card.color] !== undefined) {
        wealth += state.stockPrices[card.color];
      }
    }

    return wealth;
  }

  /**
   * Get final scores for all players
   * @param {Object} state - Game state
   * @returns {Array} Array of {playerId, name, wealth} sorted by wealth descending
   */
  static getFinalScores(state) {
    return state.players
      .map(p => ({
        playerId: p.id,
        name: p.name,
        wealth: this.calculatePlayerWealth(state, p.id),
        cash: p.cash,
        cardValue: this.calculatePlayerWealth(state, p.id) - p.cash
      }))
      .sort((a, b) => b.wealth - a.wealth);
  }

  /**
   * Record an action in history
   * @param {Object} state - Game state
   * @param {Object} action - Action that was taken
   */
  static recordAction(state, action) {
    state.history.push({
      timestamp: Date.now(),
      round: state.currentRound,
      phase: state.currentPhase,
      action: action
    });
  }

  /**
   * Advance to next round
   * @param {Object} state - Game state
   */
  static advanceRound(state) {
    state.currentRound++;
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
  }

  /**
   * Check if game is over
   * @param {Object} state - Game state
   * @returns {boolean} True if game is over
   */
  static isGameOver(state) {
    return state.currentRound > state.config.totalRounds;
  }

  /**
   * Create a deep copy of state (for testing/debugging)
   * @param {Object} state - Game state
   * @returns {Object} Deep copy of state
   */
  static clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Filter state for a specific player (hide hidden information)
   * @param {Object} state - Full game state
   * @param {string} playerId - Player to filter for
   * @returns {Object} Filtered state
   */
  static filterForPlayer(state, playerId) {
    return {
      ...state,
      players: state.players.map(p => {
        if (p.id === playerId) {
          // Own cards are visible
          return { ...p };
        } else {
          // Hide other players' cards
          return {
            ...p,
            hand: p.hand.map(() => ({ type: 'resource', color: 'hidden' })),
            goalCards: p.goalCards.map(g =>
              g.revealed ? { ...g } : { type: 'goal', revealed: false }
            )
          };
        }
      }),
      resourceDeck: {
        drawPile: state.resourceDeck.drawPile.map(() => ({ type: 'resource', color: 'hidden' })),
        discardPile: state.resourceDeck.discardPile
      },
      goalDeck: {
        undealt: state.goalDeck.undealt.map(() => ({ type: 'goal' }))
      }
    };
  }
}
