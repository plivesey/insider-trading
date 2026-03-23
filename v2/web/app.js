/**
 * Main Application Controller for Insider Trading Web Game
 * Coordinates game engine, AI players, and UI
 */
import { GameEngine } from '../src/core/GameEngine.js?v=2';
import { ResourceCard } from '../src/models/ResourceCard.js?v=2';
import { GoalCard } from '../src/models/GoalCard.js?v=2';
import { EVENT_TYPES, PHASES } from '../src/utils/Constants.js?v=2';
import { ConservativeAI } from './ai/ConservativeAI.js?v=2';
import { GameUI } from './ui/GameUI.js?v=2';

class GameApp {
  constructor() {
    this.engine = null;
    this.ui = null;
    this.aiPlayers = new Map();
    this.humanPlayerId = 'human';
    this.isProcessingAITurn = false;
  }

  /**
   * Initialize the application
   */
  async initialize() {
    console.log('Initializing Insider Trading game...');

    // Set up start button
    const startBtn = document.getElementById('start-game-btn');
    startBtn.addEventListener('click', () => this.startNewGame());

    // Set up new game button
    const newGameBtn = document.getElementById('new-game-btn');
    newGameBtn.addEventListener('click', () => this.resetAndStartNewGame());

    console.log('App initialized. Click "Start Game" to begin!');
  }

  /**
   * Start a new game
   */
  async startNewGame() {
    try {
      console.log('Starting new game...');

      // Hide start screen
      document.getElementById('start-screen').classList.add('hidden');

      // Load card decks using fetch (browser-compatible)
      const resourceCards = await this.loadCardsFromJSON('../resource_deck.json', 'resource');
      const goalCards = await this.loadCardsFromJSON('../goal_cards.json', 'goal');

      console.log(`Loaded ${resourceCards.length} resource cards and ${goalCards.length} goal cards`);

      // Create players
      const players = [
        { id: this.humanPlayerId, name: 'You' },
        { id: 'ai-conservative', name: 'Conservative Carl' },
        { id: 'ai-aggressive', name: 'Aggressive Alice' }
      ];

      // Create AI players (for now, both use ConservativeAI until AggressiveAI is implemented)
      this.aiPlayers.set('ai-conservative', new ConservativeAI('ai-conservative', 'Conservative Carl'));
      this.aiPlayers.set('ai-aggressive', new ConservativeAI('ai-aggressive', 'Aggressive Alice'));

      // Initialize game engine
      this.engine = new GameEngine();
      await this.engine.initialize(players, resourceCards, goalCards);

      // Initialize UI
      this.ui = new GameUI(this.engine, this.humanPlayerId, this);
      await this.ui.initialize();

      // Subscribe to game events
      this.subscribeToEvents();

      // Start the game
      this.engine.start();

      console.log('Game started!');

    } catch (error) {
      console.error('Error starting game:', error);
      alert(`Failed to start game: ${error.message}`);
    }
  }

