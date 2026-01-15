/**
 * Validation System - validates all player actions before execution
 */
import { ACTION_TYPES, PHASES, OFFER_STATUS } from '../utils/Constants.js';

export class ValidationSystem {
  /**
   * Validate any action
   * @param {Object} state - Game state
   * @param {Object} action - Action to validate
   * @returns {Object} { valid: boolean, error?: string }
   */
  validateAction(state, action) {
    if (!action || !action.type) {
      return { valid: false, error: 'Action must have a type' };
    }

    // Dispatch to specific validators
    switch (action.type) {
      case ACTION_TYPES.PLACE_BID:
        return this.validateBid(state, action);
      case ACTION_TYPES.PASS:
        return this.validatePass(state, action);
      case ACTION_TYPES.PROPOSE_TRADE:
        return this.validateTradeProposal(state, action);
      case ACTION_TYPES.ACCEPT_TRADE:
        return this.validateTradeAcceptance(state, action);
      case ACTION_TYPES.CANCEL_TRADE:
        return this.validateTradeCancellation(state, action);
      case ACTION_TYPES.REVEAL_GOAL:
        return this.validateGoalReveal(state, action);
      case ACTION_TYPES.EXECUTE_REWARD:
        return this.validateRewardExecution(state, action);
      case ACTION_TYPES.SELECT_CARDS_TO_SELL:
        return this.validateSellSelection(state, action);
      case ACTION_TYPES.COMMIT_SELL:
        return this.validateSellCommit(state, action);
      default:
        return { valid: true }; // Unknown actions pass through
    }
  }

  /**
   * Validate a bid action
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId, amount }
   * @returns {Object} Validation result
   */
  validateBid(state, action) {
    const { playerId, amount } = action;

    // Must be in auction phase
    if (state.currentPhase !== PHASES.AUCTION) {
      return { valid: false, error: 'Not in auction phase' };
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      return { valid: false, error: 'Player not found' };
    }

    const auction = state.phaseState.auction;

    // Must still be in the auction (not passed)
    if (!auction.activeBidders.has(playerId)) {
      return { valid: false, error: 'You have already passed' };
    }

    // Bid must be higher than current bid
    if (amount <= auction.currentBid) {
      return { valid: false, error: `Bid must be higher than current bid of $${auction.currentBid}` };
    }

    // Must have enough cash
    if (player.cash < amount) {
      return { valid: false, error: `Insufficient funds. You have $${player.cash}, need $${amount}` };
    }

    return { valid: true };
  }

  /**
   * Validate a pass action
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId }
   * @returns {Object} Validation result
   */
  validatePass(state, action) {
    const { playerId } = action;

    if (state.currentPhase !== PHASES.AUCTION) {
      return { valid: false, error: 'Not in auction phase' };
    }

    const auction = state.phaseState.auction;

    if (!auction.activeBidders.has(playerId)) {
      return { valid: false, error: 'You have already passed' };
    }

    return { valid: true };
  }

  /**
   * Validate a trade proposal
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId, offering, requesting }
   * @returns {Object} Validation result
   */
  validateTradeProposal(state, action) {
    const { playerId, offering, requesting } = action;

    if (state.currentPhase !== PHASES.TRADING) {
      return { valid: false, error: 'Not in trading phase' };
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      return { valid: false, error: 'Player not found' };
    }

    // Validate offering
    if (!offering || ((!offering.cards || offering.cards.length === 0) && !offering.cash)) {
      return { valid: false, error: 'Must offer something (cards or cash)' };
    }

    // Validate requesting
    if (!requesting || ((!requesting.cards || requesting.cards.length === 0) && !requesting.cash)) {
      return { valid: false, error: 'Must request something (cards or cash)' };
    }

    // Check player owns all offered cards
    if (offering.cards) {
      for (const cardId of offering.cards) {
        if (!player.hand.some(c => c.id === cardId)) {
          return { valid: false, error: `You don't own card ${cardId}` };
        }
      }
    }

    // Check player has enough cash to offer
    if (offering.cash && player.cash < offering.cash) {
      return { valid: false, error: `Insufficient cash to offer. You have $${player.cash}, offering $${offering.cash}` };
    }

    return { valid: true };
  }

