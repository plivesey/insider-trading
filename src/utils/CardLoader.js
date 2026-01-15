/**
 * Card Loader - loads and enriches cards from JSON files
 */
import { ResourceCard } from '../models/ResourceCard.js';
import { GoalCard } from '../models/GoalCard.js';
import { COLORS } from './Constants.js';

export class CardLoader {
  /**
   * Load resource cards from JSON array
   * @param {Array} jsonData - Array of resource card data (just {color: "Blue"})
   * @returns {Array<ResourceCard>} Array of ResourceCard instances
   */
  static loadResourceCards(jsonData) {
    if (!Array.isArray(jsonData)) {
      throw new Error('Resource cards JSON must be an array');
    }

    return jsonData.map(data => ResourceCard.fromMinimalJSON(data));
  }

  /**
   * Load goal cards from JSON array
   * @param {Array} jsonData - Array of goal card data from Python generator
   * @returns {Array<GoalCard>} Array of GoalCard instances
   */
  static loadGoalCards(jsonData) {
    if (!Array.isArray(jsonData)) {
      throw new Error('Goal cards JSON must be an array');
    }

    return jsonData.map(data => GoalCard.fromJSON(data));
  }

  /**
   * Create a standard resource deck with equal distribution of colors
   * @param {number} cardsPerColor - Number of cards per color (default 10)
   * @returns {Array<ResourceCard>} Array of ResourceCard instances
   */
  static createStandardResourceDeck(cardsPerColor = 10) {
    const cards = [];

    for (const color of COLORS) {
      for (let i = 0; i < cardsPerColor; i++) {
        cards.push(new ResourceCard(color));
      }
    }

    return cards;
  }

  /**
   * Create resource cards from a simple JSON structure
   * @param {Array} jsonData - Array with color strings or objects
   * @returns {Array<ResourceCard>}
   */
  static fromSimpleJSON(jsonData) {
    return jsonData.map(item => {
      const color = typeof item === 'string' ? item : item.color;
      return new ResourceCard(color);
    });
  }

  /**
   * Load cards from a file (Node.js environment only - not browser compatible)
   * NOTE: This method is disabled for browser compatibility.
   * In browsers, use fetch() to load JSON and then call loadResourceCards() or loadGoalCards()
   * @param {string} filePath - Path to JSON file
   * @param {string} type - 'resource' or 'goal'
   * @returns {Promise<Array>} Array of card instances
   */
  static async loadFromFile(filePath, type = 'resource') {
    throw new Error('loadFromFile() is not available in browsers. Use fetch() to load JSON files.');
  }

  /**
   * Convert cards array to JSON format
   * @param {Array} cards - Array of Card instances
   * @returns {Array} Array of plain objects
   */
  static toJSON(cards) {
    return cards.map(card => card.toJSON());
  }
}
