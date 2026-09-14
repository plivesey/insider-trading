# Insider Trading Board Game - V5 Project Documentation

## Project Overview

A strategic trading and market manipulation board game for 2-6 players set in 1920s Wall Street. Players auction stocks, race for goals — some public, some secret — and watch prices swing as every buy, sell, and dice-bag draw moves the market. A shared progress tracker counts every market-moving event and completed goal; once it hits its threshold, the game ends immediately.

**Players**: 2-6
**Victory Condition**: Highest total wealth (cash + stock value at current prices + end-game goal bonuses + hidden end-game bonus cards − loan penalty: 1st loan costs $12, 2nd (and max) loan costs $14 — or a flat $10 each if holding an unplayed Easy Credit bonus card). **Max 2 loans per player.**
**Game End**: The progress tracker reaches its threshold (currently 4 × players, a tunable placeholder — see `v5_tuning_notes.md`). This is the *only* end condition — V4's "deck exhausted" / "only 2 goals remain" conditions no longer apply.

Full rules: `rules.md`. Open/tunable numbers not yet settled by playtesting: `v5_tuning_notes.md`. Plan for migrating the online implementation to V5: `online/V5_MIGRATION_PLAN.md`.

## V5 Key Changes (from V4)

- **Event Deck replaces the separate Insider Tip deck and Goal deck.** All 16 market-movement cards and all 14 goal cards are shuffled into one 30-card deck. A goal drawn from it either becomes public (added to the goal row) or, if drafted into a hand at setup or drawn via Insider Source, becomes a **private** goal only that player can complete.
- **New Starter Deck (24 cards, setup-only)**: 12 basic stocks (3/color) + 12 new starter action cards (7 played normally, 5 "hidden end-game bonus" cards that are never played — they just sit in hand and auto-score at game end). Used once during setup's pass-and-draft procedure, then set aside for the rest of the game.
- **New setup procedure**: reveal 4 public goals from the event deck, then deal a combined event-deck/starter-deck pile (2 cards each from both, reshuffled together) and draft it down from 4 cards to a final hand of 3 via a pass-and-keep-1 procedure. Hot Tip and Market Order (V4's fixed starter cards) no longer exist.
- **Dice: a bag of 6 dice** (weighted Bull/Bear/Nothing/Draw-1/2/3 faces) replaces the single d6. Drawn without replacement each end of turn; the bag refills every 6 turns.
- **Progress tracker replaces both V4 end conditions.** +1 per market-movement card resolved (played or drawn), +1 per goal completed (public or private). Game ends the instant it hits threshold.
- **Fourth stock color renamed Yellow → Green** (Rail-themed). Colors: Blue=Steel, Orange=Oil, Green=Rail, Purple=Bank.
- **Scout/Informant changed**: both now trigger on buy (was: Informant triggered on sell). Scout peeks 1 event card, Informant peeks 2.
- **Loan cap 3→2**, cost $12 then $14 (was an escalating $12/$13/$14 to a max of 3).
- **Starting cash $30→$25.**
- **4 new persistent action cards**: Oil/Rail/Steel/Bank Broker — $2 off winning an auction for that color, once played.
- **Black Market removed entirely** (its V4 mechanic depended on a "leftover unused tips" pool that no longer exists once the whole event deck goes into circulation at setup).

## Card Types (111 cards + 6 dice)

### Stock Cards (36) - `cards/stock_cards.json`
- 32 colored: 8 each of Blue, Orange, Green, Purple (4 blank + 4 special per color)
- Special types: `extra_up` (Boom), `other_up` (Tip-Off), `peek_buy` (Scout, peek top 1 on buy), `peek_sell` (Informant — name is a holdover from V4; it now also triggers on buy, peeking top 2)
- 4 colorless `wild` (Wild Share) cards
- All shuffled into the 51-card Market Deck (with Action Cards) and auctioned

### Action Cards (15) - `cards/action_cards.json`
- Shuffled into the Market Deck and auctioned; held in hand; played free at any time
- 5 persistent (Preferred Bidder + Oil/Rail/Steel/Bank Broker), 10 single-use
- Two **Insider Source** cards (`draw_tip`): draw the top card of the event deck into the player's hand. A market-movement card is playable later as a free action; a goal card becomes a private goal.
- Black Market no longer exists in V5.

### Insider Tip Cards (16, market-movement half of the Event Deck) - `cards/insider_tip_cards.json`
- 8 crash (halve a color, 2 per color), 4 surge (+4 to one color), 4 slump (−2/−2 to two colors)
- Shuffled with the 14 goal cards into one 30-card Event Deck at setup

### Goal Cards (14, other half of the Event Deck) - `cards/goal_cards.json`
- 4 pair (easy), 4 three-of-a-kind (hard), 6 two-pair (hard)
- Can end up public (goal row, claimable by anyone) or private (secret, in one player's hand)

### Loan Cards - `cards/loan_cards.json`
- Face-up; auto-issued ($10 each) when a player cannot cover a payment. **Max 2 per player.** End-game cost: 1st loan $12, 2nd $14 (computed by the engine, not stored per-card — the JSON's `endGameValue` field is legacy/decorative).

### Starter Deck (24) - `cards/starter_deck.json`
- Setup-only, then set aside for the rest of the game.
- 12 basic stock cards (3 each of Blue/Orange/Green/Purple, blank, no special ability).
- 12 starter action cards: 7 playable (Fire Sale, First Look, Foresight, Windfall, Market Panic, Backroom Deal, Double Down — `"hidden": false`) + 5 hidden end-game bonus cards (Nest Egg, Portfolio, Trophy Case, Clean Ledger, Easy Credit — `"hidden": true`, never played, auto-score at game end).

Hot Tip cards (`peek_cards.json`) no longer exist in V5.

## Project Structure

```
insider-trading/
├── CLAUDE.md                      # This file
├── rules.md                       # Complete V5 game rules
├── v5_tuning_notes.md             # Open/tunable V5 numbers pending playtesting
├── package.json                   # Jest config
├── cards/
│   ├── stock_cards.json           # 36 stock cards
│   ├── action_cards.json          # 15 action cards
│   ├── insider_tip_cards.json     # 16 market-movement cards (half of the Event Deck)
│   ├── goal_cards.json            # 14 goal cards (other half of the Event Deck)
│   ├── loan_cards.json            # 6 loan cards
│   ├── starter_deck.json          # 24 starter-deck cards (setup only)
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
├── online/                        # Live web implementation (backend/frontend/shared) — mid-migration to V5, see online/V5_MIGRATION_PLAN.md
├── v2/                            # Archived v2
├── v3/                            # Archived v3
└── v4/                            # Archived V4 (frozen snapshot, incl. online/ as it stood at V4) — do not edit
```

## Running Tests

```bash
npm test          # Run all validation tests
npm run test:watch # Watch mode
```

Tests validate JSON card files for correct counts, structure, color balance, and game rules. The `v2/`, `v3/`, `v4/`, `online/`, and `card-studio/` folders are excluded from the test run.

## Card Visualizer

Open `cards/visualize.html` in a browser. Use checkboxes to toggle card types. Note: not yet updated for V5's Starter Deck or the Green color rename — the visualizer still reflects V4 card art/text.
