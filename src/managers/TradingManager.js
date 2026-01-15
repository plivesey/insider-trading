/**
 * Trading Manager - handles trade proposals, acceptance, and auto-cancellation
 */
import { uuid } from '../utils/uuid.js';
import { EVENT_TYPES, OFFER_STATUS } from '../utils/Constants.js';
import { GameState } from '../core/GameState.js';

export class TradingManager {
  constructor(eventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Initialize trading phase
   * @param {Object} state - Game state
   */
  initializeTrading(state) {
    state.phaseState.trading = {
      activeOffers: [],
      timeRemaining: state.config.tradingDuration,
      timerStarted: Date.now()
    };

    this.eventEmitter.emit(EVENT_TYPES.TRADING_PHASE_STARTED, {
      duration: state.config.tradingDuration
    });
  }

  /**
   * Propose a trade
   * @param {Object} state - Game state
   * @param {Object} action - { playerId, offering, requesting }
   */
  proposeTrade(state, action) {
    const { playerId, offering, requesting } = action;
    const trading = state.phaseState.trading;

    const offer = {
      offerId: uuid(),
      offeringPlayer: playerId,
      offering: {
        cards: offering.cards || [],
        cash: offering.cash || 0
      },
      requesting: {
        cards: requesting.cards || [], // Array of {color, count}
        cash: requesting.cash || 0
      },
      timestamp: Date.now(),
      status: OFFER_STATUS.ACTIVE
    };

    trading.activeOffers.push(offer);

    this.eventEmitter.emit(EVENT_TYPES.TRADE_PROPOSED, {
      offerId: offer.offerId,
      offer
    });
  }

  /**
   * Accept a trade
   * @param {Object} state - Game state
   * @param {Object} action - { playerId, offerId }
   */
  acceptTrade(state, action) {
    const { playerId, offerId } = action;
    const trading = state.phaseState.trading;

    const offer = trading.activeOffers.find(o => o.offerId === offerId);
    if (!offer || offer.status !== OFFER_STATUS.ACTIVE) {
      return;
    }

    const offeringPlayer = offer.offeringPlayer;
    const acceptingPlayer = playerId;

    // Mark offer as accepted
    offer.status = OFFER_STATUS.ACCEPTED;

    this.eventEmitter.emit(EVENT_TYPES.TRADE_ACCEPTED, {
      offerId,
      acceptingPlayer
    });

    // Execute the trade
    this.executeTrade(state, offer, acceptingPlayer);

    // Auto-cancel invalid offers from both players
    this.autoCancelInvalidOffers(state, offeringPlayer);
    this.autoCancelInvalidOffers(state, acceptingPlayer);
  }

  /**
   * Execute a trade (transfer resources)
   * @param {Object} state - Game state
   * @param {Object} offer - Trade offer
   * @param {string} acceptingPlayer - Player ID accepting the trade
   */
  executeTrade(state, offer, acceptingPlayer) {
    const offeringPlayer = offer.offeringPlayer;

    // Transfer cards from offering player to accepting player
    for (const cardId of offer.offering.cards) {
      const card = GameState.removeCardFromHand(state, offeringPlayer, cardId);
      if (card) {
        GameState.addCardToHand(state, acceptingPlayer, card);
      }
    }

    // Transfer cards from accepting player to offering player
    for (const cardReq of offer.requesting.cards) {
      const cards = GameState.removeCardsByColor(state, acceptingPlayer, cardReq.color, cardReq.count);
      for (const card of cards) {
        GameState.addCardToHand(state, offeringPlayer, card);
      }
    }

    // Transfer cash from offering player to accepting player
    if (offer.offering.cash > 0) {
      GameState.adjustPlayerCash(state, offeringPlayer, -offer.offering.cash);
      GameState.adjustPlayerCash(state, acceptingPlayer, offer.offering.cash);

      this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
        playerId: offeringPlayer,
        newCash: GameState.getPlayer(state, offeringPlayer).cash,
        reason: 'trade'
      });

      this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
        playerId: acceptingPlayer,
        newCash: GameState.getPlayer(state, acceptingPlayer).cash,
        reason: 'trade'
      });
    }

    // Transfer cash from accepting player to offering player
    if (offer.requesting.cash > 0) {
      GameState.adjustPlayerCash(state, acceptingPlayer, -offer.requesting.cash);
      GameState.adjustPlayerCash(state, offeringPlayer, offer.requesting.cash);

      this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
        playerId: acceptingPlayer,
        newCash: GameState.getPlayer(state, acceptingPlayer).cash,
        reason: 'trade'
      });

      this.eventEmitter.emit(EVENT_TYPES.PLAYER_CASH_CHANGED, {
        playerId: offeringPlayer,
        newCash: GameState.getPlayer(state, offeringPlayer).cash,
        reason: 'trade'
      });
    }

    this.eventEmitter.emit(EVENT_TYPES.TRADE_COMPLETED, {
      offerId: offer.offerId,
      offeringPlayer,
      acceptingPlayer
    });
  }

  /**
   * Cancel a trade offer
   * @param {Object} state - Game state
   * @param {Object} action - { playerId, offerId }
   */
  cancelTrade(state, action) {
    const { offerId } = action;
    const trading = state.phaseState.trading;

    const offer = trading.activeOffers.find(o => o.offerId === offerId);
    if (offer && offer.status === OFFER_STATUS.ACTIVE) {
      offer.status = OFFER_STATUS.CANCELLED;

      this.eventEmitter.emit(EVENT_TYPES.TRADE_CANCELLED, {
        offerId,
        reason: 'manual_cancellation'
      });
    }
  }

  /**
   * Auto-cancel offers that are no longer valid for a player
   * @param {Object} state - Game state
   * @param {string} playerId - Player ID
   */
  autoCancelInvalidOffers(state, playerId) {
    const trading = state.phaseState.trading;
    const player = GameState.getPlayer(state, playerId);

    for (const offer of trading.activeOffers) {
      if (offer.status !== OFFER_STATUS.ACTIVE) continue;

      // Check if this player is the offering player
      if (offer.offeringPlayer === playerId) {
        // Check if player still has offered cards
        const hasCards = offer.offering.cards.every(cardId =>
          player.hand.some(c => c.id === cardId)
        );

        // Check if player still has offered cash
        const hasCash = player.cash >= offer.offering.cash;

        if (!hasCards || !hasCash) {
          offer.status = OFFER_STATUS.CANCELLED;
          this.eventEmitter.emit(EVENT_TYPES.TRADE_CANCELLED, {
            offerId: offer.offerId,
            reason: 'auto_cancel_insufficient_resources'
          });
        }
      }
    }
  }

  /**
   * End trading phase
   * @param {Object} state - Game state
   */
  endTrading(state) {
    this.eventEmitter.emit(EVENT_TYPES.TRADING_PHASE_ENDED, {});
  }

  /**
   * Update trading timer
   * @param {Object} state - Game state
   */
  updateTimer(state) {
    const trading = state.phaseState.trading;
    const elapsed = Date.now() - trading.timerStarted;
    trading.timeRemaining = Math.max(0, state.config.tradingDuration - elapsed);

    this.eventEmitter.emit(EVENT_TYPES.TRADING_TIMER_TICK, {
      timeRemaining: trading.timeRemaining
    });
  }

  /**
   * Check if trading time has expired
   * @param {Object} state - Game state
   * @returns {boolean} True if time expired
   */
  isTimeExpired(state) {
    const trading = state.phaseState.trading;
    return trading.timeRemaining <= 0;
  }
}
