/**
 * Resource Card - represents a stock card with a color
 */
import { Card } from './Card.js';
import { CARD_TYPES, COLORS } from '../utils/Constants.js';

export class ResourceCard extends Card {
  constructor(color, data = {}) {
    super(CARD_TYPES.RESOURCE, data);

    if (!COLORS.includes(color)) {
      throw new Error(`Invalid color: ${color}. Must be one of ${COLORS.join(', ')}`);
    }

    this.color = color;
  }

  /**
   * Get a plain object representation of the card
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      color: this.color
    };
  }

  /**
   * Create a resource card from a plain object
   * @param {Object} data - Must have 'color' property
   * @returns {ResourceCard}
   */
  static fromJSON(data) {
    return new ResourceCard(data.color, data);
  }

  /**
   * Create a resource card from minimal JSON (just color)
   * @param {Object} data - JSON with color property
   * @returns {ResourceCard}
   */
  static fromMinimalJSON(data) {
    if (!data.color) {
      throw new Error('Resource card must have a color');
    }
    return new ResourceCard(data.color);
  }
}
