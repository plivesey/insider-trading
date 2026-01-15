# Insider Trading Board Game - Project Documentation

## Project Overview

This is a strategic trading and market manipulation board game for 3+ players where players bid on resources, trade with others, and manipulate stock prices using hidden goal cards to maximize their wealth.

**Game Duration**: 3 rounds (approximately 30-45 minutes)
**Players**: 3+ players
**Victory Condition**: Highest total wealth (cash + value of resource cards)

## Core Game Mechanics

### Resources
- **4 colors of resource cards**: Blue, Orange, Yellow, Purple
- Each color represents a stock with a fluctuating price
- **Resource deck**: 32-40 cards total (8-10 of each color)
- All stock prices start at $4

### Starting Setup
- Each player receives:
  - **2 resource cards** (hidden)
  - **3 goal cards** (hidden)
  - **$5 in coins**

### Round Structure (4 phases)

1. **Auction Phase**: Reveal **n+2 cards** (where n = number of players) and auction them one at a time
2. **Trading Phase**: 1-2 minutes of free trading between players
3. **Goal Resolution Phase**: Each player reveals 1 goal card
   - Apply all stock price changes cumulatively
   - Award bonuses to players who completed their revealed goal
4. **Sell Phase**: Players sell resource cards back to the bank at current prices

## Goal Card System

Each goal card has three components:

### 1. Stock Change
Affects market prices when the card is revealed:
- **Single Up/Down**: +1 or -1 to one stock
- **Single Up/Down Twice**: +2 or -2 to one stock
- **Double Up/Down**: +1 or -1 to two stocks
- **Mixed**: +1 to one stock, -1 to another

### 2. Goal Requirement
What the player needs to complete the goal:

**3-Card Goals:**
- **Pair** (1 point): 2 of the same color (e.g., "2 Blue")
- **Pair + Specific** (2 points): 2 of one color + 1 of another (e.g., "2 Blue + 1 Orange")
- **Three Different** (2 points): 1 each of three colors (e.g., "1 Blue + 1 Orange + 1 Yellow")
- **None of** (2 points): Have zero of a specific color (e.g., "0 Purple")
- **Three of a Kind** (3 points): 3 of the same color (e.g., "3 Blue")

**4-Card Goals:**
- **Two Pair** (4 points): 2 each of two colors (e.g., "2 Blue + 2 Orange")
- **One of Every** (4 points): 1 of each color (e.g., "1 Blue + 1 Orange + 1 Yellow + 1 Purple")

### 3. Reward
Bonus for completing the goal, split into three tiers:

**Low Tier ($1 value) - 3 reward types:**
- Gain $1
- Peek at top card, choose to put it on top or bottom of deck
- Look at another player's hand (see all their resource cards)

**Medium Tier ($2 value) - 5 reward types:**
- Gain $2
- Swap 1 of your resource cards with the top card of the deck
- Buy the lowest-priced stock for $1 discount
- Steal $1 from another player
- Peek at top 5 cards of the resource deck, and rearrange them in any order

**High Tier ($3 value) - 6 reward types:**
- Gain $3
- Adjust any one stock price by ±1 (before selling phase)
- All cards you sell this round get +$1 bonus
- Take a random resource from another player and give them one of your choice
- Buy any stock for $2 discount
- Gain the lowest value stock

## Anti-Synergy Rules

Goal cards are designed to create strategic tension by avoiding perfect alignment between goals and stock movements:

**Rule 1**: Don't strongly boost (+2) what you're collecting
**Rule 2**: Don't penalize (-1 or -2) what you're collecting
**Rule 3**: Don't penalize what you're avoiding (for "none_of" goals)
**Rule 4**: Don't strongly boost (+2) what you're avoiding
**Rule 5**: Small boosts (+1) on collected colors are acceptable

**Special Cases:**
- **Two Pair goals**: Can't have +2 or negative values on the two colors being collected
- **One of Every goals**: Can ONLY have single_up or double_up stock changes (only +1 allowed on any color)

## Scoring System

Cards are scored to determine reward tiers:

```
Score = Goal Difficulty Points + Stock Change Penalty
```

