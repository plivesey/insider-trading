/**
 * Stock Change Utilities
 *
 * Utility functions for working with stock price changes.
 * Parsing is done by generate_goal_cards.py - this module only contains helpers.
 *
 * Change format: { Blue: 2, Orange: -1 }
 */

import { COLORS } from '../utils/Constants.js';

export class StockChangeParser {
  /**
   * Format changes object back to string representation
   * @param {Object} changes - Changes object
   * @returns {string} Formatted string
   */
  static format(changes) {
    const parts = [];

    for (const [color, change] of Object.entries(changes)) {
      const sign = change >= 0 ? '+' : '';
      parts.push(`${color} ${sign}${change}`);
    }

    return parts.join(', ');
  }

  /**
   * Apply stock changes to current prices
   * @param {Object} currentPrices - Current stock prices
   * @param {Object} changes - Changes to apply
   * @param {number} minPrice - Minimum allowed price
   * @param {number|null} maxPrice - Maximum allowed price (null for no max)
   * @returns {Object} New prices
   */
  static applyChanges(currentPrices, changes, minPrice = 0, maxPrice = null) {
    const newPrices = { ...currentPrices };

    for (const [color, change] of Object.entries(changes)) {
      if (newPrices[color] !== undefined) {
        let newPrice = newPrices[color] + change;

        // Apply constraints
        if (newPrice < minPrice) {
          newPrice = minPrice;
        }
        if (maxPrice !== null && newPrice > maxPrice) {
          newPrice = maxPrice;
        }

        newPrices[color] = newPrice;
      }
    }

    return newPrices;
  }

  /**
   * Accumulate multiple change sets into a single changes object
   * @param {...Object} changeSets - Multiple change objects to accumulate
   * @returns {Object} Accumulated changes
   */
  static accumulate(...changeSets) {
    const accumulated = {};

    // Initialize all colors to 0
    for (const color of COLORS) {
      accumulated[color] = 0;
    }

    // Add up all changes
    for (const changeSet of changeSets) {
      for (const [color, change] of Object.entries(changeSet)) {
        if (accumulated[color] !== undefined) {
          accumulated[color] += change;
        }
      }
    }

    return accumulated;
  }
}
