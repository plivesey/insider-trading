# Game 2 Analysis

## Final Results
| Player | Cash | Stocks | Stock Value | Total Wealth | Place |
|--------|------|--------|-------------|-------------|-------|
| Morgan | $2 | 3 Yellow, 2 Purple | $18 + $10 | **$30** | 1st |
| Rockefeller | $0 | 4 Orange | $24 | **$24** | 2nd |
| Vanderbilt | $2 | 3 Purple | $15 | **$17** | 3rd |

## Final Prices
Blue $7, Orange $6, Yellow $6, Purple $5

## Game Duration
35 turns, tracker 10/10 (threshold 10). Game ended via crisis card after stalemate.

## Key Findings

### 1. Stalemate Problem (DESIGN ISSUE)
The game got stuck at tracker 9/10 from T30-T35. All three players passed repeatedly because:
- Rockefeller's insider tip (Yellow +2/Purple -1) would help Morgan more than himself
- Auctioning would draw a crisis card from the deck, ending the game
- Selling was wealth-neutral
- No one could claim goals or play action cards

**This is a significant design problem.** In a real game, social dynamics might break the stalemate, but the rules have no forced-progress mechanism. Consider adding a rule like "if all players pass in a round, the game ends immediately" or "passing is not a valid action — you must take one of the 5 actions."

### 2. Morgan's Winning Strategy: Yellow Monopoly + Goal Racing
Morgan built a Yellow monopoly (3 cards) and claimed both Yellow goals:
- T11: Claimed 2 Yellow (set Orange to $5, hurting Rockefeller)
- T29: Claimed 3 Yellow (drew Purple blank, +$6 wealth)

Both goals advanced the tracker and gave valuable rewards. The 3 Yellow reward (draw 1 card) was perfectly timed — she drew a Purple blank for $5-6 extra wealth right before endgame.

### 3. Bidding Was Much More Aggressive (vs Game 1)
| Card | Game 1 Price | Game 2 Price |
|------|-------------|-------------|
| First stock | $3-4 | $7 (Orange hype) |
| Purple hype | $4 | $11 |
| Blue insider | $5 | $11 |
| Action cards | $3-6 | $4 (Hostile Takeover), $4 (Rumor Mill) |

The updated bidding strategy prompts worked — players valued stocks closer to market price and bid aggressively. However, Vanderbilt overpaid for Purple hype ($11) and Purple blank ($11), spending $22 of his $25 on just 2 cards.

### 4. Insider Tip Plays
| Turn | Player | Card | Effect | Strategic Value |
|------|--------|------|--------|----------------|
| T4 | Rockefeller | Blue +2/Orange +1 | Blue→$7, Orange→$7 | Boosted own Orange |
| T12 | Vanderbilt | Purple +2/Blue +1 | Purple→$7, Blue→$8 | Boosted own Purple |
| T13 | Rockefeller | Orange +2/Yellow +1 | Orange→$7, Yellow→$6 | Recovered Orange after Morgan's set-to-$5 |
| T14 | Morgan | Purple -3 | Purple→$4 | Attacked Vanderbilt's 2 Purple (-$6) |
| T15 | Vanderbilt | Yellow -2/Purple +1 | Yellow→$4, Purple→$5 | Retaliated vs Morgan, recovered Purple |
| T20 | Morgan | Yellow +2/Purple +1 | Yellow→$7, Purple→$6 | Boosted own 3 Yellow (+$9!) |

Morgan's T20 play was devastating: Yellow +2/Purple +1 on 3 Yellow stocks = +$6 direct benefit while also boosting her Purple. Rockefeller's final tip (Yellow +2/Purple -1) was never played — it became a stranded asset because playing it would help Morgan more than Rockefeller.

### 5. Hostile Takeover Impact
T19: Rockefeller used Hostile Takeover to steal Morgan's Yellow blank. Morgan received $5 compensation.
- Value stolen: $5 (Yellow at $5 at the time)
- Compensation: $5
- Net: Zero cash impact, but denied Morgan a Yellow card

This was a pivotal play — it temporarily prevented Morgan from claiming 3 Yellow. But Morgan re-acquired Yellow cards through auctions (T17, T26) and recovered.

