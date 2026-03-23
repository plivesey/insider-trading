#!/usr/bin/env python3
"""
Generate goal cards for the Stock Trading Board Game.
Outputs 32 cards (24 goal + 8 market manipulation) in JSON format.
"""

import json
import random
from typing import List, Dict, Set, Tuple, Optional
from collections import Counter

COLORS = ["Blue", "Red", "Yellow", "Black"]

# Stock change types
STOCK_CHANGES = [
    "single_up",      # +1 to one stock
    "single_down",    # -1 to one stock
    "single_up_twice",   # +2 to one stock
    "single_down_twice", # -2 to one stock
    "double_up",      # +1 to two stocks
    "double_down",    # -1 to two stocks
    "mixed"           # +1 to one, -1 to another
]

# Rewards with estimated dollar values
# Each reward can be used multiple times (no fixed count requirement)
REWARDS_WITH_VALUES = [
    ("Choose investigation increase (0-3) when playing this card", 0.75),
    ("Draw 2 goal cards", 0.75),
    ("Extra turn: take another action immediately", 1.00),
    ("Look at a random goal card from another player", 1.00),
    ("Gain $1", 1.00),
    ("Adjust any one stock price by ±1", 1.25),
    ("Steal $1 from another player", 1.50),
    ("Your next auction costs $2 less", 2.25),
    ("Gain $2", 2.00),
    ("Adjust any one stock price by ±2", 2.50),
    ("Gain $3", 3.00),
    ("Swap one of your resource cards with a face-up auction card", 3.00),
    ("Gain $4", 4.00),
]

# Derived list for backwards compatibility
ORDERED_REWARDS = [r[0] for r in REWARDS_WITH_VALUES]
REWARD_VALUES = {r[0]: r[1] for r in REWARDS_WITH_VALUES}

# Target total EV for all cards (matching market manipulation baseline)
TARGET_EV = 3.0

# Goal completion probabilities (with ~3.5 cards in hand)
COMPLETION_PROBS = {
    "pair": 0.80,
    "pair_plus_specific": 0.60,
    "three_different": 0.70,
    "three_of_a_kind": 0.40,
    "two_pair": 0.35,
    "one_of_every": 0.60,
}

# Cards required by each goal type
CARDS_REQUIRED = {
    "pair": 2,
    "pair_plus_specific": 3,
    "three_different": 3,
    "three_of_a_kind": 3,
    "two_pair": 4,
    "one_of_every": 4,
}

HAND_SIZE = 4.0

def create_market_manipulation_cards() -> List[Dict]:
    """Create 8 market manipulation cards with no goal requirements.

    These cards are powerful stock manipulation effects:
    - 4 cards with +2/+1 (total +3 each, evenly distributed)
    - 4 cards with -3 (one per color)

    Since they have no goals, the stock changes are their main value.
    """
    cards = []

    # +2/+1 cards - each color gets +2 once and +1 once
    # Pattern: Blue+2/Red+1, Red+2/Yellow+1, Yellow+2/Black+1, Black+2/Blue+1
    plus_patterns = [
        ("Blue", "Red"),
        ("Red", "Yellow"),
        ("Yellow", "Black"),
        ("Black", "Blue")
    ]

    for primary, secondary in plus_patterns:
        changes = {primary: 2, secondary: 1}
        stock_change = {
            "type": "plus_two_plus_one",
            "text": f"{primary} +2 / {secondary} +1",
            "changes": changes
        }
        card = {
            "goal_type": "none",
            "goal_text": "",
            "required_colors": {},
            "stock_change": stock_change,
            "is_market_manipulation": True
        }
        card["stock_ev"] = calculate_stock_change_ev(card, stock_change)
        cards.append(card)

    # -3 cards - one per color
    for color in COLORS:
        changes = {color: -3}
        stock_change = {
            "type": "single_down_triple",
            "text": f"{color} -3",
            "changes": changes
        }
        card = {
            "goal_type": "none",
            "goal_text": "",
            "required_colors": {},
            "stock_change": stock_change,
            "is_market_manipulation": True
        }
        card["stock_ev"] = calculate_stock_change_ev(card, stock_change)
        cards.append(card)

    return cards