**Difficulty Points**: 1-4 based on goal complexity
**Stock Change Penalties** (per color, summed for multi-color changes):
- +1: -0.75
- -1: -0.50
- +2: -1.75
- -2: -1.00
- +3: -2.50
- -3: -1.50

After scoring all 26 cards:
- Bottom ~9 cards → Low tier ($1 rewards)
- Middle ~9 cards → Medium tier ($2 rewards)
- Top ~8 cards → High tier ($3 rewards)

## Project Structure

```
insider-trading/
├── generate_goal_cards.py    # Main card generation script
├── visualize_cards.py         # HTML visualization generator
├── goal_cards.json            # Generated 26-card deck (output)
├── resource_deck.json         # Resource card deck (40 cards)
├── goal_cards.html            # Visual card layout for printing (output)
├── rules.md                   # Complete game rules
├── goal_generation.md         # Design documentation and generation system
├── example.js                 # Example usage of game engine
├── CLAUDE.md                  # This file - project context
│
├── src/                       # Game engine source code
│   ├── core/
│   │   ├── GameEngine.js          # Main orchestrator
│   │   ├── GameState.js           # State management
│   │   └── EventEmitter.js        # Event system
│   │
│   ├── models/
│   │   ├── Card.js                # Base card model
│   │   ├── ResourceCard.js        # Resource card
│   │   └── GoalCard.js            # Goal card
│   │
│   ├── managers/
│   │   ├── AuctionManager.js      # Auction logic
│   │   ├── TradingManager.js      # Trade management
│   │   ├── GoalResolutionManager.js # Goal reveal/resolution
│   │   ├── SellManager.js         # Sell phase
│   │   └── DeckManager.js         # Deck operations
│   │
│   ├── systems/
│   │   ├── StockPriceSystem.js    # Price calculations
│   │   ├── RewardSystem.js        # Interactive rewards
│   │   ├── ValidationSystem.js    # Action validation
│   │   └── TurnSystem.js          # Phase transitions
│   │
│   ├── parsers/
│   │   ├── StockChangeParser.js   # Stock change utilities
│   │   └── GoalParser.js          # Goal checking
│   │
│   ├── utils/
│   │   ├── CardLoader.js          # Load cards from JSON
│   │   ├── Constants.js           # Game constants
│   │   └── uuid.js                # UUID generator
│   │
│   └── index.js                   # Main exports
│
└── tests/                     # Comprehensive test suite
    ├── helpers/
    │   ├── builders.js            # Test data factories
    │   └── mocks.js               # Mock objects
    ├── unit/                      # Unit tests (113 tests)
    ├── integration/               # Integration tests (13 tests)
    └── e2e/                       # End-to-end tests (14 tests)
```

## Key Implementation Details

### Card Generation (`generate_goal_cards.py`)

**Total Cards**: 26 (20 original + 6 new 4-card goals)

**Goal Distribution**:
- 4 Three of a Kind (3 points)
- 4 Pair (1 point)
- 4 Pair + Specific (2 points)
- 4 Three Different (2 points)
- 4 None of (2 points)
- 4 Two Pair (4 points) ← NEW
- 2 One of Every (4 points) ← NEW

**Stock Change Distribution** (4×4 + 2×5 = 26):
- single_down: 5 occurrences
- double_down: 5 occurrences
- single_up: 4 occurrences
- double_up: 4 occurrences
- single_up_twice: 4 occurrences
- single_down_twice: 4 occurrences
- mixed: 4 occurrences

**Why single_down and double_down get 5?**
The two "One of Every" goals can only use positive changes (single_up/double_up), creating a positive bias. Giving extra negative changes to single_down and double_down ensures perfect color balance.

### Priority Assignment System

**Problem**: "One of Every" cards can only use single_up or double_up (anti-synergy rules prevent any negative changes).

**Solution**:
1. Separate cards into constrained (one_of_every) and unconstrained groups
2. Assign single_up or double_up to constrained cards FIRST
3. Then assign remaining stock changes to other cards
4. Use balance scoring to prefer changes that move toward net zero

