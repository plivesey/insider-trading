# Insider Trading Board Game - V4 Project Documentation

## Project Overview

A strategic trading and market manipulation board game for 2-6 players set in 1920s Wall Street. Players auction stocks, race for shared goals, and watch prices swing as every buy, sell, dice roll, and Insider Tip moves the market. The game ends when the goals run out or the Insider Tip deck is exhausted.

**Players**: 2-6
**Victory Condition**: Highest total wealth (cash + stock value at current prices + end-game goal bonuses − escalating loan penalty: n-th loan a player took costs $(11 + n) at game end; 1st = $12, 2nd = $13, 3rd = $14, …). **Max 3 loans per player** (can't take a 4th or bid beyond cash + remaining loan capacity).
**Game End**: The Insider Tip deck is exhausted, OR only **two** goal cards remain in play.

## Current ruleset (shipped default = "1+2+3", see `RulesConfig`/`DEFAULT_RULES` in shared/state.ts)

These are the live game rules; pass `CLASSIC_RULES` to `createGameState` to get the original V4 game.
- **Each player starts with a Market Order card** — single-use action: buy one stock from the market at its current price (that color still +1).
- **Insider Tip deck = max(4, 2 × players − 1)** (so 2p = 4, 3p = 5, 4p = 7, 5p = 9, 6p = 11).
- **Goals in play = players + 3**; the game ends when only **2** goals remain.
- **Loan cap = 3 per player** (enforced at every bid/payment).

## V4 Key Changes (from V3)

- **Prices move on trade**: every stock bought → that color +1; every stock sold → that color −1.
- **No End Game Tracker** — removed entirely. Two end conditions instead (see above).
- **Insider Tips are an event deck.** A face-down deck of (2 × players) cards (drawn from a 16-card pool). Resolved when flipped by the dice OR played from hand after being drawn via **Insider Source**; then removed from the game.
- **A six-sided die** is rolled at the end of every turn: 1 = flip + resolve the top Insider Tip; 6 = all stocks +1; 2-5 = nothing.
- **Two turn actions only**: start an auction, or sell one stock.
- **Goal claiming is optional and free** — claim any time you qualify; never costs a turn.
- **Action cards and the Hot Tip are free** — played any time, never cost a turn.
- **Crisis cards removed.**
- **Loan cards**: bid/spend beyond your cash; loans auto-issue $10 each. Per-player escalating end-game penalty — your 1st loan costs $12, 2nd $13, 3rd $14, etc. **Capped at 3 loans per player.**
- **4 colorless Wild Share stocks**: no value, cannot be sold; substitute for any one color when claiming a goal, then discarded.
- **New stock specials** (one of each per color): Boom (extra_up), Tip-Off (other_up), Scout (peek_buy), Informant (peek_sell).
- Players start with $30, one Hot Tip card, one Market Order card, and 0 stocks.

## Card Types (89 cards + 1 die)

### Stock Cards (36) - `cards/stock_cards.json`
- 32 colored: 8 each of Blue, Orange, Yellow, Purple (4 blank + 4 special per color)
- Special types: `extra_up` (Boom), `other_up` (Tip-Off), `peek_buy` (Scout), `peek_sell` (Informant)
- 4 colorless `wild` (Wild Share) cards
- All shuffled into the main deck and auctioned

### Action Cards (12) - `cards/action_cards.json`
- Shuffled into the main deck and auctioned; held in hand; played free at any time
- 1 persistent (Preferred Bidder), 11 single-use
- Two **Insider Source** cards (`draw_tip`): draw the top Insider Tip into the player's hand; play later as a free action. Drawing the deck's last tip ends the game after an optional play.
- Two **Black Market** cards (`auction_unused_tip`): trigger the instant they flip face-up in the market. A face-down Insider Tip is drawn from the unused-tip pool and side-auctioned ($0 minimum, current player auctioneers). The Black Market card itself is removed from the game on trigger.

### Insider Tip Cards (16-card pool) - `cards/insider_tip_cards.json`
- Face-down event deck. Normally not held, but Insider Source draws one into a player's hand.
- 8 crash (halve a color, 2 per color), 4 surge (+4 to one color), 4 slump (−2/−2 to two colors)
- Each game uses max(4, 2 × players − 1) of them

### Goal Cards (14) - `cards/goal_cards.json`
- Shared/public; displays players+3 per game (game ends when only 2 remain)
- 4 pair (easy), 4 three-of-a-kind (hard), 6 two-pair (hard)

### Loan Cards - `cards/loan_cards.json`
- Face-up; auto-issued ($10 each) when a player cannot cover a payment; escalating −$(11+n) at game end. **Max 3 per player.**

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
