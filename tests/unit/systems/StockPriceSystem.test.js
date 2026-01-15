/**
 * Unit tests for StockPriceSystem
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { StockPriceSystem } from '../../../src/systems/StockPriceSystem.js';
import { createStockPrices, createResourceCard } from '../../helpers/builders.js';

describe('StockPriceSystem', () => {
  let system;

  beforeEach(() => {
    system = new StockPriceSystem({
      minStockPrice: 0,
      maxStockPrice: null,
      startingStockPrice: 4
    });
  });

  describe('constructor', () => {
    test('should initialize with default config', () => {
      const sys = new StockPriceSystem();
      expect(sys.minPrice).toBeDefined();
      expect(sys.maxPrice).toBeDefined();
      expect(sys.initialPrice).toBeDefined();
    });

    test('should initialize with custom config', () => {
      const sys = new StockPriceSystem({
        minStockPrice: 1,
        maxStockPrice: 10,
        startingStockPrice: 5
      });
      expect(sys.minPrice).toBe(1);
      expect(sys.maxPrice).toBe(10);
      expect(sys.initialPrice).toBe(5);
    });
  });

  describe('createInitialPrices', () => {
    test('should create prices for all four colors', () => {
      const prices = system.createInitialPrices();
      expect(prices).toHaveProperty('Blue');
      expect(prices).toHaveProperty('Orange');
      expect(prices).toHaveProperty('Yellow');
      expect(prices).toHaveProperty('Purple');
    });

    test('should set all prices to initial price', () => {
      const prices = system.createInitialPrices();
      expect(prices.Blue).toBe(4);
      expect(prices.Orange).toBe(4);
      expect(prices.Yellow).toBe(4);
      expect(prices.Purple).toBe(4);
    });

    test('should use custom initial price', () => {
      const sys = new StockPriceSystem({ startingStockPrice: 10 });
      const prices = sys.createInitialPrices();
      expect(prices.Blue).toBe(10);
    });
  });

  describe('applyChanges', () => {
    test('should apply positive price changes', () => {
      const prices = createStockPrices(4);
      const changes = { Blue: 2, Orange: 1 };
      const newPrices = system.applyChanges(prices, changes);

      expect(newPrices.Blue).toBe(6);
      expect(newPrices.Orange).toBe(5);
      expect(newPrices.Yellow).toBe(4);
      expect(newPrices.Purple).toBe(4);
    });

    test('should apply negative price changes', () => {
      const prices = createStockPrices(4);
      const changes = { Blue: -2, Orange: -1 };
      const newPrices = system.applyChanges(prices, changes);

      expect(newPrices.Blue).toBe(2);
      expect(newPrices.Orange).toBe(3);
    });

    test('should apply mixed price changes', () => {
      const prices = createStockPrices(4);
      const changes = { Blue: 2, Orange: -2 };
      const newPrices = system.applyChanges(prices, changes);

      expect(newPrices.Blue).toBe(6);
      expect(newPrices.Orange).toBe(2);
    });

    test('should not mutate original prices', () => {
      const prices = createStockPrices(4);
      const changes = { Blue: 2 };
      system.applyChanges(prices, changes);

      expect(prices.Blue).toBe(4); // Original unchanged
    });

    test('should enforce minimum price constraint', () => {
      const prices = createStockPrices(2);
      const changes = { Blue: -5 };
      const newPrices = system.applyChanges(prices, changes);

      expect(newPrices.Blue).toBe(0); // Constrained to min
    });

    test('should enforce maximum price constraint when set', () => {
      const sys = new StockPriceSystem({
        minStockPrice: 0,
        maxStockPrice: 10,
        startingStockPrice: 4
      });
      const prices = createStockPrices(8);
      const changes = { Blue: 5 };
      const newPrices = sys.applyChanges(prices, changes);

      expect(newPrices.Blue).toBe(10); // Constrained to max
    });

    test('should handle empty changes', () => {
      const prices = createStockPrices(4);
      const newPrices = system.applyChanges(prices, {});

      expect(newPrices).toEqual(prices);
    });

    test('should ignore unknown colors', () => {
      const prices = createStockPrices(4);
      const changes = { UnknownColor: 5 };
      const newPrices = system.applyChanges(prices, changes);

      expect(newPrices).toEqual(prices);
    });
  });

  describe('constrainPrice', () => {
    test('should not change price within bounds', () => {
      expect(system.constrainPrice(5)).toBe(5);
    });

    test('should constrain price to minimum', () => {
      expect(system.constrainPrice(-5)).toBe(0);
    });

    test('should constrain price to maximum when set', () => {
      const sys = new StockPriceSystem({ maxStockPrice: 10 });
      expect(sys.constrainPrice(15)).toBe(10);
    });

    test('should not constrain to maximum when null', () => {
      expect(system.constrainPrice(100)).toBe(100);
    });
  });

  describe('accumulateChanges', () => {
    test('should accumulate single change set', () => {
      const changes1 = { Blue: 2, Orange: -1 };
      const result = system.accumulateChanges(changes1);

      expect(result.Blue).toBe(2);
      expect(result.Orange).toBe(-1);
      expect(result.Yellow).toBe(0);
      expect(result.Purple).toBe(0);
    });

    test('should accumulate multiple change sets', () => {
      const changes1 = { Blue: 2, Orange: -1 };
      const changes2 = { Blue: 1, Yellow: 2 };
      const result = system.accumulateChanges(changes1, changes2);

      expect(result.Blue).toBe(3);
      expect(result.Orange).toBe(-1);
      expect(result.Yellow).toBe(2);
      expect(result.Purple).toBe(0);
    });

    test('should handle overlapping changes', () => {
      const changes1 = { Blue: 2 };
      const changes2 = { Blue: -1 };
      const changes3 = { Blue: 1 };
      const result = system.accumulateChanges(changes1, changes2, changes3);

      expect(result.Blue).toBe(2);
    });

    test('should handle empty change sets', () => {
      const result = system.accumulateChanges({}, {});

      expect(result.Blue).toBe(0);
      expect(result.Orange).toBe(0);
      expect(result.Yellow).toBe(0);
      expect(result.Purple).toBe(0);
    });

    test('should initialize all colors to zero', () => {
      const result = system.accumulateChanges();

      expect(result).toHaveProperty('Blue', 0);
      expect(result).toHaveProperty('Orange', 0);
      expect(result).toHaveProperty('Yellow', 0);
      expect(result).toHaveProperty('Purple', 0);
    });
  });

  describe('getLowestPriceColors', () => {
    test('should return color with lowest price', () => {
      const prices = { Blue: 4, Orange: 2, Yellow: 5, Purple: 3 };
      const result = system.getLowestPriceColors(prices);

      expect(result).toEqual(['Orange']);
    });

    test('should return multiple colors when tied', () => {
      const prices = { Blue: 2, Orange: 2, Yellow: 5, Purple: 3 };
      const result = system.getLowestPriceColors(prices);

      expect(result).toHaveLength(2);
      expect(result).toContain('Blue');
      expect(result).toContain('Orange');
    });

    test('should return all colors when all prices equal', () => {
      const prices = createStockPrices(4);
      const result = system.getLowestPriceColors(prices);

      expect(result).toHaveLength(4);
    });
  });

  describe('getHighestPriceColors', () => {
    test('should return color with highest price', () => {
      const prices = { Blue: 4, Orange: 2, Yellow: 5, Purple: 3 };
      const result = system.getHighestPriceColors(prices);

      expect(result).toEqual(['Yellow']);
    });

    test('should return multiple colors when tied', () => {
      const prices = { Blue: 5, Orange: 2, Yellow: 5, Purple: 3 };
      const result = system.getHighestPriceColors(prices);

      expect(result).toHaveLength(2);
      expect(result).toContain('Blue');
      expect(result).toContain('Yellow');
    });

    test('should return all colors when all prices equal', () => {
      const prices = createStockPrices(4);
      const result = system.getHighestPriceColors(prices);

      expect(result).toHaveLength(4);
    });
  });

  describe('calculateCardValue', () => {
    test('should calculate value of single card', () => {
      const cards = [createResourceCard('Blue')];
      const prices = { Blue: 5, Orange: 4, Yellow: 3, Purple: 2 };
      const value = system.calculateCardValue(cards, prices);

      expect(value).toBe(5);
    });

    test('should calculate value of multiple cards', () => {
      const cards = [
        createResourceCard('Blue'),
        createResourceCard('Blue'),
        createResourceCard('Orange')
      ];
      const prices = { Blue: 5, Orange: 4, Yellow: 3, Purple: 2 };
      const value = system.calculateCardValue(cards, prices);

      expect(value).toBe(14); // 5 + 5 + 4
    });

    test('should calculate value of mixed colors', () => {
      const cards = [
        createResourceCard('Blue'),
        createResourceCard('Orange'),
        createResourceCard('Yellow'),
        createResourceCard('Purple')
      ];
      const prices = { Blue: 5, Orange: 4, Yellow: 3, Purple: 2 };
      const value = system.calculateCardValue(cards, prices);

      expect(value).toBe(14); // 5 + 4 + 3 + 2
    });

    test('should return 0 for empty hand', () => {
      const value = system.calculateCardValue([], createStockPrices(4));
      expect(value).toBe(0);
    });

    test('should ignore cards with unknown colors', () => {
      const cards = [
        createResourceCard('Blue'),
        { color: 'UnknownColor' }
      ];
      const prices = { Blue: 5, Orange: 4, Yellow: 3, Purple: 2 };
      const value = system.calculateCardValue(cards, prices);

      expect(value).toBe(5);
    });
  });

  describe('getDiff', () => {
    test('should calculate diff between prices', () => {
      const oldPrices = createStockPrices(4);
      const newPrices = { Blue: 6, Orange: 3, Yellow: 4, Purple: 5 };
      const diff = system.getDiff(oldPrices, newPrices);

      expect(diff).toEqual({
        Blue: 2,
        Orange: -1,
        Purple: 1
      });
    });

    test('should omit unchanged prices from diff', () => {
      const oldPrices = createStockPrices(4);
      const newPrices = { ...oldPrices, Blue: 6 };
      const diff = system.getDiff(oldPrices, newPrices);

      expect(diff).toEqual({ Blue: 2 });
      expect(diff).not.toHaveProperty('Orange');
    });

    test('should return empty object when no changes', () => {
      const prices = createStockPrices(4);
      const diff = system.getDiff(prices, prices);

      expect(diff).toEqual({});
    });
  });

  describe('format', () => {
    test('should format prices as string', () => {
      const prices = { Blue: 5, Orange: 4, Yellow: 3, Purple: 2 };
      const formatted = system.format(prices);

      expect(formatted).toContain('Blue: $5');
      expect(formatted).toContain('Orange: $4');
      expect(formatted).toContain('Yellow: $3');
      expect(formatted).toContain('Purple: $2');
    });

    test('should separate prices with commas', () => {
      const prices = createStockPrices(4);
      const formatted = system.format(prices);

      expect(formatted).toMatch(/,/);
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete price update cycle', () => {
      // Initial prices
      const prices = system.createInitialPrices();
      expect(prices.Blue).toBe(4);

      // Apply changes
      const changes = { Blue: 2, Orange: -2 };
      const newPrices = system.applyChanges(prices, changes);
      expect(newPrices.Blue).toBe(6);
      expect(newPrices.Orange).toBe(2);

      // Get diff
      const diff = system.getDiff(prices, newPrices);
      expect(diff).toEqual({ Blue: 2, Orange: -2 });

      // Find lowest
      const lowest = system.getLowestPriceColors(newPrices);
      expect(lowest).toContain('Orange');
    });

    test('should handle multiple goal card reveals', () => {
      const prices = createStockPrices(4);

      // Accumulate changes from multiple goal cards
      const change1 = { Blue: 1, Orange: -1 };
      const change2 = { Blue: 1, Yellow: 1 };
      const change3 = { Orange: -1, Purple: 2 };

      const accumulated = system.accumulateChanges(change1, change2, change3);
      expect(accumulated).toEqual({
        Blue: 2,
        Orange: -2,
        Yellow: 1,
        Purple: 2
      });

      // Apply accumulated changes
      const newPrices = system.applyChanges(prices, accumulated);
      expect(newPrices.Blue).toBe(6);
      expect(newPrices.Orange).toBe(2);
      expect(newPrices.Yellow).toBe(5);
      expect(newPrices.Purple).toBe(6);
    });

    test('should handle card valuation with updated prices', () => {
      const prices = createStockPrices(4);
      const cards = [
        createResourceCard('Blue'),
        createResourceCard('Blue'),
        createResourceCard('Orange')
      ];

      // Initial value
      const initialValue = system.calculateCardValue(cards, prices);
      expect(initialValue).toBe(12); // 4 + 4 + 4

      // Update prices
      const changes = { Blue: 2, Orange: -2 };
      const newPrices = system.applyChanges(prices, changes);

      // New value
      const newValue = system.calculateCardValue(cards, newPrices);
      expect(newValue).toBe(14); // 6 + 6 + 2
    });
  });
});
