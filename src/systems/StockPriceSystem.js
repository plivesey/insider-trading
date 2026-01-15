/**
 * Stock Price System - handles stock price calculations and constraints
 */
import { COLORS, DEFAULT_CONFIG } from '../utils/Constants.js';

export class StockPriceSystem {
  constructor(config = {}) {
    this.minPrice = config.minStockPrice !== undefined ? config.minStockPrice : DEFAULT_CONFIG.minStockPrice;
    this.maxPrice = config.maxStockPrice !== undefined ? config.maxStockPrice : DEFAULT_CONFIG.maxStockPrice;
    this.initialPrice = config.startingStockPrice || DEFAULT_CONFIG.startingStockPrice;
  }

  /**
   * Create initial stock prices
   * @returns {Object} Stock prices for all colors
   */
  createInitialPrices() {
    const prices = {};
    for (const color of COLORS) {
      prices[color] = this.initialPrice;
    }
    return prices;
  }

  /**
   * Apply stock price changes
   * @param {Object} currentPrices - Current stock prices
   * @param {Object} changes - Changes to apply (e.g., {Blue: 2, Orange: -1})
   * @returns {Object} New stock prices
   */
  applyChanges(currentPrices, changes) {
    const newPrices = { ...currentPrices };

    for (const [color, change] of Object.entries(changes)) {
      if (newPrices[color] !== undefined) {
        let newPrice = newPrices[color] + change;

        // Apply price constraints
        newPrice = this.constrainPrice(newPrice);

        newPrices[color] = newPrice;
      }
    }

    return newPrices;
  }

  /**
   * Constrain a price to be within min/max bounds
   * @param {number} price - Price to constrain
   * @returns {number} Constrained price
   */
  constrainPrice(price) {
    if (price < this.minPrice) {
      return this.minPrice;
    }

    if (this.maxPrice !== null && price > this.maxPrice) {
      return this.maxPrice;
    }

    return price;
  }

  /**
   * Accumulate multiple change sets
   * @param {...Object} changeSets - Multiple change objects
   * @returns {Object} Accumulated changes
   */
  accumulateChanges(...changeSets) {
    const accumulated = {};

    // Initialize all colors to 0
    for (const color of COLORS) {
      accumulated[color] = 0;
    }

    // Sum all changes
    for (const changeSet of changeSets) {
      for (const [color, change] of Object.entries(changeSet)) {
        if (accumulated[color] !== undefined) {
          accumulated[color] += change;
        }
      }
    }

    return accumulated;
  }

  /**
   * Get the color(s) with the lowest price
   * @param {Object} prices - Current stock prices
   * @returns {Array<string>} Array of color names (can be multiple if tied)
   */
  getLowestPriceColors(prices) {
    const minPrice = Math.min(...Object.values(prices));
    return Object.keys(prices).filter(color => prices[color] === minPrice);
  }

  /**
   * Get the color(s) with the highest price
   * @param {Object} prices - Current stock prices
   * @returns {Array<string>} Array of color names (can be multiple if tied)
   */
  getHighestPriceColors(prices) {
    const maxPrice = Math.max(...Object.values(prices));
    return Object.keys(prices).filter(color => prices[color] === maxPrice);
  }

  /**
   * Calculate total value of cards at current prices
   * @param {Array} cards - Array of resource cards
   * @param {Object} prices - Current stock prices
   * @returns {number} Total value
   */
  calculateCardValue(cards, prices) {
    let total = 0;
    for (const card of cards) {
      if (card.color && prices[card.color] !== undefined) {
        total += prices[card.color];
      }
    }
    return total;
  }

  /**
   * Get a diff between old and new prices
   * @param {Object} oldPrices - Old prices
   * @param {Object} newPrices - New prices
   * @returns {Object} Changes that occurred
   */
  getDiff(oldPrices, newPrices) {
    const diff = {};

    for (const color of COLORS) {
      const change = newPrices[color] - oldPrices[color];
      if (change !== 0) {
        diff[color] = change;
      }
    }

    return diff;
  }

  /**
   * Format prices for display
   * @param {Object} prices - Stock prices
   * @returns {string} Formatted string
   */
  format(prices) {
    return Object.entries(prices)
      .map(([color, price]) => `${color}: $${price}`)
      .join(', ');
  }
}
