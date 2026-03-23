/**
 * Base Card class
 */
import { uuid } from '../utils/uuid.js';
import { CARD_TYPES } from '../utils/Constants.js';

export class Card {
  constructor(type, data = {}) {
    this.id = data.id || uuid();
    this.type = type;
  }

  /**
   * Get a plain object representation of the card
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type
    };
  }

  /**
   * Create a card from a plain object
   * @param {Object} data
   * @returns {Card}
   */
  static fromJSON(data) {
    return new Card(data.type, data);
  }
}
