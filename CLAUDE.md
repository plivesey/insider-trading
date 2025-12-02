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
**Stock Change Penalties**:
- Single Up/Down: 0 penalty
- Mixed/Double Up/Down: -1 penalty
- Single Up/Down Twice: -2 penalty

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
├── goal_cards.html            # Visual card layout for printing (output)
├── rules.md                   # Complete game rules
├── goal_generation.md         # Design documentation and generation system
└── CLAUDE.md                  # This file - project context
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

## Usage

### Generate New Card Deck
```bash
python3 generate_goal_cards.py > goal_cards.json
```

**Output includes**:
- JSON array of 26 goal cards
- Statistics on goal type distribution
- Reward tier distribution
- Balance validation results

### Generate Printable Cards
```bash
python3 visualize_cards.py > goal_cards.html
```

Creates an HTML page with all 26 cards in a grid layout suitable for printing.

## Development History

### Recent Changes (Latest Update)
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

Potential expansions or modifications:
- Add more goal types (5-card goals?)
- Variant rules for different player counts
- Expansion packs with new reward types
- Digital implementation for online play
- Alternative scoring systems

## Credits

Card generation system with anti-synergy rules and balanced distribution.
Designed for strategic depth while maintaining accessibility.