def create_goal_cards() -> List[Dict]:
    """Create all 24 base goal cards (without stock changes assigned yet)."""
    cards = []

    # Three of a kind - 4 cards (one per color)
    for color in COLORS:
        cards.append({
            "goal_type": "three_of_a_kind",
            "goal_text": f"3 {color}",
            "required_colors": {color: 3},
        })

    # Pair - 4 cards (one per color)
    for color in COLORS:
        cards.append({
            "goal_type": "pair",
            "goal_text": f"2 {color}",
            "required_colors": {color: 2},
        })

    # Pair + Specific - 4 cards (various combinations)
    pair_specific_combos = [
        ("Blue", "Red"),
        ("Red", "Yellow"),
        ("Yellow", "Black"),
        ("Black", "Blue")
    ]
    for color1, color2 in pair_specific_combos:
        cards.append({
            "goal_type": "pair_plus_specific",
            "goal_text": f"2 {color1} + 1 {color2}",
            "required_colors": {color1: 2, color2: 1},
        })

    # Three Different - 4 cards (all combinations of 3 colors)
    from itertools import combinations
    for combo in combinations(COLORS, 3):
        cards.append({
            "goal_type": "three_different",
            "goal_text": f"1 {combo[0]} + 1 {combo[1]} + 1 {combo[2]}",
            "required_colors": {combo[0]: 1, combo[1]: 1, combo[2]: 1},
        })

    # Two Pair - 4 cards (adjacent color pairs)
    two_pair_combos = [
        ("Blue", "Red"),
        ("Red", "Yellow"),
        ("Yellow", "Black"),
        ("Black", "Blue")
    ]
    for color1, color2 in two_pair_combos:
        cards.append({
            "goal_type": "two_pair",
            "goal_text": f"2 {color1} + 2 {color2}",
            "required_colors": {color1: 2, color2: 2},
        })

    # One of Every - 4 cards (all 4 colors)
    for _ in range(4):
        cards.append({
            "goal_type": "one_of_every",
            "goal_text": "1 Blue + 1 Red + 1 Yellow + 1 Black",
            "required_colors": {color: 1 for color in COLORS},
        })

    return cards


def calculate_stock_change_ev(card: Dict, stock_change: Dict) -> float:
    """Calculate the relative-advantage EV of a stock change.

    Uses the principle: value = my wealth change - opponent wealth change.
    What matters for winning is wealth *relative* to opponents.

    For market manipulation cards (no goal constraints):
    - Positive: I accumulate ~2.0 cards, opponents hold ~1.0 → $1.00/point
    - Negative: I dump to ~0 cards, opponents hold ~1.0 → $1.00/point

    For goal cards (hand constrained by goal requirements):
    - Required color (count=1): I hold 1, opponents hold ~1 → $0.00/point (wash)
    - Required color (count>=2): blocked by anti-synergy, won't happen
    - Non-goal positive, spare slots > 0: I hold ~1.5, opponents ~1.0 → $0.50/point
    - Non-goal positive, spare slots = 0: can't hold extras → $0.00/point
    - Non-goal negative: I dump to 0, opponents hold ~1.0 → $1.00/point
    """
    goal_type = card.get("goal_type", "none")
    required_colors = card.get("required_colors", {})
    changes = stock_change["changes"]
    is_market = card.get("is_market_manipulation", False)

    ev = 0.0

    if is_market or goal_type == "none":
        # Market manipulation: $1.00 per point in both directions
        for color, change in changes.items():
            ev += abs(change) * 1.0
        return ev

    # Goal cards: relative advantage with hand constraints
    cards_required = CARDS_REQUIRED.get(goal_type, 3)
    spare_slots = max(0, HAND_SIZE - cards_required)

    # Calculate goal-strategy EV (playing the card to complete the goal)
    goal_ev = 0.0
    for color, change in changes.items():
        if color in required_colors:
            # Required color (count=1 only, count>=2 blocked by anti-synergy)
            # I hold same as opponents (~1 each) → no relative advantage
            goal_ev += 0.0
        else:
            # Non-goal color
            if change > 0:
                # Positive on non-goal: benefit only with spare hand slots
                if spare_slots > 0:
                    # I can hold ~1.5, opponents hold ~1.0 → $0.50/point
                    goal_ev += change * 0.50
                # else: hand full → $0
            else:
                # Negative on non-goal: I dump (~0.25 remaining), opponents hold ~1.0
                # Not quite $1/point because you can't always perfectly dump
                goal_ev += abs(change) * 0.75

    # Calculate market-manipulation-strategy EV (ignore goal, just use stock change)
    # Same as market manipulation: $1.00 per point in either direction
    market_ev = sum(abs(change) for change in changes.values()) * 1.0

    # The card is worth at least as much as its best strategy
    # Goal strategy gets the reward on top; market strategy doesn't
    # We return goal_ev here (reward is added separately), but ensure the
    # total card value accounts for the market-play floor
    ev = goal_ev

    # Store the market play value for use in reward assignment
    card["_market_play_ev"] = market_ev

    return ev


