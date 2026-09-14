# Goal → Win Correlation

Production-bot self-play: **5000 games** at **4 players** (0 stuck/excluded), seeds 1000..5999. Ran in 5.6s.

- **Baseline win rate per player:** 25.3% (≈ 1/4, slightly higher due to ties).
- **Avg goals claimed:** winners **1.89** vs losers **0.90** — winners claim more overall, which is why the raw `winnerClaims` tally is biased toward *easy* goals.

**Columns**
- `winnerClaims` — times an eventual winner claimed this goal (the raw tally you asked for).
- `claims` — times claimed by anyone; `inPlay` — games the goal was dealt.
- `claim%` = claims ÷ inPlay — how often it gets grabbed when available.
- `win%|claim` = winnerClaims ÷ claims — of the times it was claimed, how often the claimer won. **This de-biases the raw tally.**
- `lift` = (win%|claim) ÷ baseline — >1.0 means claiming it beats an average position. Compare **within a tier** (across tiers, difficulty dominates).

## Pair (easy)

| Requirement | Reward | winnerClaims | claims | inPlay | claim% | win%\|claim | lift |
|---|---|---:|---:|---:|---:|---:|---:|
| 2 Steel | Gain $4 | 868 | 2390 | 2450 | 98% | 36.3% | 1.44 |
| 2 Rail | Set any one stock to exactly $6 | 885 | 2466 | 2518 | 98% | 35.9% | 1.42 |
| 2 Bank | Look at the top 2 Insider Tips; you may put one on the bottom of the deck | 824 | 2524 | 2557 | 99% | 32.6% | 1.29 |
| 2 Oil | Adjust any one stock by +/-3 | 781 | 2424 | 2487 | 97% | 32.2% | 1.27 |

## Three of a Kind (hard)

| Requirement | Reward | winnerClaims | claims | inPlay | claim% | win%\|claim | lift |
|---|---|---:|---:|---:|---:|---:|---:|
| 3 Rail | Gain $8 | 787 | 1708 | 2453 | 70% | 46.1% | 1.82 |
| 3 Oil | Sell all your stocks; gain +$3 per stock sold | 725 | 1608 | 2540 | 63% | 45.1% | 1.78 |
| 3 Steel | Steal $2 from each other player | 722 | 1644 | 2455 | 67% | 43.9% | 1.74 |
| 3 Bank | Swap one of your cards with a face-up market card | 802 | 1903 | 2531 | 75% | 42.1% | 1.67 |

## Two Pair (hard)

| Requirement | Reward | winnerClaims | claims | inPlay | claim% | win%\|claim | lift |
|---|---|---:|---:|---:|---:|---:|---:|
| 2 Oil + 2 Bank | Draw 3 cards from the main deck, keep 1 | 456 | 735 | 2468 | 30% | 62.0% | 2.45 |
| 2 Rail + 2 Bank | At the end of the game, gain $11 | 825 | 1424 | 2490 | 57% | 57.9% | 2.29 |
| 2 Steel + 2 Oil | Gain $9 | 568 | 1122 | 2485 | 45% | 50.6% | 2.00 |
| 2 Steel + 2 Bank | Adjust any one stock by +4 and another stock by -4 | 665 | 1413 | 2504 | 56% | 47.1% | 1.86 |
| 2 Oil + 2 Rail | Draw the top Insider Tip from the deck into your hand and gain $7 | 439 | 952 | 2556 | 37% | 46.1% | 1.82 |
| 2 Steel + 2 Rail | Draw 2 unused Insider Tips into your hand | 225 | 723 | 2506 | 29% | 31.1% | 1.23 |
