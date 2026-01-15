#!/usr/bin/env python3
"""
Generate goal cards for the Stock Trading Board Game.
Outputs 20 cards in JSON format following all anti-synergy rules.
"""

import json
import random
from typing import List, Dict, Set, Tuple, Optional
from collections import Counter

COLORS = ["Blue", "Orange", "Yellow", "Purple"]

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

# Rewards by tier
LOW_REWARDS = [
    "Gain $1",
    "Peek at top card, choose to put it on top or bottom of deck",
    "Look at random goal card from another player",
    "Swap 1 of your resource cards with the top card of the deck",
    "Gain $3"
]

MEDIUM_REWARDS = [
    "Gain $1",
    "Gain $2",
    "Swap 1 of your resource cards with the top card of the deck",
    "Buy the lowest-priced stock for $1 discount",
    "Steal $1 from another player",
    "Peek at top 5 cards of the resource deck, and rearrange them in any order",
    "All cards you sell this round get +$1 bonus"
]

HIGH_REWARDS = [
    "Gain $2",
    "Gain $3",
    "Adjust any one stock price by ±1 (before selling phase)",
    "All cards you sell this round get +$1 bonus",
    "Take a random resource from another player and give them one of your choice",
    "Buy any stock for $2 discount",
    "Gain the lowest value stock"
]

# Specific reward assignments based on (goal_text, stock_change_text)
REWARD_MAPPING = {
    ("2 Orange", "Blue -2"): ("low", "Peek at top card, choose to put it on top or bottom of deck"),
    ("2 Yellow", "Blue -1, Orange -1"): ("low", "Look at random goal card from another player"),
    ("2 Purple", "Purple +1"): ("low", "Look at random goal card from another player"),
    ("0 Blue", "Purple +1, Yellow +1"): ("medium", "Buy the lowest-priced stock for $1 discount"),
    ("2 Blue", "Orange -1"): ("medium", "Buy the lowest-priced stock for $1 discount"),
    ("2 Purple + 1 Blue", "Orange +2"): ("low", "Gain $1"),
    ("2 Orange + 1 Yellow", "Blue +1, Purple +1"): ("medium", "Gain $1"),
    ("2 Blue + 1 Orange", "Yellow +1, Blue +1"): ("medium", "Gain $1"),
    ("1 Blue + 1 Orange + 1 Yellow", "Purple +2"): ("low", "Gain $1"),
    ("1 Orange + 1 Yellow + 1 Purple", "Blue +1, Yellow +1"): ("low", "Gain $1"),
    ("1 Blue + 1 Yellow + 1 Purple", "Blue +1, Orange -1"): ("medium", "Peek at top 5 cards of the resource deck, and rearrange them in any order"),
    ("0 Yellow", "Purple -2"): ("low", "Swap 1 of your resource cards with the top card of the deck"),
    ("0 Purple", "Orange -1, Yellow -1"): ("medium", "Swap 1 of your resource cards with the top card of the deck"),
    ("0 Orange", "Purple -1, Blue -1"): ("medium", "Steal $1 from another player"),
    ("2 Yellow + 1 Purple", "Orange -1"): ("medium", "Gain $2"),
    ("1 Blue + 1 Orange + 1 Purple", "Yellow -1"): ("high", "Gain $2"),
    ("2 Yellow + 2 Purple", "Orange +2"): ("high", "Take a random resource from another player and give them one of your choice"),
    ("2 Purple + 2 Blue", "Blue +1, Orange -1"): ("high", "Take a random resource from another player and give them one of your choice"),
    ("1 Blue + 1 Orange + 1 Yellow + 1 Purple", "Yellow +1"): ("high", "Buy any stock for $2 discount"),
    ("1 Blue + 1 Orange + 1 Yellow + 1 Purple", "Orange +1"): ("high", "Buy any stock for $2 discount"),
    ("2 Blue + 2 Orange", "Purple -2"): ("high", "Adjust any one stock price by ±1 (before selling phase)"),
    ("2 Orange + 2 Yellow", "Orange +1"): ("high", "Adjust any one stock price by ±1 (before selling phase)"),
    ("3 Yellow", "Blue +1, Purple -1"): ("medium", "All cards you sell this round get +$1 bonus"),
    ("3 Blue", "Purple +1, Yellow -1"): ("high", "Gain the lowest value stock"),
    ("3 Orange", "Blue -2"): ("low", "Gain $3"),
    ("3 Purple", "Yellow -1"): ("high", "Gain $3"),
}


