/**
 * Turn System - handles phase transitions and round advancement
 */
import { PHASES, EVENT_TYPES } from '../utils/Constants.js';
import { GameState } from '../core/GameState.js';

export class TurnSystem {
  constructor(eventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Check if current phase can advance
   * @param {Object} state - Game state
   * @param {Object} managers - Object containing all managers
   * @returns {boolean} True if phase can advance
   */
  canAdvancePhase(state, managers) {
    switch (state.currentPhase) {
      case PHASES.AUCTION:
        return managers.auctionManager.isAuctionComplete(state);

      case PHASES.TRADING:
        // Can advance when timer expires or manually ended
        return managers.tradingManager.isTimeExpired(state);

      case PHASES.GOAL_RESOLUTION:
        return managers.goalResolutionManager.isGoalResolutionComplete(state);

      case PHASES.SELL:
        return managers.sellManager.areAllCommitted(state);

      default:
        return false;
    }
  }

  /**
   * Get the next phase
   * @param {string} currentPhase - Current phase
   * @returns {string|null} Next phase, or null if round complete
   */
  getNextPhase(currentPhase) {
    const phaseSequence = [
      PHASES.AUCTION,
      PHASES.TRADING,
      PHASES.GOAL_RESOLUTION,
      PHASES.SELL
    ];

    const currentIndex = phaseSequence.indexOf(currentPhase);

    if (currentIndex === -1 || currentIndex === phaseSequence.length - 1) {
      return null; // Round complete
    }

    return phaseSequence[currentIndex + 1];
  }

  /**
   * Advance to next phase
   * @param {Object} state - Game state
   * @param {Object} managers - Object containing all managers
   */
  advancePhase(state, managers) {
    const currentPhase = state.currentPhase;
    const nextPhase = this.getNextPhase(currentPhase);

    if (!nextPhase) {
      // Round complete
      this.completeRound(state, managers);
    } else {
      // Transition to next phase
      this.transitionToPhase(state, nextPhase, managers);
    }
  }

  /**
   * Transition to a specific phase
   * @param {Object} state - Game state
   * @param {string} phase - Phase to transition to
   * @param {Object} managers - Object containing all managers
   */
  transitionToPhase(state, phase, managers) {
    const fromPhase = state.currentPhase;

    // Cleanup current phase
    this.cleanupPhase(state, fromPhase);

    // Set new phase
    state.currentPhase = phase;

    // Initialize new phase
    this.initializePhase(state, phase, managers);

    this.eventEmitter.emit(EVENT_TYPES.PHASE_CHANGED, {
      fromPhase,
      toPhase: phase,
      round: state.currentRound
    });
  }

  /**
   * Cleanup a phase
   * @param {Object} state - Game state
   * @param {string} phase - Phase to cleanup
   */
  cleanupPhase(state, phase) {
    // Clear phase state
    if (phase) {
      state.phaseState[phase] = null;
    }
  }

  /**
   * Initialize a phase
   * @param {Object} state - Game state
   * @param {string} phase - Phase to initialize
   * @param {Object} managers - Object containing all managers
   */
  initializePhase(state, phase, managers) {
    switch (phase) {
      case PHASES.AUCTION:
        managers.auctionManager.initializeAuction(state);
        break;

      case PHASES.TRADING:
        managers.tradingManager.initializeTrading(state);
        break;

      case PHASES.GOAL_RESOLUTION:
        managers.goalResolutionManager.initializeGoalResolution(state);
        break;

      case PHASES.SELL:
        managers.sellManager.initializeSell(state);
        break;
    }
  }

  /**
   * Complete the current round
   * @param {Object} state - Game state
   * @param {Object} managers - Object containing all managers
   */
  completeRound(state, managers) {
    if (state.currentRound < state.config.totalRounds) {
      // Start next round
      GameState.advanceRound(state);
      this.transitionToPhase(state, PHASES.AUCTION, managers);
    } else {
      // Game over
      this.endGame(state);
    }
  }

  /**
   * End the game
   * @param {Object} state - Game state
   */
  endGame(state) {
    state.status = 'completed';

    const finalScores = GameState.getFinalScores(state);

    this.eventEmitter.emit(EVENT_TYPES.GAME_ENDED, {
      winner: finalScores[0],
      finalScores
    });
  }

  /**
   * Manually end current phase (for trading phase)
   * @param {Object} state - Game state
   * @param {Object} managers - Object containing all managers
   */
  manuallyEndPhase(state, managers) {
    if (state.currentPhase === PHASES.TRADING) {
      managers.tradingManager.endTrading(state);
      this.advancePhase(state, managers);
    }
  }
}
