/**
 * Unit tests for ValidationSystem
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ValidationSystem } from '../../../src/systems/ValidationSystem.js';
import { ACTION_TYPES, PHASES, OFFER_STATUS } from '../../../src/utils/Constants.js';
import {
  createGameState,
  createPlayer,
  createPlayers,
  createResourceCard,
  createGoalCard,
  createAuctionState,
  createTradeOffer
} from '../../helpers/builders.js';

describe('ValidationSystem', () => {
  let validator;

  beforeEach(() => {
    validator = new ValidationSystem();
  });

  describe('validateAction', () => {
    test('should reject action without type', () => {
      const state = createGameState();
      const result = validator.validateAction(state, {});

      expect(result.valid).toBe(false);
      expect(result.error).toContain('type');
    });

    test('should dispatch to correct validator based on action type', () => {
      const state = createGameState({ currentPhase: PHASES.AUCTION });
      state.phaseState.auction = createAuctionState();

      const bidAction = {
        type: ACTION_TYPES.PLACE_BID,
        playerId: 'player1',
        amount: 5
      };

      const result = validator.validateAction(state, bidAction);
      expect(result).toBeDefined();
    });

    test('should pass through unknown action types', () => {
      const state = createGameState();
      const result = validator.validateAction(state, { type: 'UNKNOWN_ACTION' });

      expect(result.valid).toBe(true);
    });
  });

  describe('validateBid', () => {
    let state;

    beforeEach(() => {
      state = createGameState({
        currentPhase: PHASES.AUCTION,
        players: createPlayers(3)
      });
      state.phaseState.auction = createAuctionState({
        currentBid: 2,
        currentBidder: 'player1',
        activeBidders: new Set(['player1', 'player2', 'player3'])
      });
    });

    test('should accept valid bid', () => {
      const action = {
        type: ACTION_TYPES.PLACE_BID,
        playerId: 'player2',
        amount: 3
      };

      const result = validator.validateBid(state, action);
      expect(result.valid).toBe(true);
    });

    test('should reject bid not in auction phase', () => {
      state.currentPhase = PHASES.TRADING;
      const action = {
        type: ACTION_TYPES.PLACE_BID,
        playerId: 'player1',
        amount: 3
      };

      const result = validator.validateBid(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('auction phase');
    });

    test('should reject bid from non-existent player', () => {
      const action = {
        type: ACTION_TYPES.PLACE_BID,
        playerId: 'nonexistent',
        amount: 3
      };

      const result = validator.validateBid(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should reject bid from player who already passed', () => {
      state.phaseState.auction.activeBidders = new Set(['player1', 'player2']);

      const action = {
        type: ACTION_TYPES.PLACE_BID,
        playerId: 'player3',
        amount: 3
      };

      const result = validator.validateBid(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('passed');
    });

    test('should reject bid not higher than current bid', () => {
      const action = {
        type: ACTION_TYPES.PLACE_BID,
        playerId: 'player2',
        amount: 2
      };

      const result = validator.validateBid(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('higher than');
    });

    test('should reject bid with insufficient funds', () => {
      state.players[1].cash = 2;

      const action = {
        type: ACTION_TYPES.PLACE_BID,
        playerId: 'player2',
        amount: 5
      };

      const result = validator.validateBid(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient funds');
    });
  });

  describe('validatePass', () => {
    let state;

    beforeEach(() => {
      state = createGameState({ currentPhase: PHASES.AUCTION });
      state.phaseState.auction = createAuctionState({
        activeBidders: new Set(['player1', 'player2', 'player3'])
      });
    });

    test('should accept valid pass', () => {
      const action = {
        type: ACTION_TYPES.PASS,
        playerId: 'player1'
      };

      const result = validator.validatePass(state, action);
      expect(result.valid).toBe(true);
    });

    test('should reject pass not in auction phase', () => {
      state.currentPhase = PHASES.TRADING;

      const action = {
        type: ACTION_TYPES.PASS,
        playerId: 'player1'
      };

      const result = validator.validatePass(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('auction phase');
    });

    test('should reject pass from player who already passed', () => {
      state.phaseState.auction.activeBidders = new Set(['player1', 'player2']);

      const action = {
        type: ACTION_TYPES.PASS,
        playerId: 'player3'
      };

      const result = validator.validatePass(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('passed');
    });
  });

  describe('validateTradeProposal', () => {
    let state;

    beforeEach(() => {
      state = createGameState({ currentPhase: PHASES.TRADING });
      state.players[0].hand = [
        createResourceCard('Blue'),
        createResourceCard('Orange')
      ];
      state.players[0].cash = 10;
      state.phaseState.trading = { activeOffers: [] };
    });

    test('should accept valid trade proposal', () => {
      const action = {
        type: ACTION_TYPES.PROPOSE_TRADE,
        playerId: 'player1',
        offering: {
          cards: [state.players[0].hand[0].id],
          cash: 0
        },
        requesting: {
          cards: [{ color: 'Yellow', count: 1 }],
          cash: 0
        }
      };

      const result = validator.validateTradeProposal(state, action);
      expect(result.valid).toBe(true);
    });

    test('should reject proposal not in trading phase', () => {
      state.currentPhase = PHASES.AUCTION;

      const action = {
        type: ACTION_TYPES.PROPOSE_TRADE,
        playerId: 'player1',
        offering: { cards: [], cash: 1 },
        requesting: { cards: [{ color: 'Yellow', count: 1 }], cash: 0 }
      };

      const result = validator.validateTradeProposal(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('trading phase');
    });

    test('should reject proposal offering nothing', () => {
      const action = {
        type: ACTION_TYPES.PROPOSE_TRADE,
        playerId: 'player1',
        offering: { cards: [], cash: 0 },
        requesting: { cards: [{ color: 'Yellow', count: 1 }], cash: 0 }
      };

      const result = validator.validateTradeProposal(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('offer something');
    });

    test('should reject proposal requesting nothing', () => {
      const action = {
        type: ACTION_TYPES.PROPOSE_TRADE,
        playerId: 'player1',
        offering: { cards: [state.players[0].hand[0].id], cash: 0 },
        requesting: { cards: [], cash: 0 }
      };

      const result = validator.validateTradeProposal(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('request something');
    });

    test('should reject proposal with card player does not own', () => {
      const action = {
        type: ACTION_TYPES.PROPOSE_TRADE,
        playerId: 'player1',
        offering: { cards: ['nonexistent-card-id'], cash: 0 },
        requesting: { cards: [{ color: 'Yellow', count: 1 }], cash: 0 }
      };

      const result = validator.validateTradeProposal(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("don't own");
    });

    test('should reject proposal with insufficient cash', () => {
      state.players[0].cash = 2;

      const action = {
        type: ACTION_TYPES.PROPOSE_TRADE,
        playerId: 'player1',
        offering: { cards: [], cash: 5 },
        requesting: { cards: [{ color: 'Yellow', count: 1 }], cash: 0 }
      };

      const result = validator.validateTradeProposal(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient cash');
    });
  });

  describe('validateTradeAcceptance', () => {
    let state;

    beforeEach(() => {
      state = createGameState({ currentPhase: PHASES.TRADING });
      state.players[0].cash = 10;
      state.players[1].cash = 10;
      state.players[1].hand = [
        createResourceCard('Yellow'),
        createResourceCard('Yellow')
      ];

      state.phaseState.trading = {
        activeOffers: [
          {
            offerId: 'offer-1',
            offeringPlayer: 'player1',
            status: OFFER_STATUS.ACTIVE,
            offering: { cards: [], cash: 2 },
            requesting: { cards: [{ color: 'Yellow', count: 1 }], cash: 0 }
          }
        ]
      };
    });

    test('should accept valid trade acceptance', () => {
      const action = {
        type: ACTION_TYPES.ACCEPT_TRADE,
        playerId: 'player2',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeAcceptance(state, action);
      expect(result.valid).toBe(true);
    });

    test('should reject acceptance not in trading phase', () => {
      state.currentPhase = PHASES.AUCTION;

      const action = {
        type: ACTION_TYPES.ACCEPT_TRADE,
        playerId: 'player2',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeAcceptance(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('trading phase');
    });

    test('should reject acceptance of nonexistent offer', () => {
      const action = {
        type: ACTION_TYPES.ACCEPT_TRADE,
        playerId: 'player2',
        offerId: 'nonexistent'
      };

      const result = validator.validateTradeAcceptance(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should reject acceptance of own offer', () => {
      const action = {
        type: ACTION_TYPES.ACCEPT_TRADE,
        playerId: 'player1',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeAcceptance(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('own offer');
    });

    test('should reject acceptance with insufficient cash', () => {
      state.players[1].cash = 0;
      state.phaseState.trading.activeOffers[0].requesting.cash = 5;

      const action = {
        type: ACTION_TYPES.ACCEPT_TRADE,
        playerId: 'player2',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeAcceptance(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient cash');
    });

    test('should reject acceptance without required cards', () => {
      state.players[1].hand = [createResourceCard('Blue')];

      const action = {
        type: ACTION_TYPES.ACCEPT_TRADE,
        playerId: 'player2',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeAcceptance(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Need');
    });

    test('should reject acceptance of inactive offer', () => {
      state.phaseState.trading.activeOffers[0].status = OFFER_STATUS.CANCELLED;

      const action = {
        type: ACTION_TYPES.ACCEPT_TRADE,
        playerId: 'player2',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeAcceptance(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('no longer active');
    });
  });

  describe('validateTradeCancellation', () => {
    let state;

    beforeEach(() => {
      state = createGameState({ currentPhase: PHASES.TRADING });
      state.phaseState.trading = {
        activeOffers: [
          {
            offerId: 'offer-1',
            offeringPlayer: 'player1',
            status: OFFER_STATUS.ACTIVE
          }
        ]
      };
    });

    test('should accept valid cancellation', () => {
      const action = {
        type: ACTION_TYPES.CANCEL_TRADE,
        playerId: 'player1',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeCancellation(state, action);
      expect(result.valid).toBe(true);
    });

    test('should reject cancellation not in trading phase', () => {
      state.currentPhase = PHASES.AUCTION;

      const action = {
        type: ACTION_TYPES.CANCEL_TRADE,
        playerId: 'player1',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeCancellation(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('trading phase');
    });

    test('should reject cancellation of nonexistent offer', () => {
      const action = {
        type: ACTION_TYPES.CANCEL_TRADE,
        playerId: 'player1',
        offerId: 'nonexistent'
      };

      const result = validator.validateTradeCancellation(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should reject cancellation of another player offer', () => {
      const action = {
        type: ACTION_TYPES.CANCEL_TRADE,
        playerId: 'player2',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeCancellation(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('own offers');
    });

    test('should reject cancellation of inactive offer', () => {
      state.phaseState.trading.activeOffers[0].status = OFFER_STATUS.CANCELLED;

      const action = {
        type: ACTION_TYPES.CANCEL_TRADE,
        playerId: 'player1',
        offerId: 'offer-1'
      };

      const result = validator.validateTradeCancellation(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('no longer active');
    });
  });

  describe('edge cases', () => {
    test('should handle null action', () => {
      const state = createGameState();
      const result = validator.validateAction(state, null);
      expect(result.valid).toBe(false);
    });

    test('should handle missing player in state', () => {
      const state = createGameState({
        currentPhase: PHASES.AUCTION,
        players: []
      });
      state.phaseState.auction = createAuctionState();

      const action = {
        type: ACTION_TYPES.PLACE_BID,
        playerId: 'player1',
        amount: 3
      };

      const result = validator.validateBid(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
