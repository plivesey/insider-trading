# Insider Trading Board Game - V6 Project Documentation

## Project Overview

A strategic trading and market manipulation board game for 2-6 players set in 1920s Wall Street. Players auction stocks, race for goals — some public, some secret — and watch prices swing as every buy, sell, and dice-bag draw moves the market. A shared progress tracker counts every market-moving event and completed goal; once it hits its threshold, the game ends immediately.

**Players**: 2-6
**Victory Condition**: Highest total wealth (cash + stock value at current prices + end-game goal bonuses − loan penalty: 1st loan costs $12, 2nd (and max) loan costs $14). **Max 2 loans per player.**
**Game End**: The progress tracker reaches its threshold (3 × players + 3). This is the *only* end condition.

Full rules: `rules.md`. Open/tunable numbers not yet settled by playtesting: `v6_tuning_notes.md` (see `v5_tuning_notes.md` for the frozen V5-era record). Game-length benchmark history: `v6_game_length_log.md` (`v5_game_length_log.md` for V5-era numbers). Plan for migrating the online implementation to V5: `online/V5_MIGRATION_PLAN.md` (historical).

## V6 Key Changes (from V5)

- **Classic is gone — Alternate is now the only ruleset, physical and online alike.** There is no more Classic-vs-Alternate distinction anywhere: the 24-card printed Starter Deck, the pass-and-draft-from-a-combined-event-and-starter-deck-pile procedure, and the 5 hidden end-game bonus cards it carried are all retired. (Classic was already removed from `online/` on 2026-09-28; V6 retires it from the rules themselves.)
- **Event Deck split into a Tip Deck and a Goal Deck.** The old V5 "one shuffled deck of market-movement + goal cards" is gone. The 28 market-movement cards now live in their own Tip Deck; the 19 goal cards are shuffled and **all revealed face-up at setup** (`players + 3` of them — 5 at 2 players, up to 9 at 6), with the remainder forming a face-down **goal reserve** that only feeds the setup draft's 50/50 split and is never drawn from again. Goals are no longer discovered mid-game via dice or Insider Source.
- **Insider Source is tip-deck-only now**: draws 2 market-movement cards (same count as before), no longer has a chance of drawing a private goal. Since goals are never drawn mid-game, there's no in-play way to gain a new private goal after setup — all private goals come from the initial draft.
- **Dice rebalanced for the deck split**: since every "draw" face now guarantees a tip card (vs. the old merged deck's ~60% odds), total draw-pip volume in the bag was cut to ~60% of its V5 level — die D is now `draw1×5, draw2×1` and die C is `nothing×4, bull×1, draw1×1`. See `v6_game_length_log.md` for the measured pacing effect (substantially faster than V5 at every player count, especially 6p).
- **Starter Deck trimmed to just 8 basic stock cards** (2/color), dealt 1 per player at setup. Foresight, Backroom Deal, and Double Down — previously "promoted" from the Starter Deck into the Market Deck at load time — are now ordinary entries directly in `action_cards.json`. Fire Sale, First Look, Windfall, Market Panic, and all 5 hidden bonus cards (Nest Egg, Portfolio, Trophy Case, Clean Ledger, Easy Credit) are deleted outright — they only ever existed for Classic.
- **Bots: decaying tip-play threshold.** Bots used to auto-play a market-movement card from hand the instant it scored `>0` (often as low as $2) — almost always too early, since the same card is usually worth more later as stock ownership concentrates. Replaced with a threshold that starts high (~$10) and decays toward a floor (~$4-6) as the game progresses, scaled by progress fraction (not raw turn count, since turn counts vary a lot by player count).
- **Bots: opponent-aware tip scoring.** A new `opponentImpactWeight` term in the bot's market-movement valuation weighs a card's effect on opponents' *publicly observable* stock holdings (`state.publicStockKnowledge` — every stock transfer except the secret initial starter-stock deal is publicly trackable), not just the bot's own. A card that barely touches the bot's own holdings but would hurt a rival loaded up on that color is now worth playing. Required finding and fixing an ES search-parameterization bug (a bad parameter bound trapped this weight near its default across 3 retrains) before it could show real value — see `v6_tuning_notes.md`.
- **Bots: corrected sell logic.** A bot's own held market-movement card is not a threat to itself (only the holder can choose to play it, and the self-scoring term already discourages self-harm) — an earlier "preemptive sell" heuristic based on the opposite assumption regressed game length badly and was reverted. Replaced with a narrower **sell-to-enable-an-attack** heuristic: sell a stock to clear the way for a held card only when the color isn't needed for any goal and selling would actually flip the card from unplayable to playable.
- **Engine bugfix: market-refill after every sell/discard.** `sellStock` and several discard-producing sites never rechecked whether the market needed topping up afterward, which could permanently strand the market at 0 cards and deadlock the game. All discard sites now call `refillMarketIfNeeded`.

## Card Types (111 cards + 6 dice)

### Stock Cards (36) - `cards/stock_cards.json`
- 32 colored: 8 each of Blue, Orange, Green, Purple (4 blank + 4 special per color)
- Special types: `extra_up` (Boom), `other_up` (Tip-Off), `peek_buy` (Scout, gains the top tip-deck card on buy), `peek_sell` (Informant — name is a holdover from V4; peeks top 2 of the tip deck on buy)
- 4 colorless `wild` (Wild Share) cards
- All shuffled into the 50-card Market Deck (with Action Cards) and auctioned

### Action Cards (14) - `cards/action_cards.json`
- Shuffled into the Market Deck and auctioned; held in hand; played free at any time
- 5 persistent (Preferred Bidder + Oil/Rail/Steel/Bank Broker), 9 single-use
- One **Insider Source** card (`draw_tip`, `count: 2`): draws the top 2 cards of the tip deck into the player's hand, tip-deck-only (see V6 Key Changes).
- **Foresight**, **Backroom Deal**, and **Double Down** live here directly now — previously promoted at load time from the old Starter Deck, now ordinary entries like everything else.
- Black Market, Tipster's Choice, The Squeeze, and Wild Speculation no longer exist.

### Insider Tip Cards (28, Tip Deck) - `cards/insider_tip_cards.json`
- 12 crash (halve a color, 3 per color), 4 surge (+4 to one color), 6 slump (−2/−2 to two colors, all 6 color pairs), 6 shift (+2 to one color / −2 to another, all 6 color pairs)
- Shuffled into its own 28-card Tip Deck at setup, separate from goals. Dice "draw" faces, Scout, Informant, Foresight, and Insider Source all target this deck exclusively.

### Goal Cards (19, Goal Deck) - `cards/goal_cards.json`
- 4 pair (easy), 1 full spread (medium), 4 three-of-a-kind (hard), 6 two-pair (hard), 4 four-of-a-kind (very_hard)
- All shuffled and split at setup: `players + 3` revealed face-up into the public goal row, the rest become a face-down goal reserve feeding the draft's 50/50 split. Never drawn from mid-game — a drafted goal is **private** (secret, in one player's hand); a revealed one is **public** (goal row, claimable by anyone).

