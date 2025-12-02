#!/usr/bin/env python3
"""
Generate goal cards for the Stock Trading Board Game.
Outputs 20 cards in JSON format following all anti-synergy rules.
"""

import json
import random
from typing import List, Dict, Set, Tuple

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
    "Look at another player's hand (see all their resource cards)"
]

MEDIUM_REWARDS = [
    "Gain $2",
    "Swap 1 of your resource cards with the top card of the deck",
    "Buy the lowest-priced stock for $1 discount",
    "Steal $1 from another player",
    "Peek at top 5 cards of the resource deck, and rearrange them in any order"
]

HIGH_REWARDS = [
    "Gain $3",
    "Adjust any one stock price by ±1 (before selling phase)",
    "All cards you sell this round get +$1 bonus",
    "Take a random resource from another player and give them one of your choice",
    "Buy any stock for $2 discount",
    "Gain the lowest value stock"
]


def create_goal_cards() -> List[Dict]:
    """Create all 26 base goal cards (without stock changes assigned yet)."""
    cards = []

    # Three of a kind - 4 cards (one per color)
    for color in COLORS:
        cards.append({
            "goal_type": "three_of_a_kind",
            "goal_text": f"3 {color}",
            "required_colors": {color: 3},
            "difficulty_points": 3
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
            "difficulty_points": 4
        })

    return cards


def get_stock_change_penalty(change_type: str) -> int:
    """Get the penalty (negative points) for a stock change type."""
    penalties = {
        "single_up": 0,
        "single_down": 0,
        "single_up_twice": -2,
        "single_down_twice": -2,
        "double_up": -1,
        "double_down": -1,
        "mixed": -1
    }
    return penalties[change_type]