  /**
   * Validate trade acceptance
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId, offerId }
   * @returns {Object} Validation result
   */
  validateTradeAcceptance(state, action) {
    const { playerId, offerId } = action;

    if (state.currentPhase !== PHASES.TRADING) {
      return { valid: false, error: 'Not in trading phase' };
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      return { valid: false, error: 'Player not found' };
    }

    const trading = state.phaseState.trading;
    const offer = trading.activeOffers.find(o => o.offerId === offerId);

    if (!offer) {
      return { valid: false, error: 'Offer not found' };
    }

    if (offer.status !== OFFER_STATUS.ACTIVE) {
      return { valid: false, error: 'Offer is no longer active' };
    }

    if (offer.offeringPlayer === playerId) {
      return { valid: false, error: 'Cannot accept your own offer' };
    }

    // Check accepting player has enough cash
    if (offer.requesting.cash && player.cash < offer.requesting.cash) {
      return { valid: false, error: `Insufficient cash. Need $${offer.requesting.cash}, have $${player.cash}` };
    }

    // Check accepting player has requested cards
    if (offer.requesting.cards) {
      for (const cardReq of offer.requesting.cards) {
        const count = player.hand.filter(c => c.color === cardReq.color).length;
        if (count < cardReq.count) {
          return {
            valid: false,
            error: `Need ${cardReq.count} ${cardReq.color} cards, have ${count}`
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate trade cancellation
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId, offerId }
   * @returns {Object} Validation result
   */
  validateTradeCancellation(state, action) {
    const { playerId, offerId } = action;

    if (state.currentPhase !== PHASES.TRADING) {
      return { valid: false, error: 'Not in trading phase' };
    }

    const trading = state.phaseState.trading;
    const offer = trading.activeOffers.find(o => o.offerId === offerId);

    if (!offer) {
      return { valid: false, error: 'Offer not found' };
    }

    if (offer.offeringPlayer !== playerId) {
      return { valid: false, error: 'Can only cancel your own offers' };
    }

    if (offer.status !== OFFER_STATUS.ACTIVE) {
      return { valid: false, error: 'Offer is no longer active' };
    }

    return { valid: true };
  }

  /**
   * Validate goal reveal
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId, goalCardId }
   * @returns {Object} Validation result
   */
  validateGoalReveal(state, action) {
    const { playerId, goalCardId } = action;

    if (state.currentPhase !== PHASES.GOAL_RESOLUTION) {
      return { valid: false, error: 'Not in goal resolution phase' };
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      return { valid: false, error: 'Player not found' };
    }

    const goalResolution = state.phaseState.goalResolution;

    // Check it's this player's turn
    const expectedPlayerId = state.turnOrder[goalResolution.currentPlayerIndex];
    if (expectedPlayerId !== playerId) {
      return { valid: false, error: 'Not your turn to reveal a goal' };
    }

    // Check player owns the goal card
    const goalCard = player.goalCards.find(g => g.id === goalCardId);
    if (!goalCard) {
      return { valid: false, error: 'Goal card not found in your hand' };
    }

    // Check card not already revealed
    if (goalCard.revealed) {
      return { valid: false, error: 'Goal card already revealed' };
    }

    return { valid: true };
  }

  /**
   * Validate reward execution
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId, choices }
   * @returns {Object} Validation result
   */
  validateRewardExecution(state, action) {
    const { playerId, choices } = action;

    if (state.currentPhase !== PHASES.GOAL_RESOLUTION) {
      return { valid: false, error: 'Not in goal resolution phase' };
    }

    const goalResolution = state.phaseState.goalResolution;

    // Check there's a pending reward for this player
    if (!goalResolution.pendingRewardExecution) {
      return { valid: false, error: 'No pending reward to execute' };
    }

    if (goalResolution.pendingRewardExecution.playerId !== playerId) {
      return { valid: false, error: 'Reward is not for you' };
    }

    // Additional validation would be reward-type specific
    // This is handled in the RewardSystem

    return { valid: true };
  }

  /**
   * Validate sell card selection
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId, cardIds }
   * @returns {Object} Validation result
   */
  validateSellSelection(state, action) {
    const { playerId, cardIds } = action;

    if (state.currentPhase !== PHASES.SELL) {
      return { valid: false, error: 'Not in sell phase' };
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      return { valid: false, error: 'Player not found' };
    }

    // Check player owns all cards
    if (cardIds) {
      for (const cardId of cardIds) {
        if (!player.hand.some(c => c.id === cardId)) {
          return { valid: false, error: `You don't own card ${cardId}` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate sell commit
   * @param {Object} state - Game state
   * @param {Object} action - { type, playerId }
   * @returns {Object} Validation result
   */
  validateSellCommit(state, action) {
    const { playerId } = action;

    if (state.currentPhase !== PHASES.SELL) {
      return { valid: false, error: 'Not in sell phase' };
    }

    const sell = state.phaseState.sell;

    if (!sell.playerSelections[playerId]) {
      return { valid: false, error: 'No sell selection found' };
    }

    if (sell.playerSelections[playerId].committed) {
      return { valid: false, error: 'Already committed' };
    }

    return { valid: true };
  }

  /**
   * Helper: Get player by ID
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   * @returns {Object|null} Player or null
   */
  getPlayer(state, playerId) {
    return state.players.find(p => p.id === playerId) || null;
  }
}