**Result**: Perfect color balance achieved (all colors net to 0)

### Color Balance Validation

The system ensures that across all 26 cards, the sum of stock changes for each color equals zero:

```python
Net changes: {'Blue': 0, 'Orange': 0, 'Yellow': 0, 'Purple': 0}
Balanced: True
```

This ensures fair gameplay - no color is systematically advantaged or disadvantaged.

## Game Engine Implementation

### Overview

The game engine is a complete JavaScript implementation of the Insider Trading board game, designed to be:
- **UI-Agnostic**: Core logic separated from presentation
- **Event-Driven**: Subscribe to game events for reactive UIs
- **AI-Ready**: Clean API with hidden information filtering
- **Well-Tested**: 140 tests across unit, integration, and E2E layers

### Pre-Parsed JSON Format (Performance Optimization)

**Key Innovation**: Goal cards use pre-parsed data structures to eliminate runtime parsing overhead.

**Before** (Runtime Parsing):
```javascript
// JavaScript had to parse strings on every card load
"Orange -2" → parse() → { Orange: -2 }
"2 Yellow + 1 Purple" → parse() → { Yellow: 2, Purple: 1 }
```

**After** (Pre-Parsed):
```json
{
  "stockChange": {
    "text": "Orange -2",
    "parsed": { "Orange": -2 },
    "type": "single_down_twice"
  },
  "goal": {
    "text": "2 Yellow + 1 Purple",
    "parsed": {
      "type": "pair_plus_specific",
      "requirements": { "Yellow": 2, "Purple": 1 }
    }
  },
  "reward": {
    "text": "Look at another player's hand",
    "parsed": {
      "type": "look_at_hand",
      "requiresTarget": true,
      "requiresChoice": false,
      "value": 1
    }
  }
}
```

**Benefits**:
- ✅ Faster card loading (no parsing needed)
- ✅ Simpler JavaScript code (300+ lines removed)
- ✅ Human-readable text preserved for UI display
- ✅ Easier validation (done in Python)

### Quick Start

```javascript
import { GameEngine, CardLoader } from './src/index.js';

// Load card decks
const resourceCards = await CardLoader.loadFromFile('./resource_deck.json', 'resource');
const goalCards = await CardLoader.loadFromFile('./goal_cards.json', 'goal');

// Create game engine
const engine = new GameEngine();

// Set up players
const players = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
  { id: 'charlie', name: 'Charlie' }
];

// Initialize and start game
await engine.initialize(players, resourceCards, goalCards);
engine.start();

// Subscribe to events
engine.on('BID_PLACED', (data) => {
  console.log(`${data.playerId} bid $${data.amount}`);
});

// Execute actions
engine.executeAction({
  type: 'PLACE_BID',
  playerId: 'alice',
  amount: 3
});
```

### Core API

**GameEngine Methods**:
- `initialize(players, resourceCards, goalCards)` - Initialize a new game
- `start()` - Start the game
- `executeAction(action)` - Execute a player action (validated)
- `on(eventType, handler)` - Subscribe to events
- `getState()` - Get current game state
- `getVisibleState(playerId)` - Get filtered state (hides hidden info)
- `getAvailableActions(playerId)` - Get available actions for a player
- `getFinalScores()` - Get final scores (after game ends)

**Action Types**:
```javascript
// Auction Phase
{ type: 'PLACE_BID', playerId: 'alice', amount: 5 }
{ type: 'PASS', playerId: 'alice' }

// Trading Phase
{
  type: 'PROPOSE_TRADE',
  playerId: 'alice',
  offering: { cards: ['card-id'], cash: 2 },
  requesting: { cards: [{ color: 'Blue', count: 1 }], cash: 0 }
}
{ type: 'ACCEPT_TRADE', playerId: 'bob', offerId: 'offer-id' }
{ type: 'CANCEL_TRADE', playerId: 'alice', offerId: 'offer-id' }

// Goal Resolution Phase
{ type: 'REVEAL_GOAL', playerId: 'alice', goalCardId: 'goal-id' }
{
  type: 'EXECUTE_REWARD',
  playerId: 'alice',
  choices: { targetPlayerId: 'bob' } // Varies by reward
}

// Sell Phase
{ type: 'SELECT_CARDS_TO_SELL', playerId: 'alice', cardIds: ['card-1'] }
{ type: 'COMMIT_SELL', playerId: 'alice' }
```

