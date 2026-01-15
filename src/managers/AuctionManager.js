/**
 * Auction Manager - handles poker-style auction logic
 */
import { EVENT_TYPES } from '../utils/Constants.js';
import { GameState } from '../core/GameState.js';

export class AuctionManager {
  constructor(eventEmitter, deckManager) {
    this.eventEmitter = eventEmitter;
    this.deckManager = deckManager;
  }

  /**
   * Initialize auction phase
   * @param {Object} state - Game state
   */
  initializeAuction(state) {
    const cardsPerAuction = state.players.length + 2;

    // Draw cards for auction
    const cardsToAuction = this.deckManager.draw(state.resourceDeck, cardsPerAuction);

    state.phaseState.auction = {
      cardsToAuction,
      currentCardIndex: 0,
      currentCard: cardsToAuction[0] || null,
      currentBid: 0,
      currentHighBidder: null,
      activeBidders: new Set(state.players.map(p => p.id)),
      startingPlayer: state.turnOrder[state.dealerIndex],
      currentPlayerIndex: state.dealerIndex, // Track whose turn it is
      lastRaiserIndex: null // Track who made the last raise
    };

    this.eventEmitter.emit(EVENT_TYPES.AUCTION_STARTED, {
      cardCount: cardsToAuction.length
    });

    if (cardsToAuction[0]) {
      this.eventEmitter.emit(EVENT_TYPES.CARD_REVEALED, {
        card: cardsToAuction[0],
        cardIndex: 0
      });
    }
  }

  /**
   * Place a bid
   * @param {Object} state - Game state
   * @param {Object} action - { playerId, amount }
   */
  placeBid(state, action) {
    const { playerId, amount } = action;
    const auction = state.phaseState.auction;

    auction.currentBid = amount;
    auction.currentHighBidder = playerId;
    auction.lastRaiserIndex = auction.currentPlayerIndex; // Track who raised

    this.eventEmitter.emit(EVENT_TYPES.BID_PLACED, {
      playerId,
      amount,
      previousBid: auction.currentBid
    });

    // Advance to next active bidder
    this.advanceToNextActiveBidder(state);
  }

  /**
   * Player passes on current card
   * @param {Object} state - Game state
   * @param {Object} action - { playerId }
   */
  pass(state, action) {
    const { playerId } = action;
    const auction = state.phaseState.auction;

    // Remove player from active bidders
    auction.activeBidders.delete(playerId);

    this.eventEmitter.emit(EVENT_TYPES.PLAYER_PASSED, {
      playerId,
      remainingBidders: Array.from(auction.activeBidders)
    });

    // Check if only one bidder left
    if (auction.activeBidders.size === 1) {
      this.completeCurrentCardAuction(state);
      return;
    } else if (auction.activeBidders.size === 0) {
      // Everyone passed - card goes to discard
      this.deckManager.discard(state.resourceDeck, [auction.currentCard]);
      this.moveToNextCard(state);
      return;
    }

    // Advance to next active bidder
    this.advanceToNextActiveBidder(state);

    // Check if it's come back to the last raiser (poker-style completion)
    if (auction.lastRaiserIndex !== null &&
        auction.currentPlayerIndex === auction.lastRaiserIndex &&
        auction.currentHighBidder !== null) {
      // Bidding complete - last raiser wins
      this.completeCurrentCardAuction(state);
    }
  }

  /**
   * Complete the auction for the current card
   * @param {Object} state - Game state
   */
  completeCurrentCardAuction(state) {
    const auction = state.phaseState.auction;
    const winnerId = auction.currentHighBidder || Array.from(auction.activeBidders)[0];
    const winningBid = auction.currentBid;

    // Transfer money and card
    GameState.adjustPlayerCash(state, winnerId, -winningBid);
    GameState.addCardToHand(state, winnerId, auction.currentCard);

    this.eventEmitter.emit(EVENT_TYPES.AUCTION_WON, {
      playerId: winnerId,
      card: auction.currentCard,
      amount: winningBid
    });

    this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
      playerId: winnerId,
      oldCash: GameState.getPlayer(state, winnerId).cash + winningBid,
      newCash: GameState.getPlayer(state, winnerId).cash,
      reason: 'auction_payment'
    });

    this.eventEmitter.emit(EVENT_TYPES.PLAYER_RECEIVED_CARD, {
      playerId: winnerId,
      cardCount: 1
    });

    this.eventEmitter.emit(EVENT_TYPES.AUCTION_CARD_COMPLETE, {
      cardIndex: auction.currentCardIndex
    });

    this.moveToNextCard(state);
  }

  /**
   * Move to next card in auction
   * @param {Object} state - Game state
   */
  moveToNextCard(state) {
    const auction = state.phaseState.auction;

    // Move to next card
    auction.currentCardIndex++;

    // Rotate dealer for next card
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length;

    if (auction.currentCardIndex < auction.cardsToAuction.length) {
      // Set up next card
      auction.currentCard = auction.cardsToAuction[auction.currentCardIndex];
      auction.currentBid = 0;
      auction.currentHighBidder = null;
      auction.activeBidders = new Set(state.players.map(p => p.id));
      auction.startingPlayer = state.turnOrder[state.dealerIndex];
      auction.currentPlayerIndex = state.dealerIndex; // Reset to new dealer
      auction.lastRaiserIndex = null; // Reset for new card

      this.eventEmitter.emit(EVENT_TYPES.CARD_REVEALED, {
        card: auction.currentCard,
        cardIndex: auction.currentCardIndex
      });
    } else {
      // Auction phase complete
      this.eventEmitter.emit(EVENT_TYPES.AUCTION_PHASE_COMPLETE, {});
    }
  }

  /**
   * Advance to the next active bidder (poker-style rotation)
   * @param {Object} state - Game state
   */
  advanceToNextActiveBidder(state) {
    const auction = state.phaseState.auction;

    // Start from next player in turn order
    let nextIndex = (auction.currentPlayerIndex + 1) % state.players.length;
    let attempts = 0;

    // Find next active bidder
    while (attempts < state.players.length) {
      const nextPlayerId = state.turnOrder[nextIndex];

      if (auction.activeBidders.has(nextPlayerId)) {
        auction.currentPlayerIndex = nextIndex;
        return;
      }

      nextIndex = (nextIndex + 1) % state.players.length;
      attempts++;
    }

    // No active bidders found (shouldn't happen)
    console.warn('No active bidders found during rotation');
  }

  /**
   * Check if auction phase is complete
   * @param {Object} state - Game state
   * @returns {boolean} True if auction is complete
   */
  isAuctionComplete(state) {
    const auction = state.phaseState.auction;
    return auction && auction.currentCardIndex >= auction.cardsToAuction.length;
  }
}
