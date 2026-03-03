#!/usr/bin/env python3
"""
Generate an HTML page to visualize goal cards for printing.
"""

import json
import sys

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Goal Cards</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Arial', sans-serif;
            background: #f0f0f0;
            padding: 20px;
        }}

        .cards-container {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 40px;
            max-width: 1400px;
            margin: 0 auto;
        }}

        .card {{
            background: white;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 20px;
            page-break-inside: avoid;
            aspect-ratio: 2.5 / 3.5;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }}

        .stock-change {{
            font-size: 22px;
            font-weight: bold;
            color: #2c3e50;
            text-align: center;
            padding: 20px;
            border-bottom: 1px solid #ddd;
            margin-bottom: 15px;
        }}

        .goal {{
            font-size: 24px;
            color: #34495e;
            text-align: center;
            font-weight: 600;
            padding: 15px 0;
            flex-grow: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
        }}

        .card-symbol {{
            width: 48px;
            height: 66px;
            border-radius: 6px;
            border: 2px solid;
            display: inline-block;
            position: relative;
        }}

        .card-symbol.blue {{
            background-color: #3498db;
            border-color: #2980b9;
        }}

        .card-symbol.red {{
            background-color: #e74c3c;
            border-color: #c0392b;
        }}

        .card-symbol.yellow {{
            background-color: #f1c40f;
            border-color: #f39c12;
        }}

        .card-symbol.black {{
            background-color: #2c3e50;
            border-color: #1a252f;
        }}

        .reward {{
            font-size: 18px;
            color: #555;
            background: #f8f9fa;
            padding: 12px;
            border-radius: 4px;
            text-align: center;
            border-top: 1px solid #ddd;
            margin-top: 15px;
        }}

        @media print {{
            @page {{
                size: portrait;
                margin: 0.3in;
            }}

            body {{
                background: white;
                margin: 0;
                padding: 0;
            }}

            .cards-container {{
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 24px;
                width: 100%;
                max-width: none;
            }}

            .card {{
                width: 100%;
                box-shadow: none;
                page-break-inside: avoid;
                padding: 12px;
                aspect-ratio: 2.2 / 2.85;
            }}

            .stock-change {{
                font-size: 18px;
                padding: 12px;
                margin-bottom: 8px;
            }}

            .goal {{
                font-size: 20px;
                padding: 8px 0;
            }}

            .reward {{
                font-size: 14px;
                padding: 8px;
                margin-top: 8px;
            }}

            .card-symbol {{
                width: 38px;
                height: 52px;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }}

        }}

        /* Color coding for stock colors */
        .color-blue {{ color: #3498db; font-weight: bold; }}
        .color-red {{ color: #e74c3c; font-weight: bold; }}
        .color-yellow {{ color: #f1c40f; font-weight: bold; }}
        .color-black {{ color: #2c3e50; font-weight: bold; }}

        /* Market manipulation cards */
        .card.market-manipulation {{
            background: white;
            border-color: #333;
        }}

        .card.market-manipulation .stock-change {{
            color: #2c3e50;
            border-bottom-color: #ddd;
        }}

        .card.market-manipulation .stock-change.large {{
            font-size: 22px;
            padding: 20px;
        }}

        .card.market-manipulation .goal.market-label {{
            color: #34495e;
            font-size: 16px;
            font-style: italic;
        }}

        .card.market-manipulation .reward {{
            background: #f8f9fa;
            color: #555;
            border-top-color: #ddd;
        }}
    </style>
</head>
<body>
    <div class="cards-container">
        {cards}
    </div>
</body>
</html>
"""

CARD_TEMPLATE = """
        <div class="card">
            <div class="stock-change">{stock_change}</div>
            <div class="goal">{goal}</div>
            <div class="reward">{reward}</div>
        </div>
"""

MARKET_MANIPULATION_CARD_TEMPLATE = """
        <div class="card market-manipulation">
            <div class="stock-change large">{stock_change}</div>
            <div class="goal market-label">Market Manipulation</div>
            <div class="reward">No goal - play for stock effect only</div>
        </div>
"""


def colorize_text(text):
    """Add color classes to color names in text."""
    colors = {
        'Blue': 'blue',
        'Red': 'red',
        'Yellow': 'yellow',
        'Black': 'black'
    }

    for color_name, color_class in colors.items():
        text = text.replace(color_name, f'<span class="color-{color_class}">{color_name}</span>')

    return text


def goal_to_symbols(goal_text):
    """Convert goal text to visual card symbols."""
    import re

    # Parse the goal text to extract colors and counts
    # Examples: "2 Blue", "2 Blue + 1 Red", "1 Blue + 1 Red + 1 Yellow"
    symbols_html = []

    # Split by + and process each part
    parts = goal_text.split(' + ')

    for part in parts:
        # Extract number and color
        match = re.match(r'(\d+)\s+(\w+)', part.strip())
        if match:
            count = int(match.group(1))
            color = match.group(2).lower()

            # Add that many card symbols
            for _ in range(count):
                symbols_html.append(f'<div class="card-symbol {color}"></div>')

    return ''.join(symbols_html)


def generate_html(cards_data):
    """Generate HTML from card data."""
    cards_html = []

    for card in cards_data:
        # Check if this is a market manipulation card (no goal)
        if card.get('goal') is None:
            card_html = MARKET_MANIPULATION_CARD_TEMPLATE.format(
                stock_change=colorize_text(card['stockChange']['text'])
            )
        else:
            card_html = CARD_TEMPLATE.format(
                stock_change=colorize_text(card['stockChange']['text']),
                goal=goal_to_symbols(card['goal']['text']),
                reward=card['reward']['text']
            )
        cards_html.append(card_html)

    html = HTML_TEMPLATE.format(
        cards=''.join(cards_html)
    )

    return html


def main():
    # Read JSON file
    json_file = sys.argv[1] if len(sys.argv) > 1 else 'goal_cards.json'

    try:
        with open(json_file, 'r') as f:
            cards_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: {json_file} not found", file=sys.stderr)
        sys.exit(1)

    # Generate HTML
    html = generate_html(cards_data)

    # Write to file
    output_file = 'goal_cards.html'
    with open(output_file, 'w') as f:
        f.write(html)

    print(f"HTML generated: {output_file}", file=sys.stderr)
    print(f"Total cards: {len(cards_data)}", file=sys.stderr)


if __name__ == "__main__":
    main()