  /**
   * Subscribe to game engine events
   */
  subscribeToEvents() {
    // Game state changes
    this.engine.on(EVENT_TYPES.PHASE_CHANGED, (data) => {
      console.log(`Phase changed to ${data.toPhase} (Round ${data.round})`);
      this.ui.onPhaseChange(data);

      // Check if we need to trigger AI turns
      setTimeout(() => this.processNextTurn(), 100);
    });

    this.engine.on(EVENT_TYPES.GAME_ENDED, (data) => {
      console.log('Game ended!', data);
      this.ui.showGameOver(data);
    });

    // Auction events
    this.engine.on(EVENT_TYPES.AUCTION_STARTED, (data) => {
      console.log('Auction started');
      this.processNextTurn();
    });

    this.engine.on(EVENT_TYPES.BID_PLACED, (data) => {
      console.log(`${data.playerId} bid $${data.amount}`);
      // Process next turn after bid (turn already advanced in AuctionManager)
      setTimeout(() => this.processNextTurn(), 300);
    });

    this.engine.on(EVENT_TYPES.PLAYER_PASSED, (data) => {
      console.log(`${data.playerId} passed`);
      // Process next turn after pass (turn already advanced in AuctionManager)
      setTimeout(() => this.processNextTurn(), 300);
    });

    this.engine.on(EVENT_TYPES.AUCTION_WON, (data) => {
      console.log(`${data.playerId} won auction for ${data.card.color} at $${data.amount}`);
      // Move to next card after short delay
      setTimeout(() => this.processNextTurn(), 500);
    });

    // Trading phase
    this.engine.on(EVENT_TYPES.PHASE_CHANGED, (data) => {
      if (data.toPhase === PHASES.TRADING) {
        // Start AI trading after short delay
        setTimeout(() => this.processAITrading(), 1000);
      }
      if (data.toPhase === PHASES.SELL) {
        // Start AI sell decisions after short delay
        setTimeout(() => this.processAISelling(), 1000);
      }
    });

    // When a trade is proposed, check if AI wants to accept it
    this.engine.on(EVENT_TYPES.TRADE_PROPOSED, (data) => {
      const playerId = data.offer?.offeringPlayer;
      console.log(`Trade proposed by ${playerId}`);
      // If it's a human trade, let AI evaluate it immediately
      if (playerId === this.humanPlayerId) {
        setTimeout(() => this.processAITradeEvaluation(), 500);
      }
    });

    // Goal resolution
    this.engine.on(EVENT_TYPES.GOAL_REVEALED, (data) => {
      console.log(`${data.playerId} revealed goal`);
      // Continue to next player or reward execution
      setTimeout(() => this.processNextTurn(), 1000);
    });

    this.engine.on(EVENT_TYPES.REWARD_EXECUTED, (data) => {
      console.log(`${data.playerId} executed reward`);
      // Continue to next player
      setTimeout(() => this.processNextTurn(), 500);
    });

    // Sell phase
    this.engine.on(EVENT_TYPES.PLAYER_COMMITTED_SELL, (data) => {
      console.log(`${data.playerId} committed sell`);
      // Check if all players have committed
      const state = this.engine.getState();
      const allCommitted = state.players.every(p => {
        const selection = state.phaseState.sell.playerSelections[p.id];
        return selection && selection.committed;
      });

      if (allCommitted) {
        console.log('All players committed, advancing phase...');
      }
    });
  }

  /**
   * Process the next turn (AI or human)
   */
  async processNextTurn() {
    if (this.isProcessingAITurn) {
      return; // Already processing
    }

    const state = this.engine.getState();
    if (state.status === 'completed') {
      return; // Game over
    }

    // Determine whose turn it is based on phase
    const currentPlayerId = this.getCurrentPlayer();

    if (!currentPlayerId) {
      return; // No specific player's turn (e.g., waiting for phase transition)
    }

    if (currentPlayerId === this.humanPlayerId) {
      // Human's turn - UI will handle
      console.log('Your turn!');
      this.ui.enableHumanControls();
    } else {
      // AI's turn
      await this.processAITurn(currentPlayerId);
    }
  }

  /**
   * Get the current player whose turn it is
   */
  getCurrentPlayer() {
    const state = this.engine.getState();
    const phase = state.currentPhase;

    switch (phase) {
      case PHASES.AUCTION:
        return this.getAuctionCurrentPlayer();

      case PHASES.TRADING:
        return null; // Trading is simultaneous

      case PHASES.GOAL_RESOLUTION:
        const goalState = state.phaseState.goalResolution;
        return state.turnOrder[goalState.currentPlayerIndex];

      case PHASES.SELL:
        return null; // Sell is simultaneous selection

      default:
        return null;
    }
  }

  /**
   * Get current player in auction phase
   */
  getAuctionCurrentPlayer() {
    const state = this.engine.getState();
    const auction = state.phaseState.auction;

    if (!auction || !auction.activeBidders || auction.currentPlayerIndex === undefined) {
      return null;
    }

    // Return player at currentPlayerIndex
    const playerId = state.turnOrder[auction.currentPlayerIndex];

    // Verify they're still an active bidder
    if (auction.activeBidders.has(playerId)) {
      return playerId;
    }

    return null;
  }

