/**
 * Goal Checking Utilities
 *
 * Utilities for working with goal cards.
 * Parsing is done by generate_goal_cards.py - this module only checks goals and formats output.
 */

import { COLORS, GOAL_TYPES } from '../utils/Constants.js';

export class GoalParser {

  /**
   * Check if a player's hand meets a goal
   * @param {Object} goalCard - Goal card with parsed metadata
   * @param {Array} playerHand - Array of resource cards in player's hand
   * @returns {boolean} True if goal is met
   */
  static checkGoal(goalCard, playerHand) {
    const parsed = goalCard.metadata?.goalParsed;
    if (!parsed) {
      console.warn('Goal card missing parsed metadata');
      return false;
    }

    // Handle none_of goals
    if (parsed.type === GOAL_TYPES.NONE_OF) {
      const avoidColor = parsed.avoidColor;
      return !playerHand.some(card => card.color === avoidColor);
    }

    // Count cards by color in player's hand
    const colorCounts = {};
    for (const color of COLORS) {
      colorCounts[color] = 0;
    }

    for (const card of playerHand) {
      if (card.color && colorCounts[card.color] !== undefined) {
        colorCounts[card.color]++;
      }
    }

    // Check if requirements are met
    for (const [color, requiredCount] of Object.entries(parsed.requirements)) {
      if (colorCounts[color] < requiredCount) {
        return false;
      }
    }

    return true;
  }

  /**
   * Format requirements back to string representation
   * @param {Object} requirements - Requirements object
   * @param {string} [avoidColor] - Optional avoid color for none_of goals
   * @returns {string} Formatted string
   */
  static format(requirements, avoidColor = null) {
    if (avoidColor) {
      return `0 ${avoidColor}`;
    }

    const parts = [];
    for (const [color, count] of Object.entries(requirements)) {
      parts.push(`${count} ${color}`);
    }

    return parts.join(' + ');
  }

  /**
   * Get a human-readable description of a goal
   * @param {Object} goalCard - Goal card
   * @returns {string} Description
   */
  static describe(goalCard) {
    const parsed = goalCard.metadata?.goalParsed;
    if (!parsed) {
      return goalCard.goal || 'Unknown goal';
    }

    const typeNames = {
      [GOAL_TYPES.PAIR]: 'Pair',
      [GOAL_TYPES.PAIR_PLUS_SPECIFIC]: 'Pair Plus Specific',
      [GOAL_TYPES.THREE_OF_A_KIND]: 'Three of a Kind',
      [GOAL_TYPES.THREE_DIFFERENT]: 'Three Different',
      [GOAL_TYPES.NONE_OF]: 'None Of',
      [GOAL_TYPES.TWO_PAIR]: 'Two Pair',
      [GOAL_TYPES.ONE_OF_EVERY]: 'One of Every'
    };

    const typeName = typeNames[parsed.type] || 'Unknown';
    const goalText = goalCard.goal || this.format(parsed.requirements, parsed.avoidColor);

    return `${typeName}: ${goalText}`;
  }
}
