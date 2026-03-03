# Insider Trading Board Game - Project Documentation

## Project Overview

This is a strategic market manipulation board game for 3+ players where players auction resources, play goal cards to manipulate stock prices, and sell resources to maximize their wealth. The game features a Federal Investigation tracker that creates escalating tension and ends the game.

**Players**: 3+ players
**Victory Condition**: Highest total wealth (cash + value of resource cards at current stock prices)
**Game End**: Federal Investigation tracker reaches 5 × number of players

## Core Game Mechanics

### Resources
- **4 colors of resource cards**: Blue, Red, Yellow, Black
- Each color represents a stock with a fluctuating price ($1-$10, starting at $4)
- **Resource deck**: 32 cards total (8 of each color)
- **Hot Stocks**: 2 per color (8 total, 25%) - marked with special icon, add +1 to Federal Investigation when sold

### Starting Setup
- Each player receives:
  - **2 resource cards** (hidden)
  - **3 goal cards** (hidden)
  - **$6 in cash**
- **4 face-up cards** available for auction

### Turn Structure
On each turn, a player chooses ONE action:
1. **Auction**: Bid on one of the 4 face-up cards (replaced from deck after purchase)
2. **Sell**: Sell any number of resource cards at current stock prices (hot stocks add +1 investigation each)
3. **Play Goal Card**: Reveal a goal card, apply stock changes, claim reward if goal is met (+2 investigation)

### Federal Investigation Tracker
- Starts at 0
- +2 when any player plays a goal card
- +1 for each hot stock sold
- Game ends when tracker reaches 5 × number of players
- Creates escalating tension - players must balance scoring vs. ending the game

## Goal Card System

Each goal card has three components:

### 1. Stock Change
Affects market prices when the card is played:
- **Single Up/Down**: +1 or -1 to one stock
- **Single Up/Down Twice**: +2 or -2 to one stock
- **Double Up/Down**: +1 or -1 to two stocks
- **Mixed**: +1 to one stock, -1 to another

### 2. Goal Requirement
What the player needs to complete the goal:

**2-Card Goals:**
- **Pair**: 2 of the same color (e.g., "2 Blue")

**3-Card Goals:**
- **Pair + Specific**: 2 of one color + 1 of another (e.g., "2 Blue + 1 Red")
- **Three Different**: 1 each of three colors (e.g., "1 Blue + 1 Red + 1 Yellow")
- **Three of a Kind**: 3 of the same color (e.g., "3 Blue")

**4-Card Goals:**
- **Two Pair**: 2 each of two colors (e.g., "2 Blue + 2 Red")
- **One of Every**: 1 of each color (e.g., "1 Blue + 1 Red + 1 Yellow + 1 Black")

### 3. Reward
Bonus for completing the goal. 13 unique rewards, each used 1-3 times across 24 goal cards:

**Rewards (weakest to strongest):**
1. Choose investigation increase (0-3) when playing this card
2. Look at a random goal card from another player
3. Gain $1
4. Steal $1 from another player
5. Peek at top 5 cards of the resource deck, rearrange in any order
6. Your next auction costs $2 less
7. Gain $2
8. Extra turn: take another action immediately
9. Gain $3
10. Adjust any one stock price by ±1
11. Swap one of your resource cards with a face-up auction card
12. Gain $4
13. Adjust any one stock price by ±2

### Market Manipulation Cards (8 cards)
- No goal requirement or reward
- Only have stock change effects
- Allow pure market manipulation plays

**Total deck**: 24 goal cards + 8 market manipulation cards = 32 cards

## Anti-Synergy Rules

Goal cards create strategic tension by avoiding perfect alignment between goals and stock movements:

**Rule 1**: If collecting 2+ of a color, that color cannot appear in the stock change at all (no positive or negative). Applies to pair, pair_plus_specific (pair color only), three_of_a_kind, two_pair.
**Rule 2**: No +2 on any collected color (even singles)
**Rule 3**: No -2 on any collected color (even singles)
**Rule 4**: No 3+ synergy matches of the same sign

**Type-Specific Rules:**
- **One of Every goals**: Can ONLY have single_up or double_up stock changes (only +1 allowed on any color)

## EV-Based Scoring System

Cards are scored using Expected Value to determine reward assignment. Cards with the weakest stock change EV get the strongest rewards (balancing).

### Valuation Model

**Completion Probabilities** (with ~3.5 cards in hand):

| Goal Type | Cards Required | Spare Slots | Probability |
|---|---|---|---|
| pair | 2 | 1.5 | 80% |
| pair_plus_specific | 3 | 0.5 | 60% |
| three_different | 3 | 0.5 | 70% |
| three_of_a_kind | 3 | 0.5 | 40% |
| two_pair | 4 | 0 | 40% |
| one_of_every | 4 | 0 | 50% |