def weighted_choice(colors: List[str], color_frequency: Optional[Counter] = None) -> str:
    """Choose a color with weighting based on frequency (lower frequency = higher weight)."""
    if color_frequency is None or not color_frequency:
        return random.choice(colors)

    # Calculate weights: lower frequency = higher weight
    max_freq = max(color_frequency[c] for c in colors) if colors else 1
    weights = [(max_freq - color_frequency[c] + 1) for c in colors]

    # If all weights are 0, use equal weights
    if sum(weights) == 0:
        return random.choice(colors)

    # Use weighted random choice
    return random.choices(colors, weights=weights, k=1)[0]


def weighted_sample(colors: List[str], k: int, color_frequency: Optional[Counter] = None) -> List[str]:
    """Sample k colors with weighting based on frequency (lower frequency = higher weight)."""
    if color_frequency is None or not color_frequency or k >= len(colors):
        return random.sample(colors, k)

    # Sort colors by frequency and pick the k least used, with some randomness
    sorted_colors = sorted(colors, key=lambda c: color_frequency[c])

    # Pick from the k*2 least-used colors (or all if fewer)
    pool_size = min(len(sorted_colors), max(k * 2, k + 2))
    pool = sorted_colors[:pool_size]

    # Now do weighted selection from this pool
    selected = []
    remaining = pool.copy()

    for _ in range(k):
        if not remaining:
            break
        color = weighted_choice(remaining, color_frequency)
        selected.append(color)
        remaining.remove(color)

    return selected


def generate_stock_change(change_type: str, colors: List[str], color_frequency: Optional[Counter] = None) -> Dict:
    """Generate a stock change specification of the given type, with optional color frequency balancing."""
    if change_type == "single_up":
        color = weighted_choice(colors, color_frequency)
        return {
            "type": change_type,
            "text": f"{color} +1",
            "changes": {color: 1}
        }
    elif change_type == "single_down":
        color = weighted_choice(colors, color_frequency)
        return {
            "type": change_type,
            "text": f"{color} -1",
            "changes": {color: -1}
        }
    elif change_type == "single_up_twice":
        color = weighted_choice(colors, color_frequency)
        return {
            "type": change_type,
            "text": f"{color} +2",
            "changes": {color: 2}
        }
    elif change_type == "single_down_twice":
        color = weighted_choice(colors, color_frequency)
        return {
            "type": change_type,
            "text": f"{color} -2",
            "changes": {color: -2}
        }
    elif change_type == "double_up":
        colors_chosen = weighted_sample(colors, 2, color_frequency)
        return {
            "type": change_type,
            "text": f"{colors_chosen[0]} +1 / {colors_chosen[1]} +1",
            "changes": {colors_chosen[0]: 1, colors_chosen[1]: 1}
        }
    elif change_type == "double_down":
        colors_chosen = weighted_sample(colors, 2, color_frequency)
        return {
            "type": change_type,
            "text": f"{colors_chosen[0]} -1 / {colors_chosen[1]} -1",
            "changes": {colors_chosen[0]: -1, colors_chosen[1]: -1}
        }
    elif change_type == "mixed":
        colors_chosen = weighted_sample(colors, 2, color_frequency)
        return {
            "type": change_type,
            "text": f"{colors_chosen[0]} +1 / {colors_chosen[1]} -1",
            "changes": {colors_chosen[0]: 1, colors_chosen[1]: -1}
        }


def calculate_net_changes(cards: List[Dict]) -> Dict[str, int]:
    """Calculate the net change for each color across all cards."""
    net_changes = {color: 0 for color in COLORS}

    for card in cards:
        if "stock_change" in card:
            changes = card["stock_change"]["changes"]
            for color, change in changes.items():
                net_changes[color] += change

    return net_changes


def validate_balance(cards: List[Dict]) -> bool:
    """Validate that all colors have net zero change."""
    net_changes = calculate_net_changes(cards)
    return all(change == 0 for change in net_changes.values())


def calculate_color_frequency(cards: List[Dict]) -> Dict[str, int]:
    """Calculate how many times each color appears in stock changes."""
    from collections import Counter
    color_freq = Counter()
    for card in cards:
        if "stock_change" in card:
            for color in COLORS:
                if color in card["stock_change"]["text"]:
                    color_freq[color] += 1
    return dict(color_freq)