### 6. Card Values (approximate)

| Card | Acquirer | Cost | Value Generated | Net |
|------|----------|------|----------------|-----|
| Orange hype (stock-15) | Rockefeller | $7 | $6 (final value) + $1 hype = $7 | $0 |
| Purple hype (stock-31) | Vanderbilt | $11 | $5 (final) + $1 hype = $6 | **-$5** |
| Blue insider (stock-8) | Rockefeller | $11 | $7 (sold) + tip drawn = ~$8-10 | **-$1 to -$3** |
| Yellow blank (stock-18) | Morgan→Rockefeller | $6→stolen | $7 (sold by Rock) | varies |
| Purple blank (stock-28) | Vanderbilt | $11 | $5 (final) | **-$6** |
| Yellow stock_down (stock-22) | Morgan | $9 | $6 (final) + goals | **+goals** |
| Orange blank (stock-9) | Rockefeller | $9 | $6 (final) | **-$3** |
| Orange blank (stock-12) | Rockefeller | $4 | $6 (final) | **+$2** |
| Yellow blank (stock-19) | Morgan | $1 | $6 (final) + goals | **+$5+goals** |
| Purple stock_up (stock-29) | Morgan | $5 | $5 (final) + $1 stock_up | **+$1** |
| Yellow insider (stock-24) | Morgan | $7 | $6 (final) + goals | **-$1+goals** |
| Hostile Takeover (action-41) | Rockefeller | $4 | Stole $5 card, delayed Morgan | **+$1** |
| Rumor Mill (action-42) | Vanderbilt | $4 | Dropped all stocks -1 | **-$7 net** |
| Purple blank (stock-26) | Vanderbilt | $2 | $5 (final) | **+$3** |
| Orange blank (stock-10) | Rockefeller | $3 | $6 (final) | **+$3** |

### 7. Vanderbilt's Mistakes
- Overpaid massively for Purple hype ($11) and Purple blank ($11) — total $22 for $11 final value
- Rumor Mill -1 was a desperation play that hurt himself ($-3) more than it closed the gap
- Never recovered from the early spending spree

## Comparison: Game 1 vs Game 2

| Metric | Game 1 | Game 2 |
|--------|--------|--------|
| Winner | Morgan ($53) | Morgan ($30) |
| 2nd Place | Rockefeller ($32) | Rockefeller ($24) |
| 3rd Place | Vanderbilt ($27) | Vanderbilt ($17) |
| Turns | 24 | 35 |
| Average bid | ~$4 | ~$6 |
| Stalemate? | No | Yes (T30-T35) |
| Goals claimed | 2 | 3 (incl. both games) |
| Insider tips played | 5 | 6 |

Morgan won both games. In Game 2, the winning margin was smaller ($6 gap vs $21 gap in Game 1), and bidding was more competitive.

## Design Recommendations

### 1. Fix the Stalemate (HIGH PRIORITY)
Add a rule: "If all players pass consecutively in a single round, the game ends immediately." This prevents infinite loops while still allowing strategic passing.

### 2. Consider "Must Act" Rule
Alternative to above: Remove pass as an option. Players must auction, sell, play a tip, claim a goal, or play an action card. This forces the game forward.

### 3. Insider Tip Dead Card Problem
Rockefeller's final insider tip became unusable because it benefited his opponent more than himself. This is actually interesting strategic depth — holding a tip too long can strand it. No fix needed, but worth noting.

### 4. Price Floor Concern
After Rumor Mill -1, Purple dropped to $5 (from starting $5). With 3 Purple stocks, Vanderbilt's entire portfolio was worth only $15. The $0-$10 price range might be too narrow, making manipulation very swingy.

### 5. Goal Card Snowball
Morgan claimed 2 goals, each giving rewards that strengthened her lead. The 2 Yellow goal let her SET Orange to $5 (hurting Rockefeller), and the 3 Yellow goal drew a free Purple stock. Goals create a "rich get richer" dynamic — the player who can claim goals first gets both the reward AND the tracker advantage. This might be intentional tension, but worth monitoring.
