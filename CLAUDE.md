# Insider Trading Board Game - V3 Project Documentation

## Project Overview

A strategic trading and market manipulation board game for 2-6 players set in 1920s Wall Street. Players auction stocks, compete for shared goals, and manipulate stock prices using insider information. The game ends when the End Game Tracker reaches its threshold.

**Players**: 2-6
**Victory Condition**: Highest total wealth (cash + stock card values at current prices)
**Game End**: End Game Tracker reaches 3 x players + 1

## V3 Key Changes (from V2)

- Colors: Blue, Orange, Yellow, Purple (was Blue, Red, Yellow, Black)
- No more hot stocks / investigation on sell
- Stock cards have 4 special abilities per color (stock_up, stock_down, hype, insider)
- Type A cards (market manipulation) dealt to players at start, not goal cards
- Goal cards are shared/public objectives, not private
- Type B action cards (10) shuffled into main deck
- Crisis cards (2) in main deck advance tracker when revealed
- Trading allowed anytime
- 5 turn actions (auction, sell, play Type A, claim goal, play Type B)
- Tracker: everything is +1 (Type A, goal, crisis). Threshold: 3*players+1
- Sold stocks go to discard pile (can reshuffle), not removed from game
- Players start with $25 and 0 stocks

## Card Types (72 total)

### Stock Cards (32) - `cards/stock_cards.json`
- 8 per color (Blue, Orange, Yellow, Purple)
- 4 blank + 4 special per color
- Special types: stock_up, stock_down, hype, insider
- In the main deck, auctioned

### Type A: Market Manipulation Cards (14) - `cards/market_manipulation_cards.json`
- **TODO: Design these cards**
- Dealt to players at start (2 each for 2-4p, 1 each for 5-6p)
- Remaining form a draw pile
- Show stock price movements, net-zero per color

### Type B: Action Cards (10) - `cards/action_cards.json`
- In main deck, auctioned
- Held in hand, played as turn action
- 2 persistent (Connected Broker, Preferred Bidder), 8 single-use
- "Backroom Deal" needs redesign (TODO)

### Crisis Cards (2) - `cards/crisis_cards.json`
- In main deck
- When revealed: +1 tracker, removed to tracker pile, replaced

### Goal Cards (14) - `cards/goal_cards.json`
- **TODO: Design these cards**
- Shared/public, display players+2 per game
- Tiered difficulty with scaled rewards

## Project Structure

```
insider-trading/
├── CLAUDE.md                      # This file
├── rules.md                       # Complete v3 game rules
├── package.json                   # Jest config
├── cards/
│   ├── stock_cards.json           # 32 stock cards
│   ├── action_cards.json          # 10 Type B action cards
│   ├── market_manipulation_cards.json  # 14 Type A cards (TODO)
│   ├── goal_cards.json            # 14 goal cards (TODO)
│   ├── crisis_cards.json          # 2 crisis cards
│   └── visualize.html             # Card visualizer (toggleable sections)
├── tests/
│   ├── stock_cards.test.js
│   ├── action_cards.test.js
│   ├── market_manipulation_cards.test.js
│   ├── goal_cards.test.js
│   ├── crisis_cards.test.js
│   └── deck_composition.test.js
└── v2/                            # Archived v2 code and assets
```

## Running Tests

```bash
npm test          # Run all validation tests
npm run test:watch # Watch mode
```

Tests validate JSON card files for correct counts, structure, color balance, and game rules.
Tests for Type A and goal cards auto-skip when cards array is empty (TODO).

## Card Visualizer

Open `cards/visualize.html` in a browser. Use checkboxes to toggle card types.
URL params: `?show=stock,action` to show only specific types.
Supports print layout for card printing.

## TODOs

1. Design 14 Type A market manipulation cards (net-zero per color, varied power)
2. Design 14 goal cards (tiered difficulty, scaled rewards)
3. Redesign "Backroom Deal" Type B card (currently same as Tipster's Choice)
