/**
 * Integration tests for AuctionManager
 * Tests complete auction flows with real dependencies
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { AuctionManager } from '../../src/managers/AuctionManager.js';
import { DeckManager } from '../../src/managers/DeckManager.js';
import { EVENT_TYPES } from '../../src/utils/Constants.js';
import {
  createGameState,
  createPlayers,
  createResourceDeck,
  createResourceCard
} from '../helpers/builders.js';
import { MockEventEmitter } from '../helpers/mocks.js';

describe('AuctionManager Integration', () => {
  let auctionManager;
  let deckManager;
  let eventEmitter;
  let state;

  beforeEach(() => {
    eventEmitter = new MockEventEmitter();
    deckManager = new DeckManager(eventEmitter);
    auctionManager = new AuctionManager(eventEmitter, deckManager);

    state = createGameState({
      players: createPlayers(3),
      resourceDeck: {
        drawPile: createResourceDeck(),
        discardPile: []
      }
    });

    // Set up turn order and dealer
    state.turnOrder = ['player1', 'player2', 'player3'];
    state.dealerIndex = 0;
  });

  describe('initializeAuction', () => {
    test('should draw correct number of cards for auction', () => {
      const initialDeckSize = state.resourceDeck.drawPile.length;

      auctionManager.initializeAuction(state);

      const expectedCards = 3 + 2; // players + 2
      expect(state.phaseState.auction.cardsToAuction).toHaveLength(expectedCards);
      expect(state.resourceDeck.drawPile.length).toBe(initialDeckSize - expectedCards);
    });

    test('should set up auction state correctly', () => {
      auctionManager.initializeAuction(state);

      const auction = state.phaseState.auction;
      expect(auction.currentCardIndex).toBe(0);
      expect(auction.currentCard).toBeDefined();
      expect(auction.currentBid).toBe(0);
      expect(auction.currentHighBidder).toBeNull();
      expect(auction.activeBidders.size).toBe(3);
      expect(auction.startingPlayer).toBe('player1');
    });

    test('should emit AUCTION_STARTED and CARD_REVEALED events', () => {
      auctionManager.initializeAuction(state);

      expect(eventEmitter.wasEmitted(EVENT_TYPES.AUCTION_STARTED)).toBe(true);
      expect(eventEmitter.wasEmitted(EVENT_TYPES.CARD_REVEALED)).toBe(true);

      const startData = eventEmitter.getLastEventData(EVENT_TYPES.AUCTION_STARTED);
      expect(startData.cardCount).toBe(5);
    });
  });

  describe('complete auction flow', () => {
    beforeEach(() => {
      auctionManager.initializeAuction(state);
    });

    test('should handle bid, pass, pass sequence (last bidder wins)', () => {
      const auction = state.phaseState.auction;
      const firstCard = auction.currentCard;

      // Player 1 bids $3
      auctionManager.placeBid(state, { playerId: 'player1', amount: 3 });
      expect(auction.currentBid).toBe(3);
      expect(auction.currentHighBidder).toBe('player1');

      // Player 2 passes
      auctionManager.pass(state, { playerId: 'player2' });
      expect(auction.activeBidders.has('player2')).toBe(false);

      // Player 3 passes - player 1 wins
      auctionManager.pass(state, { playerId: 'player3' });

      // Check winner received card and paid
      const player1 = state.players.find(p => p.id === 'player1');
      expect(player1.hand.some(c => c.id === firstCard.id)).toBe(true);
      expect(player1.cash).toBe(2); // Started with 5, paid 3

      // Check auction moved to next card
      expect(auction.currentCardIndex).toBe(1);
      expect(auction.currentCard.id).not.toBe(firstCard.id);

      // Check bidders reset
      expect(auction.activeBidders.size).toBe(3);
      expect(auction.currentBid).toBe(0);
    });

    test('should handle multiple bidding rounds', () => {
      const auction = state.phaseState.auction;

      // Bidding war
      auctionManager.placeBid(state, { playerId: 'player1', amount: 2 });
      auctionManager.placeBid(state, { playerId: 'player2', amount: 3 });
      auctionManager.placeBid(state, { playerId: 'player1', amount: 4 });

      // Player 2 and 3 pass
      auctionManager.pass(state, { playerId: 'player2' });
      auctionManager.pass(state, { playerId: 'player3' });

      // Player 1 wins with $4 bid
      const player1 = state.players.find(p => p.id === 'player1');
      expect(player1.cash).toBe(1); // 5 - 4
      expect(player1.hand).toHaveLength(1);
    });

    test('should handle last remaining bidder winning (two players pass)', () => {
      const auction = state.phaseState.auction;
      const firstCard = auction.currentCard;

      // Two players pass, leaving one bidder
      auctionManager.pass(state, { playerId: 'player1' });
      auctionManager.pass(state, { playerId: 'player2' });

      // Last remaining bidder (player3) wins with $0 bid
      const player3 = state.players.find(p => p.id === 'player3');
      expect(player3.hand.some(c => c.id === firstCard.id)).toBe(true);
      expect(player3.cash).toBe(5); // No payment

      // Auction moved to next card
      expect(auction.currentCardIndex).toBe(1);
    });

    test('should handle complete auction of all cards', () => {
      const auction = state.phaseState.auction;
      const totalCards = auction.cardsToAuction.length;

      // Auction all cards (player 1 always wins for simplicity)
      for (let i = 0; i < totalCards; i++) {
        auctionManager.placeBid(state, { playerId: 'player1', amount: 1 });
        auctionManager.pass(state, { playerId: 'player2' });
        auctionManager.pass(state, { playerId: 'player3' });
      }

      // Player 1 should have all cards
      const player1 = state.players.find(p => p.id === 'player1');
      expect(player1.hand.length).toBe(totalCards);
      expect(player1.cash).toBe(5 - totalCards); // Paid $1 for each

      // Auction should be complete
      expect(auction.currentCardIndex).toBe(totalCards);
    });

    test('should emit correct events throughout auction', () => {
      eventEmitter.clearEmittedEvents(); // Clear initialization events

      // Player 1 bids
      auctionManager.placeBid(state, { playerId: 'player1', amount: 2 });
      expect(eventEmitter.wasEmitted(EVENT_TYPES.BID_PLACED)).toBe(true);

      // Player 2 passes
      auctionManager.pass(state, { playerId: 'player2' });
      expect(eventEmitter.wasEmitted(EVENT_TYPES.PLAYER_PASSED)).toBe(true);

      // Player 3 passes - triggers completion
      auctionManager.pass(state, { playerId: 'player3' });
      expect(eventEmitter.wasEmitted(EVENT_TYPES.AUCTION_WON)).toBe(true);

      // New card revealed
      expect(eventEmitter.getEventCount(EVENT_TYPES.CARD_REVEALED)).toBeGreaterThan(0);
    });

    test('should handle player winning with $0 bid (no other bidders)', () => {
      const auction = state.phaseState.auction;

      // Players 2 and 3 pass immediately
      auctionManager.pass(state, { playerId: 'player2' });
      auctionManager.pass(state, { playerId: 'player3' });

      // Player 1 wins automatically with $0 bid
      const player1 = state.players.find(p => p.id === 'player1');
      expect(player1.hand).toHaveLength(1);
      expect(player1.cash).toBe(5); // No payment
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      auctionManager.initializeAuction(state);
    });

    test('should handle player running out of money', () => {
      // Set player 1 to very low cash
      state.players[0].cash = 2;

      // Player 1 bids all their money
      auctionManager.placeBid(state, { playerId: 'player1', amount: 2 });
      auctionManager.pass(state, { playerId: 'player2' });
      auctionManager.pass(state, { playerId: 'player3' });

      const player1 = state.players.find(p => p.id === 'player1');
      expect(player1.cash).toBe(0);
      expect(player1.hand).toHaveLength(1);
    });

    test('should handle auction with 4 players', () => {
      // Create state with 4 players
      state = createGameState({
        players: createPlayers(4),
        resourceDeck: {
          drawPile: createResourceDeck(),
          discardPile: []
        }
      });
      state.turnOrder = ['player1', 'player2', 'player3', 'player4'];
      state.dealerIndex = 0;

      auctionManager.initializeAuction(state);

      // Should draw 4 + 2 = 6 cards
      expect(state.phaseState.auction.cardsToAuction).toHaveLength(6);
      expect(state.phaseState.auction.activeBidders.size).toBe(4);
    });

    test('should handle rapid sequential auctions', () => {
      // Auction 3 cards quickly
      for (let i = 0; i < 3; i++) {
        auctionManager.placeBid(state, { playerId: 'player1', amount: 1 });
        auctionManager.pass(state, { playerId: 'player2' });
        auctionManager.pass(state, { playerId: 'player3' });
      }

      const player1 = state.players.find(p => p.id === 'player1');
      expect(player1.hand).toHaveLength(3);
      expect(state.phaseState.auction.currentCardIndex).toBe(3);
    });
  });

  describe('event ordering', () => {
    beforeEach(() => {
      auctionManager.initializeAuction(state);
      eventEmitter.clearEmittedEvents();
    });

    test('should emit events in correct order for winning auction', () => {
      auctionManager.placeBid(state, { playerId: 'player1', amount: 2 });
      auctionManager.pass(state, { playerId: 'player2' });
      auctionManager.pass(state, { playerId: 'player3' });

      const eventTypes = eventEmitter.getEmittedEvents().map(e => e.eventType);

      // Should see: BID_PLACED, PLAYER_PASSED, PLAYER_PASSED, AUCTION_WON, CARD_REVEALED
      expect(eventTypes).toContain(EVENT_TYPES.BID_PLACED);
      expect(eventTypes).toContain(EVENT_TYPES.PLAYER_PASSED);
      expect(eventTypes).toContain(EVENT_TYPES.AUCTION_WON);
      expect(eventTypes).toContain(EVENT_TYPES.CARD_REVEALED);

      // BID_PLACED should come before AUCTION_WON
      const bidIndex = eventTypes.indexOf(EVENT_TYPES.BID_PLACED);
      const wonIndex = eventTypes.lastIndexOf(EVENT_TYPES.AUCTION_WON);
      expect(bidIndex).toBeLessThan(wonIndex);
    });
  });
});