**Event Types** (26+ events):
- `GAME_STARTED`, `GAME_ENDED`
- `PHASE_CHANGED`, `ROUND_STARTED`
- `AUCTION_STARTED`, `BID_PLACED`, `PLAYER_PASSED`, `AUCTION_WON`
- `TRADE_PROPOSED`, `TRADE_ACCEPTED`, `TRADE_CANCELLED`
- `GOAL_REVEALED`, `GOAL_CHECKED`, `STOCK_PRICES_UPDATED`
- `REWARD_EXECUTED`, `CARD_REVEALED`
- And more... (see src/utils/Constants.js)

### Architecture

**Design Principles**:
1. **Event-Driven**: All state changes emit events for reactive UIs
2. **Validation-First**: All actions validated before execution
3. **Immutable State**: State mutations through helper methods
4. **AI-Agnostic**: Engine provides API, AI logic is separate
5. **Modular Design**: Clear separation between managers and systems

**Key Components**:
- **GameEngine**: Main orchestrator, ties everything together
- **Managers**: Handle specific game phases (Auction, Trading, Goals, Sell)
- **Systems**: Handle cross-cutting concerns (Validation, Stock Prices, Rewards)
- **Models**: Represent game entities (Cards, Players)
- **Parsers**: Utility functions (no runtime parsing needed)

### Testing

**Test Coverage**: 140 tests across 3 layers

**Unit Tests** (113 tests):
- `StockPriceSystem.test.js`: 41 tests - price calculations, constraints, accumulation
- `ValidationSystem.test.js`: 32 tests - all action validations with edge cases
- `DeckManager.test.js`: 40 tests - shuffle, draw, peek, rearrange operations

**Integration Tests** (13 tests):
- `AuctionManager.test.js`: Complete auction flow with real dependencies

**E2E Tests** (14 tests):
- `FullGame.test.js`: Full game simulation using actual JSON card files

**Run Tests**:
```bash
npm test                  # Run all tests
npm test:watch            # Watch mode
npm test:coverage         # Coverage report
```

**Test Results**:
```
Test Suites: 5 passed, 5 total
Tests:       140 passed, 140 total
Time:        0.421s
```

### AI Integration

The engine is designed for AI players:

```javascript
// Get filtered state (hides other players' cards)
const visibleState = engine.getVisibleState('alice');

// Get available actions
const actions = engine.getAvailableActions('alice');

// AI decides which action to take
const action = myAI.chooseAction(visibleState, actions);

// Execute action
engine.executeAction(action);
```

**Hidden Information**:
- Other players' hands show card count but color is `"hidden"`
- Other players' goal cards show count but details are hidden
- Own cards are fully visible
- Stock prices, cash, and public info visible to all

## Usage

### Generate New Card Deck
```bash
python3 generate_goal_cards.py > goal_cards.json
```

**Output includes**:
- JSON array of 26 goal cards with pre-parsed data
- Statistics on goal type distribution
- Reward tier distribution
- Balance validation results

### Generate Printable Cards
```bash
python3 visualize_cards.py > goal_cards.html
```

Creates an HTML page with all 26 cards in a grid layout suitable for printing.

### Run Example Game
```bash
node example.js
```

Demonstrates game engine usage with simulated gameplay.

### Run Tests
```bash
npm install              # Install dependencies (Jest)
npm test                 # Run all 140 tests
npm test:watch           # Run tests in watch mode
npm test:coverage        # Generate coverage report
```

## Development History

### Recent Changes (Latest Update - Game Engine)

**January 2025 - JavaScript Game Engine Implementation**

1. **Implemented Complete Game Engine**
   - Full JavaScript implementation of all game rules
   - 18+ source files organized into core, managers, systems, models
   - Event-driven architecture with 26+ event types
   - Validation system ensures all actions are legal before execution
   - State management with immutable state helpers

