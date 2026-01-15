/**
 * Unit tests for DeckManager
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { DeckManager } from '../../../src/managers/DeckManager.js';
import { EVENT_TYPES } from '../../../src/utils/Constants.js';
import { createResourceCard } from '../../helpers/builders.js';
import { MockEventEmitter } from '../../helpers/mocks.js';

describe('DeckManager', () => {
  let manager;
  let eventEmitter;

  beforeEach(() => {
    eventEmitter = new MockEventEmitter();
    manager = new DeckManager(eventEmitter);
  });

  describe('shuffle', () => {
    test('should shuffle array in place', () => {
      const cards = [
        createResourceCard('Blue'),
        createResourceCard('Orange'),
        createResourceCard('Yellow'),
        createResourceCard('Purple')
      ];
      const originalIds = cards.map(c => c.id);

      const result = manager.shuffle(cards);

      expect(result).toBe(cards); // Same reference
      expect(cards.map(c => c.id)).toEqual(expect.arrayContaining(originalIds));
      expect(cards.length).toBe(4);
    });

    test('should produce deterministic shuffle with seed', () => {
      const cards1 = [
        createResourceCard('Blue'),
        createResourceCard('Orange'),
        createResourceCard('Yellow'),
        createResourceCard('Purple')
      ];
      const cards2 = [
        createResourceCard('Blue'),
        createResourceCard('Orange'),
        createResourceCard('Yellow'),
        createResourceCard('Purple')
      ];

      manager.shuffle(cards1, 42);
      manager.shuffle(cards2, 42);

      expect(cards1.map(c => c.color)).toEqual(cards2.map(c => c.color));
    });

    test('should produce different shuffle without seed', () => {
      const cards1 = Array.from({ length: 20 }, (_, i) => createResourceCard('Blue'));
      const cards2 = [...cards1];
      const originalIds = cards1.map(c => c.id);

      manager.shuffle(cards1);
      manager.shuffle(cards2);

      // Very unlikely to be the same (but theoretically possible)
      const shuffled1 = cards1.map(c => c.id);
      const shuffled2 = cards2.map(c => c.id);

      // At least one should differ from original
      const changed1 = !shuffled1.every((id, i) => id === originalIds[i]);
      const changed2 = !shuffled2.every((id, i) => id === originalIds[i]);

      expect(changed1 || changed2).toBe(true);
    });

    test('should emit DECK_SHUFFLED event', () => {
      const cards = [createResourceCard('Blue'), createResourceCard('Orange')];

      manager.shuffle(cards);

      expect(eventEmitter.wasEmitted(EVENT_TYPES.DECK_SHUFFLED)).toBe(true);
      const eventData = eventEmitter.getLastEventData(EVENT_TYPES.DECK_SHUFFLED);
      expect(eventData.cardCount).toBe(2);
    });

    test('should handle empty array', () => {
      const cards = [];
      const result = manager.shuffle(cards);

      expect(result).toEqual([]);
    });

    test('should handle single card', () => {
      const cards = [createResourceCard('Blue')];
      const cardId = cards[0].id;

      manager.shuffle(cards);

      expect(cards.length).toBe(1);
      expect(cards[0].id).toBe(cardId);
    });
  });

  describe('draw', () => {
    let deck;

    beforeEach(() => {
      deck = {
        drawPile: [
          createResourceCard('Blue'),
          createResourceCard('Orange'),
          createResourceCard('Yellow')
        ],
        discardPile: []
      };
    });

    test('should draw single card from top', () => {
      const topCardId = deck.drawPile[0].id;
      const drawn = manager.draw(deck, 1);

      expect(drawn.length).toBe(1);
      expect(drawn[0].id).toBe(topCardId);
      expect(deck.drawPile.length).toBe(2);
    });

    test('should draw multiple cards', () => {
      const topTwoIds = [deck.drawPile[0].id, deck.drawPile[1].id];
      const drawn = manager.draw(deck, 2);

      expect(drawn.length).toBe(2);
      expect(drawn.map(c => c.id)).toEqual(topTwoIds);
      expect(deck.drawPile.length).toBe(1);
    });

    test('should draw all cards if count is exact', () => {
      const drawn = manager.draw(deck, 3);

      expect(drawn.length).toBe(3);
      expect(deck.drawPile.length).toBe(0);
    });

    test('should handle drawing more cards than available', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const drawn = manager.draw(deck, 10);

      expect(drawn.length).toBe(3);
      expect(deck.drawPile.length).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test('should emit CARD_DRAWN event', () => {
      manager.draw(deck, 2);

      expect(eventEmitter.wasEmitted(EVENT_TYPES.CARD_DRAWN)).toBe(true);
      const eventData = eventEmitter.getLastEventData(EVENT_TYPES.CARD_DRAWN);
      expect(eventData.count).toBe(2);
    });

    test('should not emit event when drawing zero cards', () => {
      deck.drawPile = [];
      manager.draw(deck, 1);

      expect(eventEmitter.wasEmitted(EVENT_TYPES.CARD_DRAWN)).toBe(false);
    });

    test('should default to drawing 1 card', () => {
      const drawn = manager.draw(deck);

      expect(drawn.length).toBe(1);
    });
  });

  describe('discard', () => {
    let deck;

    beforeEach(() => {
      deck = {
        drawPile: [createResourceCard('Blue')],
        discardPile: []
      };
    });

    test('should add cards to discard pile', () => {
      const cards = [createResourceCard('Orange'), createResourceCard('Yellow')];

      manager.discard(deck, cards);

      expect(deck.discardPile.length).toBe(2);
      expect(deck.discardPile).toEqual(cards);
    });

    test('should append to existing discard pile', () => {
      deck.discardPile = [createResourceCard('Purple')];
      const cards = [createResourceCard('Orange')];

      manager.discard(deck, cards);

      expect(deck.discardPile.length).toBe(2);
      expect(deck.discardPile[0].color).toBe('Purple');
      expect(deck.discardPile[1].color).toBe('Orange');
    });

    test('should handle empty array', () => {
      manager.discard(deck, []);

      expect(deck.discardPile.length).toBe(0);
    });
  });

  describe('peekTop', () => {
    let deck;

    beforeEach(() => {
      deck = {
        drawPile: [
          createResourceCard('Blue'),
          createResourceCard('Orange'),
          createResourceCard('Yellow')
        ],
        discardPile: []
      };
    });

    test('should peek at top card without removing it', () => {
      const topCardId = deck.drawPile[0].id;
      const peeked = manager.peekTop(deck, 1);

      expect(peeked.length).toBe(1);
      expect(peeked[0].id).toBe(topCardId);
      expect(deck.drawPile.length).toBe(3); // Unchanged
    });

    test('should peek at multiple cards', () => {
      const topTwoIds = [deck.drawPile[0].id, deck.drawPile[1].id];
      const peeked = manager.peekTop(deck, 2);

      expect(peeked.length).toBe(2);
      expect(peeked.map(c => c.id)).toEqual(topTwoIds);
      expect(deck.drawPile.length).toBe(3); // Unchanged
    });

    test('should return fewer cards if not enough available', () => {
      const peeked = manager.peekTop(deck, 10);

      expect(peeked.length).toBe(3);
    });

    test('should default to peeking 1 card', () => {
      const peeked = manager.peekTop(deck);

      expect(peeked.length).toBe(1);
    });

    test('should return empty array for empty deck', () => {
      deck.drawPile = [];
      const peeked = manager.peekTop(deck, 5);

      expect(peeked).toEqual([]);
    });
  });

  describe('placeOnTop', () => {
    let deck;

    beforeEach(() => {
      deck = {
        drawPile: [createResourceCard('Blue'), createResourceCard('Orange')],
        discardPile: []
      };
    });

    test('should place card on top of deck', () => {
      const newCard = createResourceCard('Yellow');

      manager.placeOnTop(deck, newCard);

      expect(deck.drawPile.length).toBe(3);
      expect(deck.drawPile[0].id).toBe(newCard.id);
    });

    test('should work on empty deck', () => {
      deck.drawPile = [];
      const newCard = createResourceCard('Yellow');

      manager.placeOnTop(deck, newCard);

      expect(deck.drawPile.length).toBe(1);
      expect(deck.drawPile[0].id).toBe(newCard.id);
    });
  });

  describe('placeOnBottom', () => {
    let deck;

    beforeEach(() => {
      deck = {
        drawPile: [createResourceCard('Blue'), createResourceCard('Orange')],
        discardPile: []
      };
    });

    test('should place card on bottom of deck', () => {
      const newCard = createResourceCard('Yellow');

      manager.placeOnBottom(deck, newCard);

      expect(deck.drawPile.length).toBe(3);
      expect(deck.drawPile[2].id).toBe(newCard.id);
    });

    test('should work on empty deck', () => {
      deck.drawPile = [];
      const newCard = createResourceCard('Yellow');

      manager.placeOnBottom(deck, newCard);

      expect(deck.drawPile.length).toBe(1);
      expect(deck.drawPile[0].id).toBe(newCard.id);
    });
  });

  describe('rearrangeTop', () => {
    let deck;

    beforeEach(() => {
      deck = {
        drawPile: [
          createResourceCard('Blue'),
          createResourceCard('Orange'),
          createResourceCard('Yellow'),
          createResourceCard('Purple')
        ],
        discardPile: []
      };
    });

    test('should rearrange top N cards', () => {
      const [card0, card1, card2] = deck.drawPile;
      const newOrder = [card2.id, card0.id, card1.id];

      manager.rearrangeTop(deck, newOrder);

      expect(deck.drawPile[0].id).toBe(card2.id);
      expect(deck.drawPile[1].id).toBe(card0.id);
      expect(deck.drawPile[2].id).toBe(card1.id);
      expect(deck.drawPile[3].color).toBe('Purple'); // Unchanged
    });

    test('should throw error if count mismatch', () => {
      // Trying to rearrange 5 cards when deck only has 4
      expect(() => {
        manager.rearrangeTop(deck, ['id1', 'id2', 'id3', 'id4', 'id5']);
      }).toThrow('Cannot rearrange');
    });

    test('should throw error if card ID not found', () => {
      expect(() => {
        manager.rearrangeTop(deck, ['fake-id']);
      }).toThrow('not found');
    });

    test('should handle rearranging all cards', () => {
      const allIds = deck.drawPile.map(c => c.id).reverse();

      manager.rearrangeTop(deck, allIds);

      expect(deck.drawPile.map(c => c.id)).toEqual(allIds);
    });
  });

  describe('swapWithTop', () => {
    let deck;

    beforeEach(() => {
      deck = {
        drawPile: [createResourceCard('Blue'), createResourceCard('Orange')],
        discardPile: []
      };
    });

    test('should swap card from hand with top card', () => {
      const topCard = deck.drawPile[0];
      const handCard = createResourceCard('Yellow');

      const received = manager.swapWithTop(deck, handCard);

      expect(received.id).toBe(topCard.id);
      expect(deck.drawPile[0].id).toBe(handCard.id);
      expect(deck.drawPile.length).toBe(2);
    });

    test('should throw error if deck is empty', () => {
      deck.drawPile = [];
      const handCard = createResourceCard('Yellow');

      expect(() => {
        manager.swapWithTop(deck, handCard);
      }).toThrow('deck is empty');
    });
  });

  describe('getRemainingCount', () => {
    test('should return count of cards in draw pile', () => {
      const deck = {
        drawPile: [
          createResourceCard('Blue'),
          createResourceCard('Orange'),
          createResourceCard('Yellow')
        ],
        discardPile: [createResourceCard('Purple')]
      };

      const count = manager.getRemainingCount(deck);

      expect(count).toBe(3);
    });

    test('should return 0 for empty deck', () => {
      const deck = { drawPile: [], discardPile: [] };
      const count = manager.getRemainingCount(deck);

      expect(count).toBe(0);
    });
  });

  describe('reshuffleDiscardPile', () => {
    let deck;

    beforeEach(() => {
      deck = {
        drawPile: [createResourceCard('Blue')],
        discardPile: [
          createResourceCard('Orange'),
          createResourceCard('Yellow'),
          createResourceCard('Purple')
        ]
      };
    });

    test('should move discard pile to draw pile and shuffle', () => {
      const discardCount = deck.discardPile.length;

      manager.reshuffleDiscardPile(deck);

      expect(deck.discardPile.length).toBe(0);
      expect(deck.drawPile.length).toBe(4); // 1 + 3
    });

    test('should emit DECK_SHUFFLED event with source', () => {
      manager.reshuffleDiscardPile(deck);

      expect(eventEmitter.wasEmitted(EVENT_TYPES.DECK_SHUFFLED)).toBe(true);
      const eventData = eventEmitter.getLastEventData(EVENT_TYPES.DECK_SHUFFLED);
      expect(eventData.cardCount).toBe(3);
      expect(eventData.source).toBe('discard_pile');
    });

    test('should handle empty discard pile', () => {
      deck.discardPile = [];

      manager.reshuffleDiscardPile(deck);

      expect(deck.drawPile.length).toBe(1);
    });
  });

  describe('without event emitter', () => {
    beforeEach(() => {
      manager = new DeckManager(null);
    });

    test('should work without event emitter', () => {
      const cards = [createResourceCard('Blue'), createResourceCard('Orange')];

      expect(() => {
        manager.shuffle(cards);
      }).not.toThrow();
    });

    test('should not emit events when emitter is null', () => {
      const deck = {
        drawPile: [createResourceCard('Blue')],
        discardPile: []
      };

      expect(() => {
        manager.draw(deck, 1);
      }).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete deck cycle', () => {
      const deck = {
        drawPile: [
          createResourceCard('Blue'),
          createResourceCard('Orange'),
          createResourceCard('Yellow')
        ],
        discardPile: []
      };

      // Draw cards
      const drawn = manager.draw(deck, 2);
      expect(deck.drawPile.length).toBe(1);

      // Discard them
      manager.discard(deck, drawn);
      expect(deck.discardPile.length).toBe(2);

      // Reshuffle discard into draw
      manager.reshuffleDiscardPile(deck);
      expect(deck.drawPile.length).toBe(3);
      expect(deck.discardPile.length).toBe(0);
    });

    test('should handle peek, rearrange, and draw sequence', () => {
      const deck = {
        drawPile: [
          createResourceCard('Blue'),
          createResourceCard('Orange'),
          createResourceCard('Yellow')
        ],
        discardPile: []
      };

      // Peek at top 3
      const peeked = manager.peekTop(deck, 3);
      expect(peeked.length).toBe(3);

      // Rearrange them
      const newOrder = [peeked[2].id, peeked[0].id, peeked[1].id];
      manager.rearrangeTop(deck, newOrder);

      // Draw and verify order
      const drawn = manager.draw(deck, 3);
      expect(drawn.map(c => c.id)).toEqual(newOrder);
    });
  });
});