def validate_color_frequency_balance(cards: List[Dict], max_difference: int = 2) -> bool:
    """Validate that color frequencies are within acceptable range."""
    color_freq = calculate_color_frequency(cards)

    if not color_freq:
        return True

    max_freq = max(color_freq.values())
    min_freq = min(color_freq.values())
    return (max_freq - min_freq) <= max_difference


def validate_plus_minus_two_balance(cards: List[Dict]) -> bool:
    """Validate that each color has at least one +2 and one -2."""
    plus2_colors = set()
    minus2_colors = set()

    for card in cards:
        if "stock_change" not in card:
            continue
        if card.get("is_market_manipulation"):
            continue
        changes = card["stock_change"]["changes"]
        for color, val in changes.items():
            if val == 2:
                plus2_colors.add(color)
            elif val == -2:
                minus2_colors.add(color)

    all_colors = set(COLORS)
    return plus2_colors == all_colors and minus2_colors == all_colors


def is_valid_combination(card: Dict, stock_change: Dict) -> bool:
    """Check if a stock change is valid for a goal card (anti-synergy rules).

    Rules:
    - Pair: No positive changes on the collected color (too synergistic)
    - Two Pair: No negative changes on either collected color (too punishing)
    - General: No +2 on any collected color
    - General: No -2 on any collected color
    - General: Don't allow 3+ synergy matches of same sign
    - One of Every: Only positive changes allowed (handled by type restriction)
    """
    required_colors_dict = card.get("required_colors", {})
    required_colors = set(required_colors_dict.keys())
    changes = stock_change["changes"]
    goal_type = card.get("goal_type", "")

    # 2+ of a color rule: If collecting 2+ of any color, that color cannot
    # appear in stock changes at all (no positive or negative).
    # Applies to: pair, pair_plus_specific (the pair color), three_of_a_kind, two_pair
    for color, count in required_colors_dict.items():
        if count >= 2 and color in changes:
            return False

    # General: Don't strongly penalize (-2) what you're collecting (even singles)
    for color in required_colors:
        if color in changes and changes[color] <= -2:
            return False

    # General: Don't strongly boost (+2) what you're collecting (even singles)
    for color in required_colors:
        if color in changes and changes[color] == 2:
            return False

    # Don't allow 3+ synergy matches of same sign
    positive_synergy_count = 0
    negative_synergy_count = 0
    for color, count in required_colors_dict.items():
        if color in changes:
            if changes[color] == 1:
                positive_synergy_count += count
            elif changes[color] == -1:
                negative_synergy_count += count

    if positive_synergy_count >= 3 or negative_synergy_count >= 3:
        return False

    return True


