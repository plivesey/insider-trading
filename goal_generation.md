# Goal Card Generation System

## Overview
This document defines the system for generating goal cards for the Stock Trading Board Game. Each goal card contains:
1. A stock change type (market manipulation)
2. A goal requirement (collection requirement)
3. A reward (bonus for completing the goal)

## Stock Colors
- Blue
- Red
- Yellow
- Black

## Stock Change Types (7 types)

1. **Single Up**: One stock +1 (e.g., "Blue +1")
2. **Single Down**: One stock -1 (e.g., "Red -1")
3. **Single Up Twice**: One stock +2 (e.g., "Blue +2")
4. **Single Down Twice**: One stock -2 (e.g., "Red -2")
5. **Double Up**: Two stocks each +1 (e.g., "Blue +1, Yellow +1")
6. **Double Down**: Two stocks each -1 (e.g., "Red -1, Black -1")
7. **Mixed**: One stock +1, another -1 (e.g., "Blue +1, Red -1")

## Goal Types (6 types)

1. **Three of a Kind**: Collect 3 of the same color (e.g., "3 Blue")
   - 4 cards total (one for each color)

2. **Pair**: Collect 2 of the same color (e.g., "2 Red")
   - 4 cards total (one for each color)

3. **Pair + Specific**: Collect 2 of one color and 1 of another (e.g., "2 Blue + 1 Red")
   - 4 cards total (adjacent color pairs: Blue+Red, Red+Yellow, Yellow+Black, Black+Blue)

4. **Three Different**: Collect 1 of each of three different colors (e.g., "1 Blue + 1 Red + 1 Yellow")
   - 4 cards total (all combinations of 3 colors)

5. **Two Pair**: Collect 2 each of two different colors (e.g., "2 Blue + 2 Red")
   - 4 cards total (adjacent color pairs: Blue+Red, Red+Yellow, Yellow+Black, Black+Blue)

6. **One of Every**: Collect 1 of each of the four colors
   - 4 cards total

**Total: 24 goal cards + 8 market manipulation cards = 32 total**

## Market Manipulation Cards

8 cards with stock movements but no goal or reward:
- 4 cards with "plus_two_plus_one" type (e.g., "Blue +2 / Red +1")
- 4 cards with "single_down_triple" type (e.g., "Blue -3")

These are always playable (no goal requirement) but still cost +2 investigation.

## Reward Types (13 rewards, each used 1-3 times = 24 cards)

Rewards ordered from weakest to strongest:

1. **Choose investigation** (0-3) when playing this card (~$0.75 value)
2. **Look at goal card**: See a random goal card from another player (~$1.00)
3. **Gain $1** ($1.00)
4. **Steal $1** from another player (~$1.50)
5. **Peek and rearrange**: Look at top 5 deck cards, put back in any order (~$1.50)
6. **Auction discount**: Next auction costs $2 less (~$2.00)
7. **Gain $2** ($2.00)
8. **Extra turn**: Take another action immediately (~$2.50)
9. **Gain $3** ($3.00)
10. **Adjust stock +-1**: Change any stock price by 1 (~$3.00)
11. **Swap with face-up**: Swap one of your cards with a face-up auction card (~$3.50)
12. **Gain $4** ($4.00)
13. **Adjust stock +-2**: Change any stock price by 2 (~$4.00)

## EV-Based Scoring System

Each card is scored using Expected Value (EV) to determine which reward it receives. Cards with lower stock change EV get better rewards to balance overall card power.

### Total Card EV = Stock Change EV + (Completion Probability × Reward Value)

### Goal Completion Probabilities

Based on ~3.5 cards in hand when playing a goal:

| Goal Type | Cards Required | Spare Slots | Probability |
|---|---|---|---|
| pair | 2 | 1.5 | 80% |
| pair_plus_specific | 3 | 0.5 | 60% |
| three_different | 3 | 0.5 | 70% |
| three_of_a_kind | 3 | 0.5 | 40% |
| two_pair | 4 | 0 | 40% |
| one_of_every | 4 | 0 | 50% |

### Stock Change EV Calculation

The value of stock changes depends on synergy with the goal:

**For colors required by the goal:**
- +N: +$N per required card (guaranteed benefit - you hold those cards)
- -N: -$N per required card (hurts - you're locked into holding those)

**For colors NOT required by the goal:**
- +N: +$N × (spare_slots / num_beneficial_colors) (spare cards optimistically allocated)
- -N: +$N × 0.75 (relative advantage - opponents average ~1 card of each color)

**For 4-card goals with non-goal color changes:**
- ~$0 (no spare hand slots for non-goal colors)

**For market manipulation cards (no goal):**
- Assume player holds ~1.5 cards of each affected color
- Example: "+2 Blue / +1 Red" → +$2×1.5 + $1×1.5 = +$4.50

### Reward Assignment

Uses target-based matching to hit ~$3.00 total EV per card:

1. Calculate `needed_reward = (TARGET_EV - stock_ev - (1-prob)*market_ev) / prob` for each card
2. Sort cards by needed_reward descending (neediest first)
3. Greedy assign: pick the available reward closest to needed value (max 3 uses per reward)
4. Swap optimization: pairwise reward swaps to reduce total deviation from target
5. Guard: no swap may push a card below $2.50 EV

## Anti-Synergy Rules

These rules prevent cards from being too obvious or overpowered.

### Core Rule: 2+ Color Protection
If a goal requires **2 or more** of any color, that color **cannot appear in the stock change at all** — no positive, no negative. This applies to:
- **Pair** (2 of a color): the pair color is fully protected
- **Pair + Specific** (2 of one + 1 of another): only the pair color is protected; the single color follows general rules
- **Three of a Kind** (3 of a color): the collected color is fully protected
- **Two Pair** (2 each of two colors): both colors are fully protected

### General Rules (for single-count colors)
- **No +2 on collected colors**: Even a single-required color can't have +2
- **No -2 on collected colors**: Even a single-required color can't have -2
- **No 3+ synergy matches**: Can't have 3+ collected cards all affected by changes of the same sign
- Small changes (+1 or -1) on single-required colors **are** acceptable

### One of Every (special case)
- Since all 4 colors are collected (count=1 each), no color can have +2 or -2
- Can only use `single_up` and `double_up` stock change types (+1 only)

## Color Balance

The system ensures all colors net to zero across all 24 goal cards:
- Sum of all stock changes for each color = 0
- This ensures no color is systematically advantaged

## Generation Process

1. Create 24 goal cards (4 of each of 6 goal types)
2. Create 8 market manipulation cards
3. Assign stock change types ensuring distribution and balance
4. Prioritize constrained cards: one_of_every gets single_up/double_up FIRST
5. Apply anti-synergy rules
6. Calculate stock change EV for each card
7. Sort by EV and assign rewards (weakest cards get best rewards)
8. Validate: correct distribution, color balance, no anti-synergy violations