  /**
   * Process an AI player's turn
   */
  async processAITurn(aiPlayerId) {
    if (this.isProcessingAITurn) {
      return;
    }

    this.isProcessingAITurn = true;

    try {
      const ai = this.aiPlayers.get(aiPlayerId);
      if (!ai) {
        console.error(`No AI found for ${aiPlayerId}`);
        this.isProcessingAITurn = false;
        return;
      }

      // Delay for natural pacing
      await this.sleep(750);

      // Get AI decision
      const visibleState = this.engine.getVisibleState(aiPlayerId);
      const action = ai.decideAction(this.engine, visibleState);

      if (!action) {
        console.log(`${aiPlayerId} has no action to take`);
        this.isProcessingAITurn = false;
        return;
      }

      console.log(`${aiPlayerId} action:`, action.type);

      // Execute action
      try {
        this.engine.executeAction(action);
      } catch (error) {
        console.error(`AI action failed:`, error);
        // AI made an illegal move, try to recover by passing
        if (action.type !== 'PASS' && action.type !== 'END_TRADING') {
          console.log(`${aiPlayerId} recovering with PASS`);
          this.engine.executeAction({ type: 'PASS', playerId: aiPlayerId });
        }
      }

      this.isProcessingAITurn = false;

      // Process next turn after short delay
      setTimeout(() => this.processNextTurn(), 300);

    } catch (error) {
      console.error('Error processing AI turn:', error);
      this.isProcessingAITurn = false;
    }
  }

  /**
   * Process AI trade evaluation (check if AI wants to accept active offers)
   */
  async processAITradeEvaluation() {
    console.log('[processAITradeEvaluation] START');
    const state = this.engine.getState();

    if (state.currentPhase !== PHASES.TRADING) {
      console.log('[processAITradeEvaluation] Not in trading phase');
      return;
    }

    const activeOffers = state.phaseState.trading?.activeOffers || [];
    if (activeOffers.length === 0) {
      console.log('[processAITradeEvaluation] No active offers');
      return;
    }

    console.log('[processAITradeEvaluation] Active offers:', activeOffers.length);

    // Track which offers were declined
    const humanOffers = activeOffers.filter(offer => offer.offeringPlayer === this.humanPlayerId);
    console.log('[processAITradeEvaluation] Human offers:', humanOffers.length);
    const declines = [];

    // Each AI checks if they want to accept any active offers
    let tradeAccepted = false;
    for (const [aiId, ai] of this.aiPlayers.entries()) {
      if (state.currentPhase !== PHASES.TRADING) {
        break;
      }

      console.log(`[processAITradeEvaluation] Checking ${ai.name}`);
      const visibleState = this.engine.getVisibleState(aiId);
      const action = ai.decideTrading(this.engine, visibleState);
      console.log(`[processAITradeEvaluation] ${ai.name} action:`, action?.type);
      console.log(`[processAITradeEvaluation] ${ai.name} lastTradeDecline:`, ai.lastTradeDecline);

      // Only process ACCEPT_TRADE actions here
      if (action && action.type === 'ACCEPT_TRADE') {
        try {
          await this.sleep(500);
          this.engine.executeAction(action);
          tradeAccepted = true;
          return; // Stop after first acceptance
        } catch (error) {
          console.error(`AI trade acceptance failed:`, error);
        }
      } else if (ai.lastTradeDecline && humanOffers.some(o => o.offerId === ai.lastTradeDecline.offerId)) {
        // AI declined a human trade
        console.log(`[processAITradeEvaluation] ${ai.name} DECLINED human trade`);
        declines.push({ aiId, aiName: ai.name });
      }
    }

    console.log('[processAITradeEvaluation] Declines:', declines);

    // If no AI accepted human offers, log declines
    if (!tradeAccepted && humanOffers.length > 0 && declines.length > 0) {
      console.log('[processAITradeEvaluation] Adding decline messages to event log');
      await this.sleep(500);
      for (const decline of declines) {
        console.log(`[processAITradeEvaluation] Adding: ❌ ${decline.aiName} declined your trade`);
        this.ui.addEventLogItem(`❌ ${decline.aiName} declined your trade`);
      }
    }
    console.log('[processAITradeEvaluation] END');
  }

