/**
 * Deck Manager - handles deck operations (shuffle, draw, peek, rearrange)
 */
import { EVENT_TYPES } from '../utils/Constants.js';

export class DeckManager {
  constructor(eventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Shuffle an array of cards using Fisher-Yates algorithm
   * @param {Array} cards - Array of cards to shuffle
   * @param {number} [seed] - Optional seed for deterministic shuffle
   * @returns {Array} Shuffled array (modifies in place and returns)
   */
  shuffle(cards, seed = null) {
    //  If seed is provided, use seeded random (simple implementation)
    let random = Math.random;

    if (seed !== null) {
      // Simple seeded random number generator
      let seedValue = seed;
      random = () => {
        seedValue = (seedValue * 9301 + 49297) % 233280;
        return seedValue / 233280;
      };
    }

    // Fisher-Yates shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    if (this.eventEmitter) {
      this.eventEmitter.emit(EVENT_TYPES.DECK_SHUFFLED, {
        cardCount: cards.length
      });
    }

    return cards;
  }

  /**
   * Draw cards from the top of a deck
   * @param {Object} deck - Deck object with drawPile and discardPile
   * @param {number} count - Number of cards to draw
   * @returns {Array} Array of drawn cards
   */
  draw(deck, count = 1) {
    if (deck.drawPile.length < count) {
      console.warn(`Not enough cards in draw pile: requested ${count}, have ${deck.drawPile.length}`);
      count = deck.drawPile.length;
    }

    const drawn = deck.drawPile.splice(0, count);

    if (this.eventEmitter && drawn.length > 0) {
      this.eventEmitter.emit(EVENT_TYPES.CARD_DRAWN, {
        count: drawn.length
      });
    }

    return drawn;
  }

  /**
   * Discard cards to the discard pile
   * @param {Object} deck - Deck object
   * @param {Array} cards - Cards to discard
   */
  discard(deck, cards) {
    deck.discardPile.push(...cards);
  }

  /**
   * Peek at the top N cards without removing them
   * @param {Object} deck - Deck object
   * @param {number} count - Number of cards to peek at
   * @returns {Array} Array of cards (not removed from deck)
   */
  peekTop(deck, count = 1) {
    return deck.drawPile.slice(0, count);
  }

  /**
   * Place a card on top of the deck
   * @param {Object} deck - Deck object
   * @param {Object} card - Card to place
   */
  placeOnTop(deck, card) {
    deck.drawPile.unshift(card);
  }

  /**
   * Place a card on bottom of the deck
   * @param {Object} deck - Deck object
   * @param {Object} card - Card to place
   */
  placeOnBottom(deck, card) {
    deck.drawPile.push(card);
  }

  /**
   * Rearrange the top N cards
   * @param {Object} deck - Deck object
   * @param {Array} newOrder - Array of card IDs in new order
   */
  rearrangeTop(deck, newOrder) {
    // Validate that the new order contains the same cards
    const topCards = this.peekTop(deck, newOrder.length);

    if (topCards.length !== newOrder.length) {
      throw new Error(`Cannot rearrange: deck has ${topCards.length} cards, but ${newOrder.length} were specified`);
    }

    // Create a map of card IDs to cards
    const cardMap = new Map(topCards.map(card => [card.id, card]));

    // Validate all IDs are present
    for (const id of newOrder) {
      if (!cardMap.has(id)) {
        throw new Error(`Card ID ${id} not found in top ${newOrder.length} cards`);
      }
    }

    // Remove old top cards and replace with new order
    deck.drawPile.splice(0, newOrder.length);

    const reorderedCards = newOrder.map(id => cardMap.get(id));
    deck.drawPile.unshift(...reorderedCards);
  }

  /**
   * Swap a card from hand with the top card of deck
   * @param {Object} deck - Deck object
   * @param {Object} cardFromHand - Card to swap from hand
   * @returns {Object} Card from top of deck
   */
  swapWithTop(deck, cardFromHand) {
    if (deck.drawPile.length === 0) {
      throw new Error('Cannot swap: deck is empty');
    }

    const topCard = deck.drawPile.shift();
    deck.drawPile.unshift(cardFromHand);

    return topCard;
  }

  /**
   * Get the count of cards remaining in draw pile
   * @param {Object} deck - Deck object
   * @returns {number} Number of cards
   */
  getRemainingCount(deck) {
    return deck.drawPile.length;
  }

  /**
   * Reshuffle discard pile back into draw pile
   * @param {Object} deck - Deck object
   */
  reshuffleDiscardPile(deck) {
    const cardsToReshuffle = deck.discardPile.splice(0);
    this.shuffle(cardsToReshuffle);
    deck.drawPile.push(...cardsToReshuffle);

    if (this.eventEmitter) {
      this.eventEmitter.emit(EVENT_TYPES.DECK_SHUFFLED, {
        cardCount: cardsToReshuffle.length,
        source: 'discard_pile'
      });
    }
  }
}