def create_market_manipulation_cards() -> List[Dict]:
    """Create 8 market manipulation cards with no goal requirements.

    These cards are powerful stock manipulation effects:
    - 4 cards with +2/+1 (total +3 each, evenly distributed)
    - 4 cards with -3 (one per color)

    Since they have no goals, the stock changes are their main value.
    """
    cards = []

    # +2/+1 cards - each color gets +2 once and +1 once
    # Pattern: Blue+2/Orange+1, Orange+2/Yellow+1, Yellow+2/Purple+1, Purple+2/Blue+1
    plus_patterns = [
        ("Blue", "Orange"),
        ("Orange", "Yellow"),
        ("Yellow", "Purple"),
        ("Purple", "Blue")
    ]

    for primary, secondary in plus_patterns:
        changes = {primary: 2, secondary: 1}
        cards.append({
            "goal_type": "none",
            "goal_text": "",
            "required_colors": {},
            "difficulty_points": 0,
            "stock_change": {
                "type": "plus_two_plus_one",
                "text": f"{primary} +2, {secondary} +1",
                "changes": changes
            },
            "stock_change_penalty": get_stock_change_penalty(changes),
            "is_market_manipulation": True
        })

    # -3 cards - one per color
    for color in COLORS:
        changes = {color: -3}
        cards.append({
            "goal_type": "none",
            "goal_text": "",
            "required_colors": {},
            "difficulty_points": 0,
            "stock_change": {
                "type": "single_down_triple",
                "text": f"{color} -3",
                "changes": changes
            },
            "stock_change_penalty": get_stock_change_penalty(changes),
            "is_market_manipulation": True
        })

    return cards


def create_goal_cards() -> List[Dict]:
    """Create all 26 base goal cards (without stock changes assigned yet)."""
    cards = []

    # Three of a kind - 4 cards (one per color)
    for color in COLORS:
        cards.append({
            "goal_type": "three_of_a_kind",
            "goal_text": f"3 {color}",
            "required_colors": {color: 3},
            "difficulty_points": 4
        })

    # Pair - 4 cards (one per color)
    for color in COLORS:
        cards.append({
            "goal_type": "pair",
            "goal_text": f"2 {color}",
            "required_colors": {color: 2},
            "difficulty_points": 1
        })

    # Pair + Specific - 4 cards (various combinations)
    pair_specific_combos = [
        ("Blue", "Orange"),
        ("Orange", "Yellow"),
        ("Yellow", "Purple"),
        ("Purple", "Blue")
    ]
    for color1, color2 in pair_specific_combos:
        cards.append({
            "goal_type": "pair_plus_specific",
            "goal_text": f"2 {color1} + 1 {color2}",
            "required_colors": {color1: 2, color2: 1},
            "difficulty_points": 2
        })

    # Three Different - 4 cards (all combinations of 3 colors)
    from itertools import combinations
    for combo in combinations(COLORS, 3):
        cards.append({
            "goal_type": "three_different",
            "goal_text": f"1 {combo[0]} + 1 {combo[1]} + 1 {combo[2]}",
            "required_colors": {combo[0]: 1, combo[1]: 1, combo[2]: 1},
            "difficulty_points": 2
        })

    # None of - 4 cards (one per color)
    for color in COLORS:
        cards.append({
            "goal_type": "none_of",
            "goal_text": f"0 {color}",
            "avoided_color": color,
            "required_colors": {},
            "difficulty_points": 2
        })

    # Two Pair - 4 cards (adjacent color pairs)
    two_pair_combos = [
        ("Blue", "Orange"),
        ("Orange", "Yellow"),
        ("Yellow", "Purple"),
        ("Purple", "Blue")
    ]
    for color1, color2 in two_pair_combos:
        cards.append({
            "goal_type": "two_pair",
            "goal_text": f"2 {color1} + 2 {color2}",
            "required_colors": {color1: 2, color2: 2},
            "difficulty_points": 4
        })

    # One of Every - 2 cards (all 4 colors)
    for _ in range(2):
        cards.append({
            "goal_type": "one_of_every",
            "goal_text": "1 Blue + 1 Orange + 1 Yellow + 1 Purple",
            "required_colors": {color: 1 for color in COLORS},
            "difficulty_points": 3.5
        })

    return cards


