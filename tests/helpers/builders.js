/**
 * Test Data Builders
 * Factory functions for creating test data
 */

import { ResourceCard } from '../../src/models/ResourceCard.js';
import { GoalCard } from '../../src/models/GoalCard.js';
import { COLORS } from '../../src/utils/Constants.js';

/**
 * Create a test player
 * @param {Object} overrides - Properties to override
 * @returns {Object} Player object
 */
export function createPlayer(overrides = {}) {
  const defaults = {
    id: 'player1',
    name: 'Test Player',
    cash: 5,
    hand: [],
    goalCards: [],
    sellBonus: 0,
    pendingSellSelection: null
  };

  return { ...defaults, ...overrides };
}

/**
 * Create multiple test players
 * @param {number} count - Number of players to create
 * @param {Object} overrides - Properties to override for all players
 * @returns {Array} Array of player objects
 */
export function createPlayers(count = 3, overrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    createPlayer({
      id: `player${i + 1}`,
      name: `Player ${i + 1}`,
      ...overrides
    })
  );
}

/**
 * Create a resource card
 * @param {string} color - Card color
 * @param {Object} data - Additional card data
 * @returns {ResourceCard} Resource card
 */
export function createResourceCard(color = 'Blue', data = {}) {
  return new ResourceCard(color, data);
}

/**
 * Create multiple resource cards
 * @param {string} color - Card color
 * @param {number} count - Number of cards to create
 * @returns {Array<ResourceCard>} Array of resource cards
 */
export function createResourceCards(color = 'Blue', count = 5) {
  return Array.from({ length: count }, () => createResourceCard(color));
}

/**
 * Create a resource deck with specified distribution
 * @param {Object} distribution - Color distribution (e.g., { Blue: 10, Orange: 10 })
 * @returns {Array<ResourceCard>} Array of resource cards
 */
export function createResourceDeck(distribution = null) {
  const defaultDistribution = {
    Blue: 10,
    Orange: 10,
    Yellow: 10,
    Purple: 10
  };

  const dist = distribution || defaultDistribution;
  const deck = [];

  for (const [color, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i++) {
      deck.push(createResourceCard(color));
    }
  }

  return deck;
}

/**
 * Create a goal card
 * @param {Object} overrides - Properties to override
 * @returns {GoalCard} Goal card
 */
export function createGoalCard(overrides = {}) {
  const defaults = {
    stockChange: {
      text: 'Blue +1',
      parsed: { Blue: 1 },
      type: 'single_up'
    },
    goal: {
      text: '2 Blue',
      parsed: {
        type: 'pair',
        requirements: { Blue: 2 }
      }
    },
    reward: {
      text: 'Gain $1',
      parsed: {
        type: 'gain_cash',
        amount: 1,
        requiresTarget: false,
        requiresChoice: false,
        value: 1
      }
    },
    metadata: {
      goalType: 'pair',
      rewardTier: 'low',
      difficultyPoints: 1,
      stockChangePenalty: 0,
      score: 1
    }
  };

  return new GoalCard({ ...defaults, ...overrides });
}

/**
 * Create a goal card with specific stock change
 * @param {Object} stockChange - Stock change object
 * @returns {GoalCard} Goal card
 */
export function createGoalCardWithStockChange(stockChange) {
  return createGoalCard({ stockChange });
}

/**
 * Create a goal card with specific goal requirements
 * @param {string} type - Goal type
 * @param {Object} requirements - Requirements object
 * @returns {GoalCard} Goal card
 */
export function createGoalCardWithGoal(type, requirements) {
  return createGoalCard({
    goal: {
      text: formatGoalText(requirements),
      parsed: { type, requirements }
    },
    metadata: {
      goalType: type,
      rewardTier: 'low',
      difficultyPoints: 1,
      stockChangePenalty: 0,
      score: 1
    }
  });
}

/**
 * Create a goal card with specific reward
 * @param {Object} reward - Reward object
 * @returns {GoalCard} Goal card
 */
export function createGoalCardWithReward(reward) {
  return createGoalCard({ reward });
}

/**
 * Format goal requirements to text
 * @param {Object} requirements - Requirements object
 * @returns {string} Formatted text
 */
function formatGoalText(requirements) {
  return Object.entries(requirements)
    .map(([color, count]) => `${count} ${color}`)
    .join(' + ');
}

/**
 * Create stock prices object
 * @param {number} defaultPrice - Default price for all colors
 * @returns {Object} Stock prices
 */
export function createStockPrices(defaultPrice = 4) {
  return {
    Blue: defaultPrice,
    Orange: defaultPrice,
    Yellow: defaultPrice,
    Purple: defaultPrice
  };
}

/**
 * Create stock prices with specific values
 * @param {Object} prices - Price overrides
 * @returns {Object} Stock prices
 */
export function createCustomStockPrices(prices = {}) {
  return {
    ...createStockPrices(),
    ...prices
  };
}

/**
 * Create game config
 * @param {Object} overrides - Properties to override
 * @returns {Object} Game config
 */
export function createGameConfig(overrides = {}) {
  const defaults = {
    startingCash: 5,
    startingResourceCards: 2,
    startingGoalCards: 3,
    auctionCardCount: null, // Will be set based on player count
    tradingTimeLimit: 120,
    minStockPrice: 0,
    maxStockPrice: null,
    startingStockPrice: 4,
    totalRounds: 3
  };

  return { ...defaults, ...overrides };
}

/**
 * Create a minimal game state for testing
 * @param {Object} overrides - Properties to override
 * @returns {Object} Game state
 */
export function createGameState(overrides = {}) {
  const defaults = {
    players: createPlayers(3),
    resourceDeck: createResourceDeck(),
    goalDeck: [],
    discardPile: [],
    stockPrices: createStockPrices(),
    currentPhase: 'auction',
    currentRound: 1,
    currentPlayerIndex: 0,
    config: createGameConfig(),
    phaseState: {},
    history: [],
    gameStarted: false,
    gameEnded: false
  };

  return { ...defaults, ...overrides };
}

/**
 * Create an auction state
 * @param {Object} overrides - Properties to override
 * @returns {Object} Auction state
 */
export function createAuctionState(overrides = {}) {
  const defaults = {
    revealedCards: [createResourceCard('Blue')],
    currentCardIndex: 0,
    currentBid: 0,
    currentBidder: null,
    activeBidders: new Set(['player1', 'player2', 'player3']),
    startingPlayer: 'player1',
    biddingOrder: ['player1', 'player2', 'player3']
  };

  return { ...defaults, ...overrides };
}

/**
 * Create a trade offer
 * @param {Object} overrides - Properties to override
 * @returns {Object} Trade offer
 */
export function createTradeOffer(overrides = {}) {
  const defaults = {
    id: 'offer-1',
    playerId: 'player1',
    offering: {
      cards: [],
      cash: 0
    },
    requesting: {
      cards: [],
      cash: 0
    },
    timestamp: Date.now()
  };

  return { ...defaults, ...overrides };
}