def assign_stock_changes(cards: List[Dict], seed: int = None) -> List[Dict]:
    """Assign stock changes to cards following all rules and distribution requirements."""
    if seed is not None:
        random.seed(seed)

    max_attempts = 20000
    for attempt in range(max_attempts):
        # Distribution balanced to net 0:
        # Positive: su(2×+1) + sut(3×+2) + du(6×+2) + mixed(3×+1)
        #         = 2 + 6 + 12 + 3 = 23
        # Negative: sd(2×-1) + sdt(3×-2) + dd(5×-2) + mixed(3×-1)
        #         = 2 + 6 + 10 + 3 = 21... need adjustment
        # Let's balance: su=2,sd=2,sut=3,sdt=3,du=5,dd=5,mixed=4
        # Positive: 2 + 6 + 10 + 4 = 22
        # Negative: 2 + 6 + 10 + 4 = 22 ✓
        stock_change_counts = {
            "single_up": 2,
            "single_down": 2,
            "single_up_twice": 3,
            "single_down_twice": 3,
            "double_up": 5,
            "double_down": 5,
            "mixed": 4,
        }

        # Separate cards by type
        # one_of_every cards can only use single_up or double_up
        # All other cards (including pair) use general assignment
        one_of_every_cards = [c for c in cards if c.get("goal_type") == "one_of_every"]
        other_cards = [c for c in cards if c.get("goal_type") != "one_of_every"]
        random.shuffle(other_cards)

        # Track how many of each type we've used
        used_counts = {change: 0 for change in STOCK_CHANGES}

        # Track current net changes
        current_net = {color: 0 for color in COLORS}

        # Track color frequency (how many times each color appears)
        color_frequency = Counter({color: 0 for color in COLORS})

        # Assign stock changes
        assigned_cards = []

        # Helper function for scoring balance
        def combined_score(stock_change):
            # Net balance score (lower is better)
            net_score = 0
            for color, change in stock_change["changes"].items():
                new_value = current_net[color] + change
                net_score += abs(new_value)

            # Frequency balance score (lower is better)
            simulated_freq = color_frequency.copy()
            for color in COLORS:
                if color in stock_change["text"]:
                    simulated_freq[color] += 1

            if simulated_freq:
                max_freq = max(simulated_freq.values())
                min_freq = min(simulated_freq.values())
                freq_score = (max_freq - min_freq) * 10
            else:
                freq_score = 0

            return net_score + freq_score

        # 1. Assign one_of_every cards FIRST (only positive changes allowed)
        for card in one_of_every_cards:
            valid_attempts = []
            for change_type in ["single_up", "double_up"]:
                if used_counts[change_type] >= stock_change_counts[change_type]:
                    continue

                for _ in range(50):
                    stock_change = generate_stock_change(change_type, COLORS, color_frequency)
                    if is_valid_combination(card, stock_change):
                        valid_attempts.append((change_type, stock_change))

            if valid_attempts:
                valid_attempts.sort(key=lambda x: combined_score(x[1]))
                top_choices = max(1, len(valid_attempts) // 3)
                change_type, stock_change = random.choice(valid_attempts[:top_choices])

                used_counts[change_type] += 1
                for color, change in stock_change["changes"].items():
                    current_net[color] += change

                for color in COLORS:
                    if color in stock_change["text"]:
                        color_frequency[color] += 1

                complete_card = card.copy()
                complete_card["stock_change"] = stock_change
                complete_card["stock_ev"] = calculate_stock_change_ev(complete_card, stock_change)
                assigned_cards.append(complete_card)

        # Track which stock change types have been used per goal type (for diversity)
        goal_type_sc_types = {}  # goal_type -> set of stock change types used

        # 2. Assign all other cards (use regular stock change types)
        for card in other_cards:
            goal_type = card.get("goal_type", "unknown")
            used_sc_types = goal_type_sc_types.get(goal_type, set())

            # Find valid stock change types for this card
            prob = COMPLETION_PROBS.get(goal_type, 0.5)
            max_reward = max(rv for _, rv in REWARDS_WITH_VALUES)
            valid_attempts = []

            # Try each stock change type that still has quota
            for change_type in STOCK_CHANGES:
                if used_counts[change_type] >= stock_change_counts[change_type]:
                    continue

                # Try to generate a valid stock change of this type multiple times
                max_color_attempts = 50
                for _ in range(max_color_attempts):
                    stock_change = generate_stock_change(change_type, COLORS, color_frequency)
                    # Check anti-synergy rules
                    if not is_valid_combination(card, stock_change):
                        continue
                    # Check that max possible EV can reach $2.70
                    # (gives reward system room to work)
                    temp_card = card.copy()
                    sev = calculate_stock_change_ev(temp_card, stock_change)
                    mev = sum(abs(v) for v in stock_change["changes"].values())
                    max_ev = sev + prob * max_reward + (1 - prob) * mev
                    if max_ev < 2.70:
                        continue
                    valid_attempts.append((change_type, stock_change))

            if not valid_attempts:
                # Fallback: try any remaining type
                for change_type in STOCK_CHANGES:
                    if used_counts[change_type] >= stock_change_counts[change_type]:
                        continue
                    for _ in range(20):
                        stock_change = generate_stock_change(change_type, COLORS, color_frequency)
                        if is_valid_combination(card, stock_change):
                            valid_attempts.append((change_type, stock_change))
                            break
                    if valid_attempts:
                        break

            if valid_attempts:
                # Score each attempt: balance + diversity within goal type
                def diversity_score(attempt):
                    change_type, sc = attempt
                    base = combined_score(sc)
                    # Penalize reusing the same stock change type within a goal type
                    if change_type in used_sc_types:
                        base += 5
                    # Penalize same net direction (all positive or all negative)
                    net = sum(sc["changes"].values())
                    same_sign_cards = [c for c in assigned_cards
                                      if c.get("goal_type") == goal_type
                                      and sum(c["stock_change"]["changes"].values()) * net > 0]
                    if same_sign_cards:
                        base += 3
                    return base

                valid_attempts.sort(key=diversity_score)
                # Pick from top 30% to maintain some randomness
                top_choices = max(1, len(valid_attempts) // 3)
                change_type, stock_change = random.choice(valid_attempts[:top_choices])

                used_counts[change_type] += 1

                # Track stock change type per goal type for diversity
                if goal_type not in goal_type_sc_types:
                    goal_type_sc_types[goal_type] = set()
                goal_type_sc_types[goal_type].add(change_type)

                # Update current net
                for color, change in stock_change["changes"].items():
                    current_net[color] += change

                # Update color frequency
                for color in COLORS:
                    if color in stock_change["text"]:
                        color_frequency[color] += 1

                # Create the complete card
                complete_card = card.copy()
                complete_card["stock_change"] = stock_change
                complete_card["stock_ev"] = calculate_stock_change_ev(complete_card, stock_change)
                assigned_cards.append(complete_card)

        # Check if balanced (net balance and color frequency)
        if (validate_balance(assigned_cards) and
            validate_color_frequency_balance(assigned_cards)):
            return assigned_cards

    # If we couldn't achieve balance, return the best attempt
    print(f"Warning: Could not achieve perfect balance after {max_attempts} attempts", file=__import__('sys').stderr)
    print(f"Final net changes: {calculate_net_changes(assigned_cards)}", file=__import__('sys').stderr)
    color_freq = calculate_color_frequency(assigned_cards)
    print(f"Final color frequency: {color_freq}", file=__import__('sys').stderr)
    if color_freq:
        freq_range = max(color_freq.values()) - min(color_freq.values())
        print(f"Color frequency range: {freq_range}", file=__import__('sys').stderr)
    print(f"±2 balance: {validate_plus_minus_two_balance(assigned_cards)}", file=__import__('sys').stderr)
    return assigned_cards


def calculate_scores_and_assign_rewards(cards: List[Dict]) -> List[Dict]:
    """Assign rewards to hit TARGET_EV (~$3.00) for each card.

    For each card, calculates the ideal reward value:
        needed_reward = (TARGET_EV - stock_ev) / completion_prob

    Then assigns rewards by matching cards to their closest-value reward,
    with a diversity constraint (no two cards of same goal type share a reward).
    """
    num_rewards = len(REWARDS_WITH_VALUES)

    # Ensure all cards have stock_ev and completion_prob
    for card in cards:
        if "stock_ev" not in card:
            card["stock_ev"] = calculate_stock_change_ev(card, card["stock_change"])
        card["completion_prob"] = COMPLETION_PROBS.get(card.get("goal_type", ""), 0.5)
        market_ev = card.get("_market_play_ev", 0)

        # Blended formula: total = stock_ev + prob*reward + (1-prob)*market_ev
        # Solve for reward: reward = (TARGET - stock_ev - (1-prob)*market_ev) / prob
        fallback_ev = (1 - card["completion_prob"]) * market_ev
        card["needed_reward"] = (TARGET_EV - card["stock_ev"] - fallback_ev) / card["completion_prob"]

    # Max times any single reward can be used (allows flexibility but ensures variety)
    MAX_REWARD_USES = 3

    # Track usage counts per reward
    reward_usage = {i: 0 for i in range(num_rewards)}

    # Sort by needed_reward descending: neediest cards get first pick
    cards_sorted = sorted(cards, key=lambda c: -c["needed_reward"])

    # Track which goal types have been assigned to each reward
    reward_goal_types = {i: [] for i in range(num_rewards)}

    for card in cards_sorted:
        goal_type = card.get("goal_type", "unknown")
        needed = card["needed_reward"]
        best_idx = None
        best_score = float('inf')

        for reward_idx in range(num_rewards):
            if reward_usage[reward_idx] >= MAX_REWARD_USES:
                continue

            reward_text, reward_value = REWARDS_WITH_VALUES[reward_idx]

            # Primary score: distance from needed reward value
            distance = abs(reward_value - needed)

            # Diversity penalty: same goal type already using this reward
            # Keep it small (0.5) so it prefers diversity without forcing
            # neediest cards into terrible mismatches
            if goal_type in reward_goal_types[reward_idx]:
                distance += 0.5

            if distance < best_score:
                best_score = distance
                best_idx = reward_idx

        if best_idx is not None:
            reward_text, reward_value = REWARDS_WITH_VALUES[best_idx]
            card["reward"] = reward_text
            card["reward_value"] = reward_value
            reward_usage[best_idx] += 1
            reward_goal_types[best_idx].append(goal_type)

    # Swap optimization: try pairwise swaps to reduce total deviation from target
    improved = True
    while improved:
        improved = False
        for i in range(len(cards)):
            for j in range(i + 1, len(cards)):
                c1, c2 = cards[i], cards[j]
                r1, r2 = c1["reward_value"], c2["reward_value"]
                p1, p2 = c1["completion_prob"], c2["completion_prob"]
                m1, m2 = c1.get("_market_play_ev", 0), c2.get("_market_play_ev", 0)
                s1, s2 = c1["stock_ev"], c2["stock_ev"]

                # Current total EVs
                ev1 = s1 + p1 * r1 + (1 - p1) * m1
                ev2 = s2 + p2 * r2 + (1 - p2) * m2
                current_dev = abs(ev1 - TARGET_EV) + abs(ev2 - TARGET_EV)

                # Swapped total EVs
                ev1_swap = s1 + p1 * r2 + (1 - p1) * m1
                ev2_swap = s2 + p2 * r1 + (1 - p2) * m2
                swap_dev = abs(ev1_swap - TARGET_EV) + abs(ev2_swap - TARGET_EV)

                if swap_dev < current_dev - 0.01:
                    # Don't swap if it would push either card below $2.50
                    if ev1_swap < 2.50 or ev2_swap < 2.50:
                        continue
                    c1["reward"], c2["reward"] = c2["reward"], c1["reward"]
                    c1["reward_value"], c2["reward_value"] = r2, r1
                    improved = True

    # Assign tiers based on reward value
    for card in cards:
        rv = card.get("reward_value", 1.0)
        if rv >= 2.5:
            card["reward_tier"] = "high"
        elif rv >= 1.5:
            card["reward_tier"] = "medium"
        else:
            card["reward_tier"] = "low"

    # Calculate total EV using blended formula
    for card in cards:
        rv = card.get("reward_value", 1.0)
        prob = card["completion_prob"]
        market_ev = card.get("_market_play_ev", 0)
        # Blended: goal strategy when completing + market fallback when not
        card["total_ev"] = card["stock_ev"] + prob * rv + (1 - prob) * market_ev
        card["score"] = card["total_ev"]

    return cards


def parse_reward(reward_text: str, reward_tier: str) -> Dict:
    """Parse reward text to determine type and requirements."""
    reward_lower = reward_text.lower()

    # Use fixed dollar value from REWARD_VALUES, fall back to tier
    value = REWARD_VALUES.get(reward_text, {"low": 1, "medium": 2, "high": 3}.get(reward_tier, 1))

    # Choose investigation
    if "choose investigation" in reward_lower:
        return {
            "type": "choose_investigation",
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Look at random goal card
    if "look at" in reward_lower and "goal card" in reward_lower:
        return {
            "type": "look_at_goal_card",
            "requiresTarget": True,
            "requiresChoice": False,
            "value": value
        }

    # Cash rewards
    if "gain $" in reward_lower:
        amount = int(reward_text.split("$")[1].split()[0])
        return {
            "type": "gain_cash",
            "amount": amount,
            "requiresTarget": False,
            "requiresChoice": False,
            "value": value
        }

    # Steal cash
    if "steal" in reward_lower and "$" in reward_text:
        amount = int(reward_text.split("$")[1].split()[0])
        return {
            "type": "steal_cash",
            "amount": amount,
            "requiresTarget": True,
            "requiresChoice": False,
            "value": value
        }

    # Draw 2 goal cards
    if "draw 2 goal" in reward_lower:
        return {
            "type": "draw_goal_cards",
            "amount": 2,
            "requiresTarget": False,
            "requiresChoice": False,
            "value": value
        }

    # Next auction discount
    if "next auction" in reward_lower and "$2 less" in reward_lower:
        return {
            "type": "next_auction_discount",
            "discount": 2,
            "requiresTarget": False,
            "requiresChoice": False,
            "value": value
        }

    # Extra turn
    if "extra turn" in reward_lower:
        return {
            "type": "extra_turn",
            "requiresTarget": False,
            "requiresChoice": False,
            "value": value
        }

    # Adjust stock ±2 (check before ±1 since both contain "adjust")
    if "adjust" in reward_lower and "±2" in reward_text:
        return {
            "type": "adjust_stock_2",
            "amount": 2,
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Adjust stock ±1
    if "adjust" in reward_lower and "±1" in reward_text:
        return {
            "type": "adjust_stock",
            "amount": 1,
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Swap with face-up card
    if "swap" in reward_lower and "face-up" in reward_lower:
        return {
            "type": "swap_with_face_up",
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Default unknown
    return {
        "type": "unknown",
        "requiresTarget": False,
        "requiresChoice": False,
        "value": value
    }


def create_final_card_format(card: Dict) -> Dict:
    """Format card for final JSON output with pre-parsed data."""
    is_market_manipulation = card.get("is_market_manipulation", False)

    if is_market_manipulation:
        return {
            "stockChange": {
                "text": card["stock_change"]["text"],
                "parsed": card["stock_change"]["changes"],
                "type": card["stock_change"]["type"]
            },
            "goal": None,
            "reward": None,
            "metadata": {
                "goalType": "none",
                "rewardTier": None,
                "stockEV": card.get("stock_ev", 0.0),
                "totalEV": card.get("stock_ev", 0.0),
                "isMarketManipulation": True
            }
        }

    goal_parsed = {
        "type": card["goal_type"],
        "requirements": card.get("required_colors", {})
    }

    return {
        "stockChange": {
            "text": card["stock_change"]["text"],
            "parsed": card["stock_change"]["changes"],
            "type": card["stock_change"]["type"]
        },
        "goal": {
            "text": card["goal_text"],
            "parsed": goal_parsed
        },
        "reward": {
            "text": card["reward"],
            "parsed": parse_reward(card["reward"], card["reward_tier"])
        },
        "metadata": {
            "goalType": card["goal_type"],
            "rewardTier": card["reward_tier"],
            "completionProbability": card.get("completion_prob", 0.5),
            "stockEV": card.get("stock_ev", 0.0),
            "totalEV": card.get("total_ev", 0.0),
            "score": card.get("score", 0.0)
        }
    }


def main():
    """Generate and output 32 cards (24 goal + 8 market manipulation)."""
    # Create base goal cards
    goal_cards = create_goal_cards()

    # Assign stock changes to goal cards
    goal_cards = assign_stock_changes(goal_cards, seed=42)

    # Calculate scores and assign rewards to goal cards
    goal_cards = calculate_scores_and_assign_rewards(goal_cards)

    # Create market manipulation cards (already have stock changes assigned)
    market_cards = create_market_manipulation_cards()

    # Combine all cards
    all_cards = goal_cards + market_cards

    # Format for output
    final_cards = [create_final_card_format(card) for card in all_cards]

    # Output JSON
    print(json.dumps(final_cards, indent=2))

    # Print statistics
    print("\n# Statistics:", file=__import__('sys').stderr)
    print(f"Total cards: {len(final_cards)}", file=__import__('sys').stderr)
    print(f"  Goal cards: {len(goal_cards)}", file=__import__('sys').stderr)
    print(f"  Market manipulation cards: {len(market_cards)}", file=__import__('sys').stderr)

    # Count by reward tier (only for goal cards)
    tiers = {}
    for card in final_cards:
        tier = card["metadata"]["rewardTier"]
        if tier is not None:
            tiers[tier] = tiers.get(tier, 0) + 1
    print(f"Reward distribution (goal cards only): {tiers}", file=__import__('sys').stderr)

    # Count by goal type
    goal_types = {}
    for card in final_cards:
        gt = card["metadata"]["goalType"]
        goal_types[gt] = goal_types.get(gt, 0) + 1
    print(f"Goal type distribution: {goal_types}", file=__import__('sys').stderr)

    # Validate and display balance for goal cards
    net_changes = calculate_net_changes(goal_cards)
    is_balanced = validate_balance(goal_cards)
    print(f"\n# Balance Validation (goal cards):", file=__import__('sys').stderr)
    print(f"Net changes by color: {net_changes}", file=__import__('sys').stderr)
    print(f"Balanced (all colors net to 0): {is_balanced}", file=__import__('sys').stderr)

    # Validate balance for market manipulation cards
    # +2/+1 cards: each color gets +2 and +1 = +3
    # -3 cards: each color gets -3
    # Net: +3 - 3 = 0 per color
    market_net = calculate_net_changes(market_cards)
    market_balanced = all(v == 0 for v in market_net.values())
    print(f"\n# Balance Validation (market manipulation cards):", file=__import__('sys').stderr)
    print(f"Net changes by color: {market_net}", file=__import__('sys').stderr)
    print(f"Balanced (all colors net to 0): {market_balanced}", file=__import__('sys').stderr)

    # Display color frequency for goal cards
    color_freq = calculate_color_frequency(goal_cards)
    is_freq_balanced = validate_color_frequency_balance(goal_cards)
    print(f"\n# Color Frequency in Stock Changes (goal cards):", file=__import__('sys').stderr)
    for color in sorted(COLORS):
        print(f"{color}: {color_freq.get(color, 0)}", file=__import__('sys').stderr)
    if color_freq:
        freq_range = max(color_freq.values()) - min(color_freq.values())
        print(f"Range: {freq_range} (target: ≤2)", file=__import__('sys').stderr)
        print(f"Frequency balanced: {is_freq_balanced}", file=__import__('sys').stderr)


if __name__ == "__main__":
    main()