def generate_stock_change(change_type: str, colors: List[str]) -> Dict:
    """Generate a stock change specification of the given type."""
    if change_type == "single_up":
        color = random.choice(colors)
        return {
            "type": change_type,
            "text": f"{color} +1",
            "changes": {color: 1}
        }
    elif change_type == "single_down":
        color = random.choice(colors)
        return {
            "type": change_type,
            "text": f"{color} -1",
            "changes": {color: -1}
        }
    elif change_type == "single_up_twice":
        color = random.choice(colors)
        return {
            "type": change_type,
            "text": f"{color} +2",
            "changes": {color: 2}
        }
    elif change_type == "single_down_twice":
        color = random.choice(colors)
        return {
            "type": change_type,
            "text": f"{color} -2",
            "changes": {color: -2}
        }
    elif change_type == "double_up":
        colors_chosen = random.sample(colors, 2)
        return {
            "type": change_type,
            "text": f"{colors_chosen[0]} +1, {colors_chosen[1]} +1",
            "changes": {colors_chosen[0]: 1, colors_chosen[1]: 1}
        }
    elif change_type == "double_down":
        colors_chosen = random.sample(colors, 2)
        return {
            "type": change_type,
            "text": f"{colors_chosen[0]} -1, {colors_chosen[1]} -1",
            "changes": {colors_chosen[0]: -1, colors_chosen[1]: -1}
        }
    elif change_type == "mixed":
        colors_chosen = random.sample(colors, 2)
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
                    stock_change = generate_stock_change(change_type, COLORS)
                    if is_valid_combination(card, stock_change):
                        valid_attempts.append((change_type, stock_change))

            if valid_attempts:
                # Score each option by how much it helps balance
                def balance_score(stock_change):
                    score = 0
                    for color, change in stock_change["changes"].items():
                        new_value = current_net[color] + change
                        score += abs(new_value)
                    return score

                valid_attempts.sort(key=lambda x: balance_score(x[1]))
                top_choices = max(1, len(valid_attempts) // 3)
                change_type, stock_change = random.choice(valid_attempts[:top_choices])

                used_counts[change_type] += 1
                for color, change in stock_change["changes"].items():
                    current_net[color] += change

                complete_card = card.copy()
                complete_card["stock_change"] = stock_change
                complete_card["stock_change_penalty"] = get_stock_change_penalty(change_type)
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
                    stock_change = generate_stock_change(change_type, COLORS)
                    if is_valid_combination(card, stock_change):
                        valid_attempts.append((change_type, stock_change))

            if not valid_attempts:
                # Fallback: try any remaining type
                for change_type in STOCK_CHANGES:
                    if used_counts[change_type] >= stock_change_counts[change_type]:
                        continue
                    for _ in range(20):
                        stock_change = generate_stock_change(change_type, COLORS)
                        if is_valid_combination(card, stock_change):
                            valid_attempts.append((change_type, stock_change))
                            break
                    if valid_attempts:
                        break

            if valid_attempts:
                # Score each option by how much it helps balance
                def balance_score(stock_change):
                    score = 0
                    for color, change in stock_change["changes"].items():
                        # Prefer changes that move towards 0
                        new_value = current_net[color] + change
                        old_distance = abs(current_net[color])
                        new_distance = abs(new_value)
                        # Lower score is better (closer to balanced)
                        score += new_distance
                    return score

                # Sort by balance score and pick from the best options
                valid_attempts.sort(key=lambda x: balance_score(x[1]))
                # Pick from top 30% to maintain some randomness
                top_choices = max(1, len(valid_attempts) // 3)
                change_type, stock_change = random.choice(valid_attempts[:top_choices])

                used_counts[change_type] += 1

                # Update current net
                for color, change in stock_change["changes"].items():
                    current_net[color] += change

                # Create the complete card
                complete_card = card.copy()
                complete_card["stock_change"] = stock_change
                complete_card["stock_change_penalty"] = get_stock_change_penalty(change_type)
                assigned_cards.append(complete_card)

        # Check if balanced
        if validate_balance(assigned_cards):
            return assigned_cards

    # If we couldn't achieve balance, return the best attempt
    print(f"Warning: Could not achieve perfect balance after {max_attempts} attempts", file=__import__('sys').stderr)
    print(f"Final net changes: {calculate_net_changes(assigned_cards)}", file=__import__('sys').stderr)
    return assigned_cards


def calculate_scores_and_assign_rewards(cards: List[Dict]) -> List[Dict]:
    """Calculate scores and assign rewards to cards."""
    # Calculate scores
    for card in cards:
        card["score"] = card["difficulty_points"] + card["stock_change_penalty"]

    # Sort by score (ascending - lowest scores get lowest rewards)
    cards_sorted = sorted(cards, key=lambda x: x["score"])

    # Split into thirds
    total = len(cards_sorted)
    low_end = total // 3
    medium_end = 2 * total // 3

    # Assign rewards
    for i, card in enumerate(cards_sorted):
        if i < low_end:
            card["reward_tier"] = "low"
            card["reward"] = random.choice(LOW_REWARDS)
        elif i < medium_end:
            card["reward_tier"] = "medium"
            card["reward"] = random.choice(MEDIUM_REWARDS)
        else:
            card["reward_tier"] = "high"
            card["reward"] = random.choice(HIGH_REWARDS)

    return cards_sorted


def create_final_card_format(card: Dict) -> Dict:
    """Format card for final JSON output."""
    return {
        "stock_change": card["stock_change"]["text"],
        "goal": card["goal_text"],
        "reward": card["reward"],
        "metadata": {
            "goal_type": card["goal_type"],
            "difficulty_points": card["difficulty_points"],
            "stock_change_penalty": card["stock_change_penalty"],
            "score": card["score"],
            "reward_tier": card["reward_tier"]
        }
    }


def main():
    """Generate and output 26 goal cards."""
    # Create base cards
    cards = create_goal_cards()

    # Assign stock changes
    cards = assign_stock_changes(cards, seed=42)

    # Calculate scores and assign rewards
    cards = calculate_scores_and_assign_rewards(cards)

    # Format for output
    final_cards = [create_final_card_format(card) for card in cards]

    # Output JSON
    print(json.dumps(final_cards, indent=2))

    # Print statistics
    print("\n# Statistics:", file=__import__('sys').stderr)
    print(f"Total cards: {len(final_cards)}", file=__import__('sys').stderr)

    # Count by reward tier
    tiers = {}
    for card in final_cards:
        tier = card["metadata"]["reward_tier"]
        tiers[tier] = tiers.get(tier, 0) + 1
    print(f"Reward distribution: {tiers}", file=__import__('sys').stderr)

    # Count by goal type
    goal_types = {}
    for card in final_cards:
        gt = card["metadata"]["goal_type"]
        goal_types[gt] = goal_types.get(gt, 0) + 1
    print(f"Goal type distribution: {goal_types}", file=__import__('sys').stderr)

    # Validate and display balance
    net_changes = calculate_net_changes(cards)
    is_balanced = validate_balance(cards)
    print(f"\n# Balance Validation:", file=__import__('sys').stderr)
    print(f"Net changes by color: {net_changes}", file=__import__('sys').stderr)
    print(f"Balanced (all colors net to 0): {is_balanced}", file=__import__('sys').stderr)


if __name__ == "__main__":
    main()
