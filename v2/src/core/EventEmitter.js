/**
 * Simple event emitter for game events
 * Allows UI and AI to subscribe to game state changes
 */
export class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} eventType - Event type to listen for
   * @param {Function} handler - Callback function
   */
  on(eventType, handler) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(handler);
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first call)
   * @param {string} eventType - Event type to listen for
   * @param {Function} handler - Callback function
   */
  once(eventType, handler) {
    const onceHandler = (data) => {
      handler(data);
      this.off(eventType, onceHandler);
    };
    this.on(eventType, onceHandler);
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventType - Event type
   * @param {Function} handler - Handler to remove
   */
  off(eventType, handler) {
    if (!this.listeners.has(eventType)) {
      return;
    }

    const handlers = this.listeners.get(eventType);
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  emit(eventType, data = {}) {
    // Call specific event listeners
    if (this.listeners.has(eventType)) {
      const handlers = this.listeners.get(eventType);
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }

    // Call wildcard listeners (subscribed to '*')
    if (this.listeners.has('*')) {
      const handlers = this.listeners.get('*');
      handlers.forEach(handler => {
        try {
          handler({ type: eventType, ...data });
        } catch (error) {
          console.error(`Error in wildcard event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event type, or all listeners if no type specified
   * @param {string} [eventType] - Optional event type
   */
  removeAllListeners(eventType) {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get count of listeners for an event type
   * @param {string} eventType - Event type
   * @returns {number} Number of listeners
   */
  listenerCount(eventType) {
    return this.listeners.has(eventType) ? this.listeners.get(eventType).length : 0;
  }
}