def get_stock_change_penalty(changes: Dict[str, int]) -> float:
    """Get the penalty (negative points) based on individual stock changes.

    Formula:
    - +1: -0.75
    - -1: -0.5
    - +2: -1.5
    - -2: -1.0
    - +3: -2.25 (extrapolated)
    - -3: -1.5 (extrapolated)
    """
    total_penalty = 0.0
    for color, change in changes.items():
        if change == 1:
            total_penalty += -0.75
        elif change == -1:
            total_penalty += -0.5
        elif change == 2:
            total_penalty += -1.5
        elif change == -2:
            total_penalty += -1.0
        elif change == 3:
            total_penalty += -2.25
        elif change == -3:
            total_penalty += -1.5
    return total_penalty


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
            "text": f"{colors_chosen[0]} +1, {colors_chosen[1]} +1",
            "changes": {colors_chosen[0]: 1, colors_chosen[1]: 1}
        }
    elif change_type == "double_down":
        colors_chosen = weighted_sample(colors, 2, color_frequency)
        return {
            "type": change_type,
            "text": f"{colors_chosen[0]} -1, {colors_chosen[1]} -1",
            "changes": {colors_chosen[0]: -1, colors_chosen[1]: -1}
        }
    elif change_type == "mixed":
        colors_chosen = weighted_sample(colors, 2, color_frequency)
        return {
            "type": change_type,
            "text": f"{colors_chosen[0]} +1, {colors_chosen[1]} -1",
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


def is_valid_combination(card: Dict, stock_change: Dict) -> bool:
    """Check if a stock change is valid for a goal card (anti-synergy rules)."""
    required_colors = set(card.get("required_colors", {}).keys())
    avoided_color = card.get("avoided_color")
    changes = stock_change["changes"]

    # Rule 2: Don't penalize what you're collecting
    for color in required_colors:
        if color in changes and changes[color] < 0:
            return False

    # Rule 1: Don't strongly boost (+2) what you're collecting
    for color in required_colors:
        if color in changes and changes[color] == 2:
            return False

    # For "None of" goals
    if avoided_color:
        # Rule 3: Don't penalize what you're avoiding
        if avoided_color in changes and changes[avoided_color] < 0:
            return False

        # Rule 4: Don't strongly boost (+2) what you're avoiding
        if avoided_color in changes and changes[avoided_color] == 2:
            return False

    return True


def assign_stock_changes(cards: List[Dict], seed: int = None) -> List[Dict]:
    """Assign stock changes to cards following all rules and distribution requirements."""
    if seed is not None:
        random.seed(seed)

    max_attempts = 5000
    for attempt in range(max_attempts):
        # We need: 4 types × 4 + 2 types × 5 = 26
        # single_down and double_down get 5 (to balance the positive bias from one_of_every)
        # single_up and double_up get 4 each (still enough for 2 one_of_every cards)
        # Other 3 types get 4 each
        stock_change_counts = {change: 4 for change in STOCK_CHANGES}
        stock_change_counts["single_down"] = 5
        stock_change_counts["double_down"] = 5

        # Separate constrained and unconstrained cards
        # one_of_every cards can only use single_up or double_up
        constrained_cards = [c for c in cards if c.get("goal_type") == "one_of_every"]
        unconstrained_cards = [c for c in cards if c.get("goal_type") != "one_of_every"]
        random.shuffle(unconstrained_cards)

        # Track how many of each type we've used
        used_counts = {change: 0 for change in STOCK_CHANGES}

        # Track current net changes
        current_net = {color: 0 for color in COLORS}

        # Track color frequency (how many times each color appears)
        color_frequency = Counter({color: 0 for color in COLORS})

        # Assign stock changes
        assigned_cards = []

        # Assign constrained cards FIRST
        for card in constrained_cards:
            # one_of_every can only use single_up or double_up
            valid_attempts = []
            for change_type in ["single_up", "double_up"]:
                if used_counts[change_type] >= stock_change_counts[change_type]:
                    continue

                for _ in range(50):
                    stock_change = generate_stock_change(change_type, COLORS, color_frequency)
                    if is_valid_combination(card, stock_change):
                        valid_attempts.append((change_type, stock_change))

            if valid_attempts:
                # Score each option by how much it helps balance (both net and frequency)
                def combined_score(stock_change):
                    # Net balance score (lower is better)
                    net_score = 0
                    for color, change in stock_change["changes"].items():
                        new_value = current_net[color] + change
                        net_score += abs(new_value)

                    # Frequency balance score (lower is better)
                    # Simulate adding this stock change and calculate frequency imbalance
                    simulated_freq = color_frequency.copy()
                    for color in COLORS:
                        if color in stock_change["text"]:
                            simulated_freq[color] += 1

                    if simulated_freq:
                        max_freq = max(simulated_freq.values())
                        min_freq = min(simulated_freq.values())
                        freq_score = (max_freq - min_freq) * 10  # Weight frequency balance highly
                    else:
                        freq_score = 0

                    return net_score + freq_score

                valid_attempts.sort(key=lambda x: combined_score(x[1]))
                top_choices = max(1, len(valid_attempts) // 3)
                change_type, stock_change = random.choice(valid_attempts[:top_choices])

                used_counts[change_type] += 1
                for color, change in stock_change["changes"].items():
                    current_net[color] += change

                # Update color frequency
                for color in COLORS:
                    if color in stock_change["text"]:
                        color_frequency[color] += 1

                complete_card = card.copy()
                complete_card["stock_change"] = stock_change
                complete_card["stock_change_penalty"] = get_stock_change_penalty(stock_change["changes"])
                assigned_cards.append(complete_card)

        # Now assign unconstrained cards
        for card in unconstrained_cards:
            # Find valid stock change types for this card
            valid_attempts = []

            # Try each stock change type that still has quota
            for change_type in STOCK_CHANGES:
                if used_counts[change_type] >= stock_change_counts[change_type]:
                    continue

                # Try to generate a valid stock change of this type multiple times
                max_color_attempts = 50
                for _ in range(max_color_attempts):
                    stock_change = generate_stock_change(change_type, COLORS, color_frequency)
                    if is_valid_combination(card, stock_change):
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
                # Score each option by how much it helps balance (both net and frequency)
                def combined_score(stock_change):
                    # Net balance score (lower is better)
                    net_score = 0
                    for color, change in stock_change["changes"].items():
                        # Prefer changes that move towards 0
                        new_value = current_net[color] + change
                        old_distance = abs(current_net[color])
                        new_distance = abs(new_value)
                        # Lower score is better (closer to balanced)
                        net_score += new_distance

                    # Frequency balance score (lower is better)
                    # Simulate adding this stock change and calculate frequency imbalance
                    simulated_freq = color_frequency.copy()
                    for color in COLORS:
                        if color in stock_change["text"]:
                            simulated_freq[color] += 1

                    if simulated_freq:
                        max_freq = max(simulated_freq.values())
                        min_freq = min(simulated_freq.values())
                        freq_score = (max_freq - min_freq) * 10  # Weight frequency balance highly
                    else:
                        freq_score = 0

                    return net_score + freq_score

                # Sort by balance score and pick from the best options
                valid_attempts.sort(key=lambda x: combined_score(x[1]))
                # Pick from top 30% to maintain some randomness
                top_choices = max(1, len(valid_attempts) // 3)
                change_type, stock_change = random.choice(valid_attempts[:top_choices])

                used_counts[change_type] += 1

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
                complete_card["stock_change_penalty"] = get_stock_change_penalty(stock_change["changes"])
                assigned_cards.append(complete_card)

        # Check if balanced (both net balance AND color frequency balance)
        if validate_balance(assigned_cards) and validate_color_frequency_balance(assigned_cards):
            return assigned_cards

    # If we couldn't achieve balance, return the best attempt
    print(f"Warning: Could not achieve perfect balance after {max_attempts} attempts", file=__import__('sys').stderr)
    print(f"Final net changes: {calculate_net_changes(assigned_cards)}", file=__import__('sys').stderr)
    color_freq = calculate_color_frequency(assigned_cards)
    print(f"Final color frequency: {color_freq}", file=__import__('sys').stderr)
    if color_freq:
        freq_range = max(color_freq.values()) - min(color_freq.values())
        print(f"Color frequency range: {freq_range}", file=__import__('sys').stderr)
    return assigned_cards


def calculate_scores_and_assign_rewards(cards: List[Dict]) -> List[Dict]:
    """Calculate scores and assign rewards to cards using the mapping."""
    # Calculate scores and assign rewards from mapping
    for card in cards:
        card["score"] = card["difficulty_points"] + card["stock_change_penalty"]

        # Look up reward in mapping
        key = (card["goal_text"], card["stock_change"]["text"])
        if key in REWARD_MAPPING:
            tier, reward = REWARD_MAPPING[key]
            card["reward_tier"] = tier
            card["reward"] = reward
        else:
            # Fallback to random assignment based on score
            print(f"Warning: No mapping for {key}", file=__import__('sys').stderr)
            card["reward_tier"] = "medium"
            card["reward"] = random.choice(MEDIUM_REWARDS)

    # Sort by score (ascending - lowest scores get lowest rewards)
    cards_sorted = sorted(cards, key=lambda x: x["score"])

    return cards_sorted


def parse_reward(reward_text: str, reward_tier: str) -> Dict:
    """Parse reward text to determine type and requirements."""
    reward_lower = reward_text.lower()

    # Determine reward value from tier
    tier_values = {"low": 1, "medium": 2, "high": 3}
    value = tier_values.get(reward_tier, 1)

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

    # Adjust stock
    if "adjust" in reward_lower and "stock" in reward_lower:
        return {
            "type": "adjust_stock",
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Look at hand
    if "look at" in reward_lower and "hand" in reward_lower:
        return {
            "type": "look_at_hand",
            "requiresTarget": True,
            "requiresChoice": False,
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

    # Peek and place
    if "peek at top card" in reward_lower:
        return {
            "type": "peek_and_place",
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Swap with deck
    if "swap" in reward_lower and "deck" in reward_lower:
        return {
            "type": "swap_with_deck",
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Rearrange top 5
    if "peek at top 5" in reward_lower or "rearrange" in reward_lower:
        return {
            "type": "rearrange_top_5",
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Take and give card
    if "take" in reward_lower and "give" in reward_lower:
        return {
            "type": "take_and_give_card",
            "requiresTarget": True,
            "requiresChoice": True,
            "multiStep": True,
            "value": value
        }

    # Buy with discount
    if "buy" in reward_lower and "discount" in reward_lower:
        import re
        discount_match = re.search(r'\$(\d+)\s+discount', reward_text)
        discount = int(discount_match.group(1)) if discount_match else 1
        return {
            "type": "buy_with_discount",
            "discount": discount,
            "requiresTarget": False,
            "requiresChoice": True,
            "value": value
        }

    # Sell bonus
    if "cards you sell" in reward_lower and "bonus" in reward_lower:
        import re
        bonus_match = re.search(r'\+\$(\d+)', reward_text)
        bonus = int(bonus_match.group(1)) if bonus_match else 1
        return {
            "type": "sell_bonus",
            "bonus": bonus,
            "requiresTarget": False,
            "requiresChoice": False,
            "value": value
        }

    # Gain lowest stock
    if "gain" in reward_lower and "lowest" in reward_lower:
        return {
            "type": "gain_lowest_stock",
            "requiresTarget": False,
            "requiresChoice": False,
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
    # Check if this is a market manipulation card (no goal)
    is_market_manipulation = card.get("is_market_manipulation", False)

    if is_market_manipulation:
        penalty = card.get("stock_change_penalty", 0)
        difficulty = card.get("difficulty_points", 0)
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
                "difficultyPoints": difficulty,
                "stockChangePenalty": penalty,
                "score": difficulty + penalty,
                "isMarketManipulation": True
            }
        }

    # Parse goal (handle none_of specially)
    goal_parsed = {
        "type": card["goal_type"],
        "requirements": card.get("required_colors", {})
    }

    if card.get("avoided_color"):
        goal_parsed["avoidColor"] = card["avoided_color"]

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
            "difficultyPoints": card["difficulty_points"],
            "stockChangePenalty": card["stock_change_penalty"],
            "score": card["score"]
        }
    }


def main():
    """Generate and output 34 goal cards (26 standard + 8 market manipulation)."""
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
