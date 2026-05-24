# Insider Trading Board Game - V4 Project Documentation

## Project Overview

A strategic trading and market manipulation board game for 2-6 players set in 1920s Wall Street. Players auction stocks, race for shared goals, and watch prices swing as every buy, sell, dice roll, and Insider Tip moves the market. The game ends when the goals run out or the Insider Tip deck is exhausted.

**Players**: 2-6
**Victory Condition**: Highest total wealth (cash + stock value at current prices + end-game goal bonuses − $12 per loan)
**Game End**: The Insider Tip deck is exhausted, OR only one goal card remains in play.

## V4 Key Changes (from V3)

- **Prices move on trade**: every stock bought → that color +1; every stock sold → that color −1.
- **No End Game Tracker** — removed entirely. Two end conditions instead (see above).
- **Insider Tips are an event deck**, never held by players. A face-down deck of (2 × players − 1) cards (drawn from a 16-card pool). Only resolved when flipped by the dice; then removed from the game.
- **A six-sided die** is rolled at the end of every turn: 1 = flip + resolve the top Insider Tip; 6 = all stocks +1; 2-5 = nothing.
- **Two turn actions only**: start an auction, or sell one stock.
- **Goal claiming is optional and free** — claim any time you qualify; never costs a turn.
- **Action cards and the Hot Tip are free** — played any time, never cost a turn.
- **Crisis cards removed.**
- **Loan cards**: bid/spend beyond your cash; loans auto-issue $10 each, count −$12 at game end.
- **4 colorless Wild Share stocks**: no value, cannot be sold; substitute for any one color when claiming a goal, then discarded.
- **New stock specials** (one of each per color): Boom (extra_up), Tip-Off (other_up), Scout (peek_buy), Informant (peek_sell).
- Players start with $30, one Hot Tip card, and 0 stocks.

## Card Types (89 cards + 1 die)

### Stock Cards (36) - `cards/stock_cards.json`
- 32 colored: 8 each of Blue, Orange, Yellow, Purple (4 blank + 4 special per color)
- Special types: `extra_up` (Boom), `other_up` (Tip-Off), `peek_buy` (Scout), `peek_sell` (Informant)
- 4 colorless `wild` (Wild Share) cards
- All shuffled into the main deck and auctioned

### Action Cards (10) - `cards/action_cards.json`
- Shuffled into the main deck and auctioned; held in hand; played free at any time
- 1 persistent (Preferred Bidder), 9 single-use
- Includes two tip-reorder cards (Inside Track, Wiretap)

### Insider Tip Cards (16-card pool) - `cards/insider_tip_cards.json`
- Face-down event deck; never held by players
- 8 crash (halve a color, 2 per color), 4 surge (+4 to one color), 4 slump (−2/−2 to two colors)
- Each game uses (2 × players − 1) of them

### Goal Cards (14) - `cards/goal_cards.json`
- Shared/public; displays players+2 per game
- 4 pair (easy), 4 three-of-a-kind (hard), 6 two-pair (hard)

### Loan Cards (6) - `cards/loan_cards.json`
- Face-up; auto-issued ($10 each) when a player cannot cover a payment; −$12 each at game end

### Hot Tip Cards (6) - `cards/peek_cards.json`
- Each player starts with one; single-use peek at the top Insider Tip

## Project Structure

```
insider-trading/
├── CLAUDE.md                      # This file
├── rules.md                       # Complete V4 game rules
├── package.json                   # Jest config
├── cards/
│   ├── stock_cards.json           # 36 stock cards
│   ├── action_cards.json          # 11 action cards
│   ├── insider_tip_cards.json     # 16 Insider Tip event cards
│   ├── goal_cards.json            # 14 goal cards
│   ├── loan_cards.json            # 6 loan cards
│   ├── peek_cards.json            # 6 Hot Tip cards
│   └── visualize.html             # Card visualizer (toggleable sections)
├── tests/
│   ├── stock_cards.test.js
│   ├── action_cards.test.js
│   ├── insider_tip_cards.test.js
│   ├── goal_cards.test.js
│   └── deck_composition.test.js
├── playtest/
│   ├── init.js                    # Generates game_state.json
│   └── facilitator_guide.md       # How to run AI playtests
├── v2/                            # Archived v2
└── v3/                            # Archived v3
```

## Running Tests

```bash
npm test          # Run all validation tests
npm run test:watch # Watch mode
```

Tests validate JSON card files for correct counts, structure, color balance, and game rules. The `v2/` and `v3/` archives are excluded from the test run.

## Card Visualizer

Open `cards/visualize.html` in a browser. Use checkboxes to toggle card types.