**Stock Change EV Calculation**:
- `spare_slots = 3.5 - cards_required`
- +N on goal-required color: +$N per required card (guaranteed held)
- +N on non-goal color: +$N × (spare_slots / num_beneficial_colors)
- -N on goal-required color: -$N per required card (locked in)
- -N on non-goal color: +$N × ~0.75 (relative advantage)
- 4-card goals with non-goal color changes: ~$0 (no spare slots)

**Market Manipulation EV**: Assume ~1.5 cards of each affected color (no goal constraints)

**Total Card EV** = Stock Change EV + (Completion Probability × Reward Value)

**Reward Assignment**: Sort cards by Stock Change EV ascending, assign rewards best-to-worst (weakest stock EV gets strongest reward).

## Project Structure

```
insider-trading/
├── generate_goal_cards.py    # Main card generation script
├── visualize_cards.py         # HTML visualization generator
├── goal_cards.json            # Generated 32-card deck (output)
├── resource_deck.json         # Resource card deck (32 cards, with hot stocks)
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
│   │   ├── ResourceCard.js        # Resource card (with hot property)
│   │   └── GoalCard.js            # Goal card
│   │
│   ├── managers/
│   │   ├── AuctionManager.js      # Auction logic
│   │   ├── TradingManager.js      # Trade management (dormant)
│   │   ├── GoalResolutionManager.js # Goal reveal/resolution
│   │   ├── SellManager.js         # Sell phase
│   │   └── DeckManager.js         # Deck operations
│   │
│   ├── systems/
│   │   ├── StockPriceSystem.js    # Price calculations ($1-$10)
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
├── web/                       # Web UI and AI
│   ├── ai/
│   │   ├── BaseAI.js             # Base AI class
│   │   └── ConservativeAI.js     # Conservative AI strategy
│   ├── ui/
│   │   └── GameUI.js             # Web UI components
│   └── styles.css                # Styles (Blue, Red, Yellow, Black)
│
└── tests/                     # Comprehensive test suite
    ├── helpers/
    │   ├── builders.js            # Test data factories
    │   └── mocks.js               # Mock objects
    ├── unit/                      # Unit tests
    ├── integration/               # Integration tests
    └── e2e/                       # End-to-end tests
```

## Key Implementation Details

### Card Generation (`generate_goal_cards.py`)

**Total Cards**: 24 goal cards + 8 market manipulation cards = 32 total

**Goal Distribution** (24 cards, 4 of each type):
- Pair (2 same color)
- Pair + Specific (2 of one + 1 of another)
- Three Different (1 each of 3 colors)
- Three of a Kind (3 same color)
- Two Pair (2 each of 2 colors)
- One of Every (1 of each color)

**Stock Change Types**:
- **single_up**: +1 to one stock
- **single_down**: -1 to one stock
- **single_up_twice**: +2 to one stock
- **single_down_twice**: -2 to one stock
- **double_up**: +1 to two stocks
- **double_down**: -1 to two stocks
- **mixed**: +1 to one stock, -1 to another

**Balance Algorithm**:
The system ensures all colors net to zero using a balance scoring function that prefers stock changes that move toward equilibrium.

### Priority Assignment System

**Problem**: "One of Every" cards can only use single_up or double_up (anti-synergy rules prevent any negative changes).

**Solution**:
1. Separate cards into constrained (one_of_every) and unconstrained groups
2. Assign single_up or double_up to constrained cards FIRST
3. Then assign remaining stock changes to other cards
4. Use balance scoring to prefer changes that move toward net zero

**Result**: Perfect color balance achieved (all colors net to 0)

### Color Balance Validation

The system ensures that across all cards, the sum of stock changes for each color equals zero:

```python
Net changes: {'Blue': 0, 'Red': 0, 'Yellow': 0, 'Black': 0}
Balanced: True
```

### Pre-Parsed JSON Format

Goal cards use pre-parsed data structures to eliminate runtime parsing:

```json
{
  "stockChange": {
    "text": "Red -2",
    "parsed": { "Red": -2 },
    "type": "single_down_twice"
  },
  "goal": {
    "text": "2 Yellow + 1 Black",
    "parsed": {
      "type": "pair_plus_specific",
      "requirements": { "Yellow": 2, "Black": 1 }
    }
  },
  "reward": {
    "text": "Gain $2",
    "parsed": {
      "type": "gain_cash",
      "amount": 2,
      "requiresTarget": false,
      "requiresChoice": false,
      "value": 2
    }
  },
  "metadata": {
    "goalType": "pair_plus_specific",
    "completionProbability": 0.6,
    "stockEV": -1.5,
    "totalEV": 0.7,
    "rewardTier": "medium"
  }
}
```

## Game Engine Implementation

### Overview