2. **Pre-Parsed JSON Format Optimization**
   - Modified `generate_goal_cards.py` to output pre-parsed data structures
   - Eliminated runtime parsing overhead (300+ lines of JavaScript removed)
   - Goal cards now include both human-readable text AND parsed data
   - Faster card loading and simpler JavaScript code

3. **Comprehensive Test Suite**
   - **140 tests** across 3 layers (unit, integration, E2E)
   - **Unit tests** (113): StockPriceSystem, ValidationSystem, DeckManager
   - **Integration tests** (13): AuctionManager with real dependencies
   - **E2E tests** (14): Full game simulation with actual JSON files
   - All tests passing with Jest test framework

4. **AI-Ready Design**
   - `getVisibleState(playerId)` filters hidden information
   - `getAvailableActions(playerId)` returns legal actions
   - Clean API for AI integration
   - Example AI vs AI simulation support

5. **Documentation**
   - Complete API documentation in CLAUDE.md
   - Code examples in example.js
   - Test helpers and builders for easy test writing

### Earlier Changes (Card Generation)

1. **Expanded deck from 20 to 26 cards**
   - Added 4 "Two Pair" goals (adjacent color pairs pattern)
   - Added 2 "One of Every" goals

2. **Rebalanced rewards** from ~$1/$1.50/$2 to $1/$2/$3 tiers
   - Removed overpowered abilities (±2 stock changes, free card draws)
   - Reduced discount amounts ($1/$2 instead of $3/$4)
   - Added strategic abilities (gain lowest value stock, steal $1)

3. **Adjusted card mechanics**
   - Starting cards: 3 → 2 (more scarcity)
   - Auction size: n+1 → n+2 (more competition)

4. **Implemented priority assignment** for constrained cards
   - Ensures "One of Every" goals get appropriate stock changes
   - Maintains perfect color balance

## Design Philosophy

### Tension Over Synergy
Goal cards deliberately create tension between:
- What you want to collect (goal requirement)
- How the market moves (stock change)
- What opponents might infer from your actions

This prevents telegraphing strategy and creates interesting bluffing opportunities.

### Balance Through Anti-Synergy
The anti-synergy rules ensure:
- No "obvious best" cards
- Players must make trade-offs
- Market manipulation affects everyone
- Hidden information remains valuable

### Scalability
- Automatic reward tier assignment via scoring
- Balanced distribution guarantees fairness
- Works with any number of players (3+)
- Configurable seed for reproducible decks

## Technical Notes

### Randomization
Uses seed=42 for reproducible generation. Change in `main()` to generate different decks:
```python
cards = assign_stock_changes(cards, seed=42)
```

### Max Attempts
The system tries up to 5000 combinations to find one that satisfies all constraints:
- Anti-synergy rules
- Stock change distribution
- Perfect color balance

### Validation
Every generated deck is validated to ensure:
- Exactly 26 cards
- Correct goal type distribution
- Correct stock change distribution
- Perfect color balance (net 0 for all colors)
- No anti-synergy violations

## Future Considerations

### Immediate Next Steps
- **Build Web UI**: Create a web interface using the game engine's event system
- **Implement AI Players**: Use the `getVisibleState()` and `getAvailableActions()` APIs
- **AI vs AI Simulations**: Run thousands of games to test balance
- **Performance Metrics**: Add timing and statistics to track game flow

### Potential Expansions
- Add more goal types (5-card goals?)
- Variant rules for different player counts
- Expansion packs with new reward types
- Online multiplayer (WebSocket integration)
- Alternative scoring systems
- Tournament mode with rankings
- Replay system (save/load game states)

## Credits

**Card Generation System**: Python-based generator with anti-synergy rules and balanced distribution. Designed for strategic depth while maintaining accessibility.

**Game Engine**: Complete JavaScript implementation with event-driven architecture, comprehensive test coverage (140 tests), and AI-ready design. Features pre-parsed JSON format for optimal performance.

**Built With**:
- Python 3 (card generation)
- JavaScript ES6+ (game engine)
- Jest (testing framework)
- Node.js (runtime)
