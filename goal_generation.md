# Goal Card Generation System

## Overview
This document defines the system for generating goal cards for the Stock Trading Board Game. Each goal card contains:
1. A stock change type (market manipulation)
2. A goal requirement (collection requirement)
3. A reward (bonus for completing the goal)

## Stock Colors
- Blue
- Orange
- Yellow
- Purple

## Stock Change Types (7 types)

1. **Single Up**: One stock +1 (e.g., "Blue +1")
2. **Single Down**: One stock -1 (e.g., "Orange -1")
3. **Single Up Twice**: One stock +2 (e.g., "Blue +2")
4. **Single Down Twice**: One stock -2 (e.g., "Orange -2")
5. **Double Up**: Two stocks each +1 (e.g., "Blue +1, Yellow +1")
6. **Double Down**: Two stocks each -1 (e.g., "Orange -1, Purple -1")
7. **Mixed**: One stock +1, another -1 (e.g., "Blue +1, Orange -1")

## Goal Types (5 types)

1. **Three of a kind**: Collect 3 of the same color (e.g., "3 Blue")
   - 4 cards total (one for each color)

2. **Pair**: Collect 2 of the same color (e.g., "2 Orange")
   - 4 cards total (one for each color)

3. **Pair + Specific**: Collect 2 of one color and 1 of another specific color (e.g., "2 Blue + 1 Orange")
   - 4 cards total (various color combinations)

4. **Three Different**: Collect 1 of each of three different colors (e.g., "1 Blue + 1 Orange + 1 Yellow")
   - 4 cards total (all combinations of 3 colors: Blue+Orange+Yellow, Blue+Orange+Purple, Blue+Yellow+Purple, Orange+Yellow+Purple)

5. **None of**: Have zero of a specific color (e.g., "0 Purple")
   - 4 cards total (one for each color)

6. **Two Pair**: Collect 2 each of two different colors (e.g., "2 Blue + 2 Orange")
   - 4 cards total (adjacent color pairs: Blue+Orange, Orange+Yellow, Yellow+Purple, Purple+Blue)
   - Difficulty: 4 points

7. **One of Every**: Collect 1 of each of the four colors (e.g., "1 Blue + 1 Orange + 1 Yellow + 1 Purple")
   - 2 cards total
   - Difficulty: 4 points

**Total: 26 goal cards**

## Reward Tiers

### Low Rewards ($1 value)
- Gain $1
- Peek at top card, choose to put it on top or bottom of deck
- Look at another player's hand (see all their resource cards)

### Medium Rewards ($2 value)
- Gain $2
- Swap 1 of your resource cards with the top card of the deck
- Buy the lowest-priced stock for $1 discount
- Steal $1 from another player
- Peek at top 5 cards of the resource deck, and rearrange them in any order

### High Rewards ($3 value)
- Gain $3
- Adjust any one stock price by ±1 (before selling phase)
- All cards you sell this round get +$1 bonus
- Take a random resource from another player and give them one of your choice
- Buy any stock for $2 discount
- Gain the lowest value stock

## Scoring System

Each card gets a score based on:
**Score = Goal Difficulty Points - Stock Change Penalty**

### Goal Difficulty Points (harder goals need better rewards)
- Two Pair: 4 points
- One of Every: 4 points
- Three of a kind: 3 points
- Pair + Specific: 2 points
- Three Different: 2 points
- None of: 2 points
- Pair: 1 point

### Stock Change Penalty (better stock changes reduce reward needed)
- Single Up (+1): 0 penalty
- Single Down (-1): 0 penalty
- Mixed (+1/-1): -1 penalty
- Double Up (+1/+1): -1 penalty
- Double Down (-1/-1): -1 penalty
- Single Up Twice (+2): -2 penalty
- Single Down Twice (-2): -2 penalty

### Reward Assignment
After scoring all 26 cards:
1. Sort cards by final score
2. Bottom ~9 cards (easiest) → **Low rewards** ($1 value)
3. Middle ~9 cards → **Medium rewards** ($2 value)
4. Top ~8 cards (hardest) → **High rewards** ($3 value)

## Distribution Requirements

### Stock Change Type Distribution
- 7 stock change types across 26 cards
- 2 types appear 5 times each (single_down and double_down - to balance positive bias from one_of_every)
- 5 types appear 4 times each (including single_up and double_up, which are needed for one_of_every goals)
- Total: (2 × 5) + (5 × 4) = 26 ✓

### Goal Type Distribution
- 5 original goal types appear 4 times each = 20 cards
- Two Pair appears 4 times
- One of Every appears 2 times
- Total: 20 + 4 + 2 = 26 ✓

### Reward Distribution
- Approximately even split across Low, Medium, High tiers
- ~9/~9/~8 cards per tier

## Anti-Synergy Rules

These rules prevent cards from being too obvious or overpowered by avoiding perfect alignment between goals and stock movements.

### Rule 1: Don't strongly boost what you're collecting
- If goal is "3 Blue" → Blue cannot have +2
- If goal is "2 Orange" → Orange cannot have +2
- (+1 boosts are allowed but should be used sparingly)

### Rule 2: Don't penalize what you're collecting
- Any color required by the goal cannot have -1 or -2
- Examples:
  - "3 Blue" → Blue cannot go negative
  - "2 Orange" → Orange cannot go negative
  - "2 Blue + 1 Orange" → Neither Blue nor Orange can go negative
  - "Blue + Orange + Yellow" → None of those three can go negative

### Rule 3: Don't penalize what you're avoiding
- If goal is "0 Blue" → Blue cannot have -1 or -2
- (This creates tension rather than giving a free benefit)

### Rule 4: Don't strongly boost what you're avoiding
- If goal is "0 Blue" → Blue cannot have +2
- (Prevents the card from being too obvious: avoid Blue AND Blue tanks)

### Rule 5: Small boosts on collected colors are acceptable
- "3 Blue" with "Blue +1" is allowed (though should be used thoughtfully)
- The +1 creates some synergy but not overwhelming advantage like +2 would

### Examples for New Goal Types

**Two Pair Goals** (e.g., "2 Blue + 2 Orange"):
- Blue and Orange cannot have +2 (Rule 1)
- Blue and Orange cannot have -1 or -2 (Rule 2)
- Can have +1 on Blue or Orange (Rule 5)
- Can freely affect Yellow and Purple
- Valid stock changes: All 7 types can work with appropriate color choices

**One of Every Goals** (e.g., "1 Blue + 1 Orange + 1 Yellow + 1 Purple"):
- NO color can have +2 (Rule 1 - you're collecting all colors)
- NO color can have -1 or -2 (Rule 2 - you're collecting all colors)
- Can have +1 on any color (Rule 5)
- Valid stock changes: ONLY single_up and double_up (only +1 changes allowed)

## Design Philosophy

The goal is to create **tension** between the stock movements and collection goals:
- Players can't perfectly optimize for both their goal and the market movement
- This forces interesting strategic decisions during trading
- Prevents cards from telegraphing strategy too obviously
- Creates opportunities for bluffing and misdirection

## Generation Process

1. Create 26 goal cards (4 of each original goal type + 4 two_pair + 2 one_of_every)
2. Assign stock change types ensuring distribution (single_up and double_up get 5, others get 4)
3. Prioritize constrained cards: Assign single_up or double_up to one_of_every cards FIRST
4. Apply anti-synergy rules to avoid invalid combinations
5. Calculate scores for each card (Goal Difficulty - Stock Change Penalty)
6. Sort by score and assign to reward tiers (bottom ~9 = Low, middle ~9 = Medium, top ~8 = High)
7. Randomly select specific rewards from each tier for variety
