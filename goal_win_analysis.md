# Goal → Win Correlation

Production-bot self-play: **5000 games** at **4 players** (0 stuck/excluded), seeds 1000..5999. Ran in 6.6s.

- **Baseline win rate per player:** 25.2% (≈ 1/4, slightly higher due to ties).
- **Avg goals claimed:** winners **2.18** vs losers **1.08** — winners claim more overall, which is why the raw `winnerClaims` tally is biased toward *easy* goals.

**Columns**
- `winnerClaims` — times an eventual winner claimed this goal (the raw tally you asked for).
- `claims` — times claimed by anyone; `inPlay` — games the goal was dealt.
- `claim%` = claims ÷ inPlay — how often it gets grabbed when available.
- `win%|claim` = winnerClaims ÷ claims — of the times it was claimed, how often the claimer won. **This de-biases the raw tally.**
- `lift` = (win%|claim) ÷ baseline — >1.0 means claiming it beats an average position. Compare **within a tier** (across tiers, difficulty dominates).

## Pair (easy)

| Requirement | Reward | winnerClaims | claims | inPlay | claim% | win%\|claim | lift |
|---|---|---:|---:|---:|---:|---:|---:|
| 2 Rail | Set any one stock to exactly $6 | 897 | 2594 | 2452 | 106% | 34.6% | 1.37 |
| 2 Oil | Adjust any one stock by +/-3 | 860 | 2520 | 2411 | 105% | 34.1% | 1.35 |
| 2 Steel | Gain $4 | 871 | 2601 | 2469 | 105% | 33.5% | 1.33 |
| 2 Bank | Look at the top 2 Insider Tips; you may put one on the bottom of the deck | 691 | 2452 | 2261 | 108% | 28.2% | 1.12 |

## Three of a Kind (hard)

| Requirement | Reward | winnerClaims | claims | inPlay | claim% | win%\|claim | lift |
|---|---|---:|---:|---:|---:|---:|---:|
| 3 Rail | Gain $8 | 642 | 1386 | 2256 | 61% | 46.3% | 1.84 |
| 3 Oil | Sell all your stocks; gain +$3 per stock sold | 677 | 1518 | 2255 | 67% | 44.6% | 1.77 |
| 3 Steel | Steal $2 from each other player | 542 | 1247 | 2266 | 55% | 43.5% | 1.72 |
| 3 Bank | Swap one of your cards with a face-up market card | 554 | 1312 | 2200 | 60% | 42.2% | 1.67 |

## Two Pair (hard)

| Requirement | Reward | winnerClaims | claims | inPlay | claim% | win%\|claim | lift |
|---|---|---:|---:|---:|---:|---:|---:|
| 2 Oil + 2 Bank | Draw 3 cards from the main deck, keep 1 | 668 | 1258 | 2271 | 55% | 53.1% | 2.11 |
| 2 Steel + 2 Oil | Gain $9 | 677 | 1344 | 2161 | 62% | 50.4% | 2.00 |
| 2 Rail + 2 Bank | At the end of the game, gain $11 | 731 | 1542 | 2200 | 70% | 47.4% | 1.88 |
| 2 Oil + 2 Rail | Draw the top Insider Tip from the deck into your hand and gain $7 | 629 | 1330 | 2262 | 59% | 47.3% | 1.88 |
| 2 Steel + 2 Bank | Adjust any one stock by +4 and another stock by -4 | 430 | 1132 | 2118 | 53% | 38.0% | 1.51 |
| 2 Steel + 2 Rail | Draw 2 unused Insider Tips into your hand | 451 | 1250 | 2144 | 58% | 36.1% | 1.43 |
