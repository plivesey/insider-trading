# Insider Trading Board Game - V3 Project Documentation

## Project Overview

A strategic trading and market manipulation board game for 2-6 players set in 1920s Wall Street. Players auction stocks, compete for shared goals, and manipulate stock prices using insider information. The game ends when the End Game Tracker reaches its threshold.

**Players**: 2-6
**Victory Condition**: Highest total wealth (cash + stock card values at current prices)
**Game End**: End Game Tracker reaches 3 x players

## V3 Key Changes (from V2)

- Colors: Blue, Orange, Yellow, Purple (was Blue, Red, Yellow, Black)
- No more hot stocks / investigation on sell
- Stock cards have 4 special abilities per color (stock_up, wild, hype, insider)
- Insider Tip Action cards dealt to players at start, not goal cards
- Goal cards are shared/public objectives, not private
- Action cards (10) shuffled into main deck
- Crisis cards (2) in main deck advance tracker when revealed
- Trading allowed anytime
- 5 turn actions (auction, sell, play Insider Tip Action, claim goal, play action card)
- Tracker: everything is +1 (Insider Tip Action, goal, crisis). Threshold: 3*players
- Sold stocks go to discard pile (can reshuffle), not removed from game
- Players start with $30 and 0 stocks

## Card Types (74 total)

### Stock Cards (32) - `cards/stock_cards.json`
- 8 per color (Blue, Orange, Yellow, Purple)
- 4 blank + 4 special per color
- Special types: stock_up, wild, hype, insider
- In the main deck, auctioned

### Insider Tip Action Cards (16) - `cards/market_manipulation_cards.json`
- Dealt to players at start (2 each for 2-4p, 1 each for 5-6p)
- Remaining form a draw pile
- 4 single_down (-3), 4 double_up (+2/+1), 6 mixed_up (+2/-1), 2 mixed_down (-2/+1)
- Slightly inflationary: net +1 per color; each color appears on exactly 7 cards

### Action Cards (10) - `cards/action_cards.json`
- In main deck, auctioned
- Held in hand, played as turn action
- 2 persistent (Connected Broker, Preferred Bidder), 8 single-use

### Crisis Cards (2) - `cards/crisis_cards.json`
- In main deck
- When revealed: all stock prices +1, then +1 tracker, removed to tracker pile, replaced

### Goal Cards (14) - `cards/goal_cards.json`
- Shared/public, display players+2 per game
- 4 pair (easy), 4 three-of-a-kind (hard), 6 two-pair (hard)
- 14 unique rewards, equal color totals (11 each)

## Project Structure

```
insider-trading/
├── CLAUDE.md                      # This file
├── rules.md                       # Complete v3 game rules
├── package.json                   # Jest config
├── cards/
│   ├── stock_cards.json           # 32 stock cards
│   ├── action_cards.json          # 10 Type B action cards
│   ├── market_manipulation_cards.json  # 14 Insider Tip Action cards
│   ├── goal_cards.json            # 14 goal cards
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

## Card Visualizer

Open `cards/visualize.html` in a browser. Use checkboxes to toggle card types.
URL params: `?show=stock,action` to show only specific types.
Supports print layout for card printing.

