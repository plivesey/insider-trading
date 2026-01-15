# Insider Trading Board Game Engine

A comprehensive JavaScript game engine for a strategic trading and market manipulation board game. Built to be UI-agnostic, event-driven, and AI-ready.

## Features

- **Complete Game Logic**: All game rules implemented (auction, trading, goal resolution, sell phases)
- **Event-Driven Architecture**: Subscribe to game events for UI/AI integration
- **Validation System**: All player actions are validated before execution
- **State Management**: Immutable state with helper methods
- **AI-Ready**: Clean API for AI players with hidden information filtering
- **Pluggable Card Decks**: Load custom resource and goal decks from JSON

## Installation

```bash
npm install
```

## Quick Start

```javascript
import { GameEngine, CardLoader } from './src/index.js';
import fs from 'fs/promises';

// Load card decks
const resourceCards = await CardLoader.loadFromFile('./resource_deck.json', 'resource');
const goalCards = await CardLoader.loadFromFile('./goal_cards.json', 'goal');

// Create game engine
const engine = new GameEngine();

// Initialize game with players
const players = [
  { id: 'player1', name: 'Alice' },
  { id: 'player2', name: 'Bob' },
  { id: 'player3', name: 'Charlie' }
];

await engine.initialize(players, resourceCards, goalCards);

// Subscribe to events
engine.on('GAME_STARTED', (data) => {
  console.log('Game started!', data);
});

engine.on('BID_PLACED', (data) => {
  console.log(`${data.playerId} bid $${data.amount}`);
});

// Start the game
engine.start();

// Execute actions
engine.executeAction({
  type: 'PLACE_BID',
  playerId: 'player1',
  amount: 3
});
```

## Game Phases

### 1. Auction Phase
- Players bid on resource cards (poker-style: raise or pass)
- Rotating start player for each card
- Last player standing wins and pays their bid

### 2. Trading Phase
- Players propose broadcast trades (anyone can accept)
- Auto-cancellation of invalid offers
- Configurable timer (default: 2 minutes)

### 3. Goal Resolution Phase
- Players reveal goal cards one at a time (in turn order)
- Stock prices update immediately
- Rewards execute (some require player input)

### 4. Sell Phase
- Players simultaneously select cards to sell
- Commit when ready
- Execute all sells at once at current stock prices

## API Reference

### GameEngine

#### Methods

- `initialize(players, resourceCards, goalCards)` - Initialize a new game
- `start()` - Start the game
- `executeAction(action)` - Execute a player action
- `on(eventType, handler)` - Subscribe to events
- `getState()` - Get current game state
- `getVisibleState(playerId)` - Get filtered state (hides hidden information)
- `getAvailableActions(playerId)` - Get available action types for a player
- `getFinalScores()` - Get final scores (after game ends)

### Action Types

**Auction Phase:**
```javascript
{ type: 'PLACE_BID', playerId: 'player1', amount: 5 }
{ type: 'PASS', playerId: 'player1' }
```

**Trading Phase:**
```javascript
{
  type: 'PROPOSE_TRADE',
  playerId: 'player1',
  offering: { cards: ['card-id'], cash: 2 },
  requesting: { cards: [{ color: 'Blue', count: 1 }], cash: 0 }
}
{ type: 'ACCEPT_TRADE', playerId: 'player2', offerId: 'offer-id' }
{ type: 'CANCEL_TRADE', playerId: 'player1', offerId: 'offer-id' }
{ type: 'END_TRADING' }
```

**Goal Resolution Phase:**
```javascript
{ type: 'REVEAL_GOAL', playerId: 'player1', goalCardId: 'goal-id' }
{
  type: 'EXECUTE_REWARD',
  playerId: 'player1',
  choices: { targetPlayerId: 'player2' } // Varies by reward type
}
```

**Sell Phase:**
```javascript
{ type: 'SELECT_CARDS_TO_SELL', playerId: 'player1', cardIds: ['card-1', 'card-2'] }
{ type: 'COMMIT_SELL', playerId: 'player1' }
```

### Events

Subscribe to events to update your UI or AI:

```javascript
engine.on('GAME_STARTED', handler);
engine.on('PHASE_CHANGED', handler);
engine.on('BID_PLACED', handler);
engine.on('TRADE_PROPOSED', handler);
engine.on('GOAL_REVEALED', handler);
engine.on('STOCK_PRICES_UPDATED', handler);
engine.on('GAME_ENDED', handler);
// ... and many more (see Constants.js for full list)
```

## File Structure

```
src/
  core/
    GameEngine.js          - Main orchestrator
    GameState.js           - State management
    EventEmitter.js        - Event system

  models/
    Card.js                - Base card model
    ResourceCard.js        - Resource card
    GoalCard.js            - Goal card

  managers/
    AuctionManager.js      - Auction logic
    TradingManager.js      - Trade management
    GoalResolutionManager.js - Goal reveal/resolution
    SellManager.js         - Sell phase
    DeckManager.js         - Deck operations

  systems/
    StockPriceSystem.js    - Price calculations
    RewardSystem.js        - Interactive rewards
    ValidationSystem.js    - Action validation
    TurnSystem.js          - Phase transitions

  parsers/
    StockChangeParser.js   - Parse stock changes
    GoalParser.js          - Parse goal requirements

  utils/
    CardLoader.js          - Load cards from JSON
    Constants.js           - Game constants
    uuid.js                - UUID generator

  index.js                 - Main exports
```

## Card JSON Format

### Resource Cards
```json
[
  { "color": "Blue" },
  { "color": "Orange" },
  ...
]
```

### Goal Cards
```json
[
  {
    "stockChange": "Orange -2",
    "goal": "2 Yellow + 1 Purple",
    "reward": "Look at another player's hand",
    "metadata": {
      "goalType": "pair_plus_specific",
      "rewardTier": "low"
    }
  }
]
```

Cards are automatically enriched with parsed metadata at runtime.

## Testing

```bash
npm test
```

## Next Steps

1. **Build a Web UI** that subscribes to game events
2. **Implement AI Players** using the `getVisibleState()` and `getAvailableActions()` APIs
3. **Create Simulation Harness** for AI vs AI games
4. **Balance Testing** with different card decks

## Architecture

- **Event-Driven**: All state changes emit events for reactive UIs
- **Validation-First**: All actions validated before execution
- **Immutable State**: State mutations through helper methods
- **AI-Agnostic**: Engine provides API, AI logic is separate
- **Modular Design**: Clear separation between managers and systems

## License

MIT