  /**
   * Process AI trading (periodic trading proposals)
   */
  async processAITrading() {
    const state = this.engine.getState();

    if (state.currentPhase !== PHASES.TRADING) {
      return;
    }

    // Each AI gets a chance to trade
    for (const [aiId, ai] of this.aiPlayers.entries()) {
      if (state.currentPhase !== PHASES.TRADING) {
        break;
      }

      const visibleState = this.engine.getVisibleState(aiId);
      const action = ai.decideTrading(this.engine, visibleState);

      if (action && action.type !== 'END_TRADING') {
        try {
          await this.sleep(1000);
          this.engine.executeAction(action);
        } catch (error) {
          console.error(`AI trading action failed:`, error);
        }
      }
    }

    // Schedule another round of AI trading if still in trading phase
    if (state.currentPhase === PHASES.TRADING) {
      setTimeout(() => this.processAITrading(), 2000);
    }
  }

  /**
   * Process AI selling (all AI players decide what to sell)
   */
  async processAISelling() {
    const state = this.engine.getState();

    if (state.currentPhase !== PHASES.SELL) {
      return;
    }

    // Each AI decides what to sell and commits
    for (const [aiId, ai] of this.aiPlayers.entries()) {
      if (state.currentPhase !== PHASES.SELL) {
        break;
      }

      const visibleState = this.engine.getVisibleState(aiId);
      const sellAction = ai.decideSell(this.engine, visibleState);

      if (sellAction) {
        try {
          await this.sleep(500);
          this.engine.executeAction(sellAction);

          // Also commit immediately
          await this.sleep(300);
          this.engine.executeAction({
            type: 'COMMIT_SELL',
            playerId: aiId
          });
        } catch (error) {
          console.error(`AI sell action failed:`, error);
        }
      }
    }
  }

  /**
   * Human player executes an action
   */
  executeHumanAction(action) {
    try {
      console.log('Human action:', action);
      this.engine.executeAction(action);

      // Disable controls after action
      this.ui.disableHumanControls();

      // Process next turn
      setTimeout(() => this.processNextTurn(), 300);

    } catch (error) {
      console.error('Human action failed:', error);
      alert(`Action failed: ${error.message}`);
      // Re-enable controls so player can try again
      this.ui.enableHumanControls();
    }
  }

  /**
   * Reset and start a new game
   */
  async resetAndStartNewGame() {
    // Hide game over screen
    document.getElementById('game-over-screen').classList.add('hidden');

    // Clear UI
    if (this.ui) {
      this.ui.cleanup();
    }

    // Reset state
    this.engine = null;
    this.ui = null;
    this.aiPlayers.clear();
    this.isProcessingAITurn = false;

    // Start new game
    await this.startNewGame();
  }

  /**
   * Load cards from JSON file using fetch (browser-compatible)
   */
  async loadCardsFromJSON(path, type) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.statusText}`);
    }
    const data = await response.json();

    // Parse JSON data into card objects (browser-compatible, no CardLoader)
    if (type === 'resource') {
      return data.map(cardData => ResourceCard.fromMinimalJSON(cardData));
    } else if (type === 'goal') {
      return data.map(cardData => GoalCard.fromJSON(cardData));
    } else {
      throw new Error(`Unknown card type: ${type}`);
    }
  }

  /**
   * Utility: Sleep for ms
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const app = new GameApp();
  await app.initialize();

  // Expose app globally for debugging
  window.gameApp = app;
});