### Loan Cards - `cards/loan_cards.json`
- Face-up; auto-issued ($10 each) when a player cannot cover a payment. **Max 2 per player.** End-game cost: 1st loan $12, 2nd $14 (computed by the engine, not stored per-card — the JSON's `endGameValue` field is legacy/decorative).

### Starter Deck (8) - `cards/starter_deck.json`
- **8 basic stock cards** (2 each of Blue/Orange/Green/Purple, blank, no special ability), dealt 1 per player at setup, visible from the start. Nothing else lives here anymore — see V6 Key Changes.

Hot Tip cards (`peek_cards.json`) no longer exist.

## Project Structure

```
insider-trading/
├── CLAUDE.md                      # This file
├── rules.md                       # Complete V6 game rules
├── v6_tuning_notes.md             # Open/tunable V6 numbers pending playtesting
├── v6_game_length_log.md          # V6 game-length benchmark history
├── v5_tuning_notes.md             # Frozen V5-era tuning record
├── v5_game_length_log.md          # Frozen V5-era game-length benchmark history
├── package.json                   # Jest config
├── cards/
│   ├── stock_cards.json           # 36 stock cards
│   ├── action_cards.json          # 14 action cards
│   ├── insider_tip_cards.json     # 28 market-movement cards (Tip Deck)
│   ├── goal_cards.json            # 19 goal cards (Goal Deck)
│   ├── loan_cards.json            # 6 loan cards
│   ├── starter_deck.json          # 8 basic starter stock cards (setup only)
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
├── online/                        # Live web implementation (backend/frontend/shared) — V6, see online/V5_MIGRATION_PLAN.md for migration history/notes
├── v2/                            # Archived v2
├── v3/                            # Archived v3
├── v4/                            # Archived V4 (frozen snapshot, incl. online/ as it stood at V4) — do not edit
└── v5/                            # Archived V5 (frozen snapshot, incl. online/ as it stood at V5) — do not edit
```

## Running Tests

```bash
npm test          # Run all validation tests
npm run test:watch # Watch mode
```

Tests validate JSON card files for correct counts, structure, color balance, and game rules. The `v2/`, `v3/`, `v4/`, `v5/`, `online/`, and `card-studio/` folders are excluded from the test run.

## Card Visualizer

Open `cards/visualize.html` in a browser. Use checkboxes to toggle card types. Note: not yet updated for V6's Tip/Goal Deck split or the Green color rename — the visualizer still reflects older card art/text.
