/**
 * BaseAI - Abstract base class for AI players
 * Provides core decision-making framework and helper methods
 */
import { GoalParser } from '../../src/parsers/GoalParser.js';
import { PHASES, COLORS } from '../../src/utils/Constants.js';

export class BaseAI {
  constructor(playerId, name) {
    this.playerId = playerId;
    this.name = name;

    // Memory system to track game state
    this.memory = {
      revealedGoals: new Map(),       // playerId -> Array<goalCard>
      biddingHistory: [],             // Array of {playerId, amount, card, won}
      tradeHistory: [],               // Array of {from, to, offering, requesting}
      stockPriceHistory: [],          // Array of {round, phase, prices}
      opponentBehavior: new Map()     // playerId -> {avgBid, tradesAccepted, ...}
    };
  }

  /**
   * Main decision entry point - called by game controller
   * @param {GameEngine} engine - Game engine instance
   * @param {Object} visibleState - Filtered state for this player
   * @returns {Object} Action to execute
   */
  decideAction(engine, visibleState) {
    const phase = visibleState.currentPhase;

    // Update memory with current state
    this.updateMemory(visibleState);

    // Delegate to phase-specific decision methods
    switch (phase) {
      case PHASES.AUCTION:
        return this.decideAuction(engine, visibleState);
      case PHASES.TRADING:
        return this.decideTrading(engine, visibleState);
      case PHASES.GOAL_RESOLUTION:
        return this.decideGoal(engine, visibleState);
      case PHASES.SELL:
        return this.decideSell(engine, visibleState);
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  /**
   * Phase-specific decision methods (must be implemented by subclasses)
   */
  decideAuction(engine, state) {
    throw new Error('decideAuction must be implemented by subclass');
  }

  decideTrading(engine, state) {
    throw new Error('decideTrading must be implemented by subclass');
  }

  decideGoal(engine, state) {
    throw new Error('decideGoal must be implemented by subclass');
  }

  decideSell(engine, state) {
    throw new Error('decideSell must be implemented by subclass');
  }

  /**
   * Update memory with current game state
   */
  updateMemory(state) {
    // Store current stock prices
    this.memory.stockPriceHistory.push({
      round: state.currentRound,
      phase: state.currentPhase,
      prices: { ...state.stockPrices }
    });

    // Track revealed goals from phaseState
    if (state.phaseState.goalResolution && state.phaseState.goalResolution.revealedGoals) {
      for (const revealed of state.phaseState.goalResolution.revealedGoals) {
        if (!this.memory.revealedGoals.has(revealed.playerId)) {
          this.memory.revealedGoals.set(revealed.playerId, []);
        }
        const goals = this.memory.revealedGoals.get(revealed.playerId);
        if (!goals.find(g => g.id === revealed.goalCard.id)) {
          goals.push(revealed.goalCard);
        }
      }
    }
  }

  /**
   * Evaluate the value of a card based on current state
   * @param {string} color - Card color
   * @param {Object} state - Visible state
   * @returns {number} Estimated card value
   */
  evaluateCardValue(color, state) {
    const baseValue = state.stockPrices[color];
    const goalSynergy = this.calculateGoalSynergy(color, state);
    return baseValue + goalSynergy;
  }

  /**
   * Calculate how much a card helps with goals
   * @param {string} color - Card color
   * @param {Object} state - Visible state
   * @returns {number} Synergy bonus (0-4)
   */
  calculateGoalSynergy(color, state) {
    const myPlayer = this.getMyPlayer(state);
    const hand = myPlayer.hand;
    const goalCards = myPlayer.goalCards.filter(g => !g.revealed);

    let synergy = 0;

    for (const goal of goalCards) {
      const parsed = goal.metadata.goalParsed;
      const requirements = parsed.requirements || {};
      const avoidColor = parsed.avoidColor;

      // Check if card helps with goal
      if (requirements[color]) {
        const needed = requirements[color];
        const have = hand.filter(c => c.color === color).length;

        if (have + 1 === needed) {
          synergy += 2; // Completes goal!
        } else if (have < needed) {
          synergy += 1; // Helps toward goal
        } else if (have === needed) {
          synergy += 0.5; // Goal already met, but keeping extras is useful
        }
      }

      // Penalty for "none_of" goals
      if (avoidColor === color) {
        synergy -= 2;
      }
    }

    return synergy;
  }

  /**
   * Calculate expected stock change from unrevealed goals
   * @param {string} color - Card color
   * @param {Object} state - Visible state
   * @returns {number} Expected net stock price change
   */
  calculateExpectedStockChange(color, state) {
    const myPlayer = this.getMyPlayer(state);
    const goalCards = myPlayer.goalCards.filter(g => !g.revealed);

    let totalChange = 0;

    for (const goal of goalCards) {
      // Stock change is in stockChange.parsed, not metadata.stockChangeParsed
      const stockChange = goal.stockChange?.parsed || {};
      if (stockChange[color]) {
        totalChange += stockChange[color];
      }
    }

    return totalChange;
  }

  /**
   * Calculate expected value of a card (current price + expected changes)
   * @param {string} color - Card color
   * @param {Object} state - Visible state
   * @returns {number} Expected value
   */
  calculateExpectedValue(color, state) {
    const currentPrice = state.stockPrices[color];
    const expectedChange = this.calculateExpectedStockChange(color, state);
    return currentPrice + expectedChange;
  }

  /**
   * Check if a goal is currently met
   * @param {Object} goalCard - Goal card to check
   * @param {Array} hand - Player's hand
   * @returns {boolean} True if goal is met
   */
  isGoalMet(goalCard, hand) {
    return GoalParser.checkGoal(goalCard, hand);
  }

  /**
   * Select best goal to reveal from available goals
   * @param {Array} goalCards - Available goal cards
   * @param {Array} hand - Player's hand
   * @param {Object} state - Visible state
   * @returns {Object} Best goal card to reveal
   */
  selectBestGoal(goalCards, hand, state) {
    const unrevealedGoals = goalCards.filter(g => !g.revealed);

    if (unrevealedGoals.length === 0) {
      return null;
    }

    // Score each goal
    const scoredGoals = unrevealedGoals.map(goal => ({
      goal,
      score: this.scoreGoalForReveal(goal, hand, state)
    }));

    // Sort by score (highest first) and return best
    scoredGoals.sort((a, b) => b.score - a.score);
    return scoredGoals[0].goal;
  }

  /**
   * Score a goal for reveal decision (higher = better to reveal)
   * @param {Object} goalCard - Goal card
   * @param {Array} hand - Player's hand
   * @param {Object} state - Visible state
   * @returns {number} Score
   */
  scoreGoalForReveal(goalCard, hand, state) {
    let score = 0;

    // Major bonus if goal is met
    if (this.isGoalMet(goalCard, hand)) {
      score += 10;

      // Add reward value
      const rewardValue = goalCard.metadata.rewardParsed.value || 1;
      score += rewardValue;
    }

    // Stock change benefit (if it helps our hand value)
    const stockChange = goalCard.metadata.stockChangeParsed;
    for (const [color, change] of Object.entries(stockChange)) {
      const cardsOfColor = hand.filter(c => c.color === color).length;
      score += change * cardsOfColor * 0.5; // Positive if price increases, negative if decreases
    }

    return score;
  }

  /**
   * Evaluate a trade offer (from perspective of accepting the trade)
   * @param {Object} offer - Trade offer from another player
   * @param {Object} state - Visible state
   * @returns {number} Net value (positive = good for us, negative = bad)
   */
  evaluateTrade(offer, state) {
    const myPlayer = this.getMyPlayer(state);

    // When accepting a trade:
    // - We RECEIVE what they're offering
    // - We GIVE what they're requesting

    // Calculate what we're receiving (their offering)
    let receivingValue = offer.offering.cash || 0;
    if (offer.offering.cards) {
      for (const card of offer.offering.cards) {
        // Use expected value (current price + expected stock changes from unrevealed goals)
        receivingValue += this.calculateExpectedValue(card.color, state);
      }
    }

    // Calculate what we're giving up (their requesting)
    let givingValue = offer.requesting.cash || 0;
    if (offer.requesting.cards) {
      for (const request of offer.requesting.cards) {
        // Use expected value for what we're giving away
        givingValue += this.calculateExpectedValue(request.color, state) * request.count;
      }
    }

    // Net value (positive = we gain, negative = we lose)
    return receivingValue - givingValue;
  }

  /**
   * Get my player object from state
   * @param {Object} state - Visible state
   * @returns {Object} Player object
   */
  getMyPlayer(state) {
    return state.players.find(p => p.id === this.playerId);
  }

  /**
   * Get opponent players
   * @param {Object} state - Visible state
   * @returns {Array} Opponent player objects
   */
  getOpponents(state) {
    return state.players.filter(p => p.id !== this.playerId);
  }

  /**
   * Get card count by color in hand
   * @param {Array} hand - Player's hand
   * @param {string} color - Card color
   * @returns {number} Count
   */
  getCardCountByColor(hand, color) {
    return hand.filter(c => c.color === color).length;
  }

  /**
   * Find cards needed for unfulfilled goals
   * @param {Object} state - Visible state
   * @returns {Object} Map of color -> priority (higher = more needed)
   */
  getNeededCards(state) {
    const myPlayer = this.getMyPlayer(state);
    const hand = myPlayer.hand;
    const goalCards = myPlayer.goalCards.filter(g => !g.revealed);

    const needed = {};

    for (const color of Object.values(COLORS)) {
      needed[color] = 0;
    }

    for (const goal of goalCards) {
      if (this.isGoalMet(goal, hand)) continue; // Already met

      const requirements = goal.metadata.goalParsed.requirements || {};
      const avoidColor = goal.metadata.goalParsed.avoidColor;

      for (const [color, count] of Object.entries(requirements)) {
        const have = this.getCardCountByColor(hand, color);
        const need = count - have;
        if (need > 0) {
          needed[color] += need;
        }
      }

      // Negative priority for avoid colors
      if (avoidColor) {
        needed[avoidColor] -= 10;
      }
    }

    return needed;
  }

  /**
   * Calculate expected value of keeping cards for next round
   * @param {string} color - Card color
   * @param {Object} state - Visible state
   * @returns {number} Expected future value
   */
  estimateFutureValue(color, state) {
    const currentPrice = state.stockPrices[color];
    const goalSynergy = this.calculateGoalSynergy(color, state);

    // Simple heuristic: current price + goal synergy + random variance
    return currentPrice + goalSynergy;
  }

  /**
   * Select target player for interactive rewards
   * @param {string} rewardType - Type of reward
   * @param {Object} state - Visible state
   * @returns {string} Target player ID
   */
  selectTargetPlayer(rewardType, state) {
    const opponents = this.getOpponents(state);

    switch (rewardType) {
      case 'steal_cash':
        // Choose richest opponent
        return opponents.reduce((richest, p) =>
          p.cash > richest.cash ? p : richest
        ).id;

      case 'look_at_hand':
        // Choose player with most cards
        return opponents.reduce((most, p) =>
          p.hand.length > most.hand.length ? p : most
        ).id;

      case 'take_and_give_card':
        // Choose player with most cards
        return opponents.reduce((most, p) =>
          p.hand.length > most.hand.length ? p : most
        ).id;

      default:
        // Default to first opponent
        return opponents[0].id;
    }
  }

  /**
   * Helper: Sleep for AI pacing
   * @param {number} ms - Milliseconds
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