The game engine is a complete JavaScript implementation, designed to be:
- **UI-Agnostic**: Core logic separated from presentation
- **Event-Driven**: Subscribe to game events for reactive UIs
- **AI-Ready**: Clean API with hidden information filtering
- **Well-Tested**: 162 tests across unit, integration, and E2E layers

### Quick Start

```javascript
import { GameEngine, CardLoader } from './src/index.js';

const resourceCards = await CardLoader.loadFromFile('./resource_deck.json', 'resource');
const goalCards = await CardLoader.loadFromFile('./goal_cards.json', 'goal');

const engine = new GameEngine();
const players = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
  { id: 'charlie', name: 'Charlie' }
];

await engine.initialize(players, resourceCards, goalCards);
engine.start();

engine.on('BID_PLACED', (data) => {
  console.log(`${data.playerId} bid $${data.amount}`);
});

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
// Auction
{ type: 'PLACE_BID', playerId: 'alice', amount: 5 }
{ type: 'PASS', playerId: 'alice' }

// Goal Resolution
{ type: 'REVEAL_GOAL', playerId: 'alice', goalCardId: 'goal-id' }
{ type: 'EXECUTE_REWARD', playerId: 'alice', choices: { targetPlayerId: 'bob' } }

// Sell
{ type: 'SELECT_CARDS_TO_SELL', playerId: 'alice', cardIds: ['card-1'] }
{ type: 'COMMIT_SELL', playerId: 'alice' }
```

**Event Types** (26+ events):
- `GAME_STARTED`, `GAME_ENDED`
- `PHASE_CHANGED`, `ROUND_STARTED`
- `AUCTION_STARTED`, `BID_PLACED`, `PLAYER_PASSED`, `AUCTION_WON`
- `GOAL_REVEALED`, `GOAL_CHECKED`, `STOCK_PRICES_UPDATED`
- `REWARD_EXECUTED`, `CARD_REVEALED`
- And more... (see src/utils/Constants.js)

### Testing

**Test Coverage**: 162 tests across 3 layers

**Unit Tests**:
- `StockPriceSystem.test.js`: Price calculations, constraints ($1-$10), accumulation
- `ValidationSystem.test.js`: All action validations with edge cases
- `DeckManager.test.js`: Shuffle, draw, peek, rearrange operations
- `ConservativeAI.test.js`: AI decision-making across all phases

**Integration Tests**:
- `AuctionManager.test.js`: Complete auction flow with real dependencies

**E2E Tests**:
- `FullGame.test.js`: Full game simulation using actual JSON card files

**Run Tests**:
```bash
npm test                  # Run all tests
npm test:watch            # Watch mode
npm test:coverage         # Coverage report
```

### AI Integration

```javascript
const visibleState = engine.getVisibleState('alice');
const actions = engine.getAvailableActions('alice');
const action = myAI.chooseAction(visibleState, actions);
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

### Generate Printable Cards
```bash
python3 visualize_cards.py > goal_cards.html
```

### Run Tests
```bash
npm install              # Install dependencies (Jest)
npm test                 # Run all 162 tests
```

## Technical Notes

### Randomization
Uses seed=42 for reproducible generation. Change in `main()` to generate different decks.

### Validation
Every generated deck is validated to ensure:
- Exactly 24 goal cards + 8 market manipulation cards
- Correct goal type distribution (4 of each type)
- Perfect color balance (net 0 for all colors)
- Color frequency balance (≤2 range between most/least used colors)
- No anti-synergy violations

### Resource Deck Format
```json
[
  { "color": "Blue", "hot": false },
  { "color": "Blue", "hot": true },
  ...
]
```

## Design Philosophy

### Tension Over Synergy
Goal cards deliberately create tension between:
- What you want to collect (goal requirement)
- How the market moves (stock change)
- What opponents might infer from your actions

### Federal Investigation Pressure
The investigation tracker creates a shared clock:
- Playing goal cards advances it (+2)
- Selling hot stocks advances it (+1)
- Players must balance scoring vs. game length
- Late-game urgency as tracker approaches threshold

### Balance Through Anti-Synergy
- No "obvious best" cards
- Players must make trade-offs
- EV-based reward assignment ensures overall card balance
- Hidden information remains valuable

## Future Considerations

### Immediate Next Steps
- **Complete Turn-Based Engine**: Update engine from round-based to turn-based structure
- **Federal Investigation System**: Implement tracker and game-end condition
- **Hot Stock Mechanics**: Implement investigation cost for selling hot stocks
- **Face-Up Auction Cards**: Implement 4 always-visible auction cards
- **New Reward Implementations**: Complete stub implementations in RewardSystem.js

### Potential Expansions
- Trading as optional advanced rule
- Online multiplayer (WebSocket integration)
- AI vs AI simulations for balance testing
- Tournament mode

## Credits

**Built With**:
- Python 3 (card generation)
- JavaScript ES6+ (game engine)
- Jest (testing framework)
- Node.js (runtime)
