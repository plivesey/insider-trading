/**
 * Test Mocks
 * Mock implementations for testing
 */

/**
 * Mock EventEmitter for testing
 * Tracks all emitted events for verification
 */
export class MockEventEmitter {
  constructor() {
    this.handlers = new Map();
    this.emittedEvents = [];
  }

  /**
   * Subscribe to an event
   * @param {string} eventType - Event type to subscribe to
   * @param {Function} handler - Handler function
   */
  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(handler);
  }

  /**
   * Emit an event
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  emit(eventType, data) {
    this.emittedEvents.push({ eventType, data, timestamp: Date.now() });

    const handlers = this.handlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  /**
   * Get all emitted events
   * @returns {Array} Array of emitted events
   */
  getEmittedEvents() {
    return this.emittedEvents;
  }

  /**
   * Get emitted events of a specific type
   * @param {string} eventType - Event type
   * @returns {Array} Array of events of that type
   */
  getEventsOfType(eventType) {
    return this.emittedEvents.filter(e => e.eventType === eventType);
  }

  /**
   * Check if an event was emitted
   * @param {string} eventType - Event type
   * @returns {boolean} True if event was emitted
   */
  wasEmitted(eventType) {
    return this.emittedEvents.some(e => e.eventType === eventType);
  }

  /**
   * Get the data from the last emitted event of a type
   * @param {string} eventType - Event type
   * @returns {*} Event data, or undefined if not found
   */
  getLastEventData(eventType) {
    const events = this.getEventsOfType(eventType);
    return events.length > 0 ? events[events.length - 1].data : undefined;
  }

  /**
   * Clear all emitted events
   */
  clearEmittedEvents() {
    this.emittedEvents = [];
  }

  /**
   * Get count of emitted events of a specific type
   * @param {string} eventType - Event type
   * @returns {number} Count of events
   */
  getEventCount(eventType) {
    return this.getEventsOfType(eventType).length;
  }

  /**
   * Verify that events were emitted in a specific order
   * @param {Array<string>} eventTypes - Expected event types in order
   * @returns {boolean} True if events match expected order
   */
  verifyEventOrder(eventTypes) {
    if (eventTypes.length > this.emittedEvents.length) {
      return false;
    }

    for (let i = 0; i < eventTypes.length; i++) {
      if (this.emittedEvents[i].eventType !== eventTypes[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get a summary of all event types emitted
   * @returns {Object} Map of event type to count
   */
  getEventSummary() {
    const summary = {};
    for (const event of this.emittedEvents) {
      summary[event.eventType] = (summary[event.eventType] || 0) + 1;
    }
    return summary;
  }
}

/**
 * Create a spy function that tracks calls
 * @returns {Function} Spy function
 */
export function createSpy() {
  const calls = [];

  const spy = (...args) => {
    calls.push(args);
  };

  spy.calls = calls;
  spy.callCount = () => calls.length;
  spy.calledWith = (...expectedArgs) => {
    return calls.some(args =>
      args.length === expectedArgs.length &&
      args.every((arg, i) => arg === expectedArgs[i])
    );
  };
  spy.reset = () => {
    calls.length = 0;
  };

  return spy;
}

/**
 * Create a mock player for testing
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock player
 */
export function createMockPlayer(overrides = {}) {
  return {
    id: 'mock-player',
    name: 'Mock Player',
    cash: 10,
    hand: [],
    goalCards: [],
    sellBonus: 0,
    pendingSellSelection: null,
    ...overrides
  };
}

/**
 * Create a mock game state for testing
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock game state
 */
export function createMockGameState(overrides = {}) {
  return {
    players: [createMockPlayer({ id: 'player1' }), createMockPlayer({ id: 'player2' })],
    resourceDeck: [],
    goalDeck: [],
    discardPile: [],
    stockPrices: { Blue: 4, Orange: 4, Yellow: 4, Purple: 4 },
    currentPhase: 'auction',
    currentRound: 1,
    currentPlayerIndex: 0,
    config: {
      startingCash: 5,
      startingResourceCards: 2,
      startingGoalCards: 3,
      minStockPrice: 0,
      maxStockPrice: null,
      startingStockPrice: 4,
      totalRounds: 3
    },
    phaseState: {},
    history: [],
    gameStarted: true,
    gameEnded: false,
    ...overrides
  };
}
