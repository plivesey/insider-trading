# Goal Reward Value Study — Alternate variant

Production-bot self-play across 3/4/5-player games (**alternate** setup variant), 200000 games per seat count (seed base 1000000).

## Methodology

- **Difficulty (`claim%`)** is reward-independent by construction: bots chase the color closest to completing *any* visible/held goal (`goalTargetBoostByColor`, decide.ts) without ever weighting by that goal's reward, and claim a goal the instant it is satisfiable (`tryBuildGoalClaim`). So `claim% = claims ÷ inPlay` measures purely how often the required stock combo gets assembled before the game ends — not whether the reward is any good.
- **Value** is captured two ways: `lift` = (win rate of players who claimed the goal) ÷ (baseline win rate ≈ 1/seats) — only compare `lift` **within a tier**, since across tiers difficulty dominates. `Δwealth` = mean final wealth ($) of claimers minus mean final wealth of non-claimers in games where the goal was available — a continuous, less noisy companion metric, comparable *across* tiers since it's already in game-dollar terms.
- Both value metrics are post-hoc correlations, not a controlled causal estimate — a goal claimed late by an already-winning player looks artificially strong. Weight `Δwealth` over `lift` for close calls; treat anything within noise (small `inPlay`/`claims` counts) with caution.
- **Stock-holding confound**: goals that require holding 3-4 colored stocks (Three/Two-Pair/Four of a Kind) bake in real dollar value from the stock itself, separate from the goal's own reward text — a claimer of "4 Steel" is, almost by definition, already holding a pile of stock that counts toward final wealth with or without the goal's $12. The four "Four of a Kind" cards are a useful internal control here: all four grant an *identical* flat $12, so any spread in their claim%/Δwealth across colors is coming from difficulty and market dynamics, not the reward — a real effect visible in this data, not noise.

## Per player-count results

### 3-player games

**200000 games** counted (0 stuck/excluded), ran in 173.7s. Baseline win rate per player: **33.6%** (≈ 1/3).

| Tier | Requirement | Reward | inPlay | claim% (difficulty) | win%\|claim | lift | Δwealth ($) |
|---|---|---|---:|---:|---:|---:|---:|
| Pair (easy) | 2 Steel | Steal $1 from each other player | 100931 | 95% | 43.5% | 1.29 | +5.50 |
| Pair (easy) | 2 Oil | Adjust any one stock by +/-3 | 102633 | 95% | 45.8% | 1.36 | +6.69 |
| Pair (easy) | 2 Rail | Look at the top 3 Insider Tips. Draw 1 into your hand; return the other 2 to the top of the deck | 109470 | 97% | 32.6% | 0.97 | -0.25 |
| Pair (easy) | 2 Bank | Gain $4 | 88984 | 96% | 43.4% | 1.29 | +5.56 |
| Full Spread (medium) | 1 Steel + 1 Oil + 1 Rail + 1 Bank | Gain $6 | 85656 | 59% | 53.7% | 1.60 | +12.18 |
| Three of a Kind (hard) | 3 Steel | Steal $2 from each other player | 85025 | 47% | 54.4% | 1.62 | +10.16 |
| Three of a Kind (hard) | 3 Oil | Sell any number of your stocks; gain +$3 per stock sold | 86394 | 64% | 53.1% | 1.58 | +9.63 |
| Three of a Kind (hard) | 3 Rail | Look at the top 4 Insider Tips. Draw 2 into your hand; return the other 2 to the top of the deck | 92493 | 62% | 33.5% | 1.00 | +0.05 |
| Three of a Kind (hard) | 3 Bank | Gain $8 | 83033 | 53% | 50.7% | 1.51 | +9.39 |
| Two Pair (hard) | 2 Steel + 2 Oil | Adjust one stock by +2 and another stock by -2 | 79500 | 29% | 58.9% | 1.75 | +15.27 |
| Two Pair (hard) | 2 Steel + 2 Rail | Swap one of your cards for a face-up market card | 78787 | 33% | 63.8% | 1.90 | +17.63 |
| Two Pair (hard) | 2 Steel + 2 Bank | At the end of the game, gain $12 | 81195 | 54% | 58.1% | 1.73 | +13.15 |
| Two Pair (hard) | 2 Oil + 2 Rail | Draw the top Insider Tip into your hand. Adjust any one stock by +2 or -2 | 82823 | 51% | 47.5% | 1.41 | +8.36 |
| Two Pair (hard) | 2 Oil + 2 Bank | Gain $4 and adjust one stock by +2 or -2 | 79756 | 37% | 58.9% | 1.75 | +14.85 |
| Two Pair (hard) | 2 Rail + 2 Bank | Draw the top Insider Tip into your hand and gain $6 | 79266 | 34% | 47.7% | 1.42 | +10.67 |
| Four of a Kind (very hard) | 4 Steel | Gain $12 | 75970 | 15% | 67.5% | 2.01 | +20.45 |
| Four of a Kind (very hard) | 4 Oil | Gain $12 | 76212 | 22% | 67.3% | 2.00 | +19.01 |
| Four of a Kind (very hard) | 4 Rail | Gain $12 | 77440 | 16% | 58.0% | 1.72 | +15.34 |
| Four of a Kind (very hard) | 4 Bank | Gain $12 | 75763 | 15% | 58.0% | 1.72 | +15.59 |

### 4-player games

**200000 games** counted (0 stuck/excluded), ran in 285.2s. Baseline win rate per player: **25.2%** (≈ 1/4).

| Tier | Requirement | Reward | inPlay | claim% (difficulty) | win%\|claim | lift | Δwealth ($) |
|---|---|---|---:|---:|---:|---:|---:|
| Pair (easy) | 2 Steel | Steal $1 from each other player | 116779 | 102% | 37.7% | 1.49 | +7.55 |
| Pair (easy) | 2 Oil | Adjust any one stock by +/-3 | 121375 | 100% | 38.3% | 1.52 | +7.85 |
| Pair (easy) | 2 Rail | Look at the top 3 Insider Tips. Draw 1 into your hand; return the other 2 to the top of the deck | 132242 | 103% | 24.8% | 0.98 | -0.62 |
| Pair (easy) | 2 Bank | Gain $4 | 100377 | 106% | 32.5% | 1.29 | +5.07 |
| Full Spread (medium) | 1 Steel + 1 Oil + 1 Rail + 1 Bank | Gain $6 | 97802 | 69% | 43.0% | 1.70 | +12.79 |
| Three of a Kind (hard) | 3 Steel | Steal $2 from each other player | 101291 | 68% | 46.7% | 1.85 | +11.45 |
| Three of a Kind (hard) | 3 Oil | Sell any number of your stocks; gain +$3 per stock sold | 99212 | 76% | 47.9% | 1.90 | +12.25 |
| Three of a Kind (hard) | 3 Rail | Look at the top 4 Insider Tips. Draw 2 into your hand; return the other 2 to the top of the deck | 110508 | 77% | 26.5% | 1.05 | -0.33 |
| Three of a Kind (hard) | 3 Bank | Gain $8 | 93923 | 65% | 38.3% | 1.52 | +8.24 |
| Two Pair (hard) | 2 Steel + 2 Oil | Adjust one stock by +2 and another stock by -2 | 89357 | 39% | 54.0% | 2.14 | +18.55 |
| Two Pair (hard) | 2 Steel + 2 Rail | Swap one of your cards for a face-up market card | 87767 | 44% | 56.1% | 2.22 | +18.69 |
| Two Pair (hard) | 2 Steel + 2 Bank | At the end of the game, gain $12 | 92110 | 66% | 46.3% | 1.84 | +12.34 |
| Two Pair (hard) | 2 Oil + 2 Rail | Draw the top Insider Tip into your hand. Adjust any one stock by +2 or -2 | 94089 | 63% | 40.2% | 1.59 | +9.50 |
| Two Pair (hard) | 2 Oil + 2 Bank | Gain $4 and adjust one stock by +2 or -2 | 92209 | 53% | 46.5% | 1.84 | +13.66 |
| Two Pair (hard) | 2 Rail + 2 Bank | Draw the top Insider Tip into your hand and gain $6 | 89178 | 45% | 36.6% | 1.45 | +10.11 |
| Four of a Kind (very hard) | 4 Steel | Gain $12 | 83964 | 24% | 61.2% | 2.42 | +20.35 |
| Four of a Kind (very hard) | 4 Oil | Gain $12 | 85403 | 33% | 61.4% | 2.44 | +20.82 |
| Four of a Kind (very hard) | 4 Rail | Gain $12 | 87152 | 25% | 47.6% | 1.89 | +14.90 |
| Four of a Kind (very hard) | 4 Bank | Gain $12 | 83851 | 24% | 43.1% | 1.71 | +12.00 |

### 5-player games

**200000 games** counted (0 stuck/excluded), ran in 448.7s. Baseline win rate per player: **20.2%** (≈ 1/5).

| Tier | Requirement | Reward | inPlay | claim% (difficulty) | win%\|claim | lift | Δwealth ($) |
|---|---|---|---:|---:|---:|---:|---:|
| Pair (easy) | 2 Steel | Steal $1 from each other player | 134303 | 107% | 35.3% | 1.75 | +11.05 |
| Pair (easy) | 2 Oil | Adjust any one stock by +/-3 | 140158 | 104% | 31.8% | 1.58 | +8.92 |
| Pair (easy) | 2 Rail | Look at the top 3 Insider Tips. Draw 1 into your hand; return the other 2 to the top of the deck | 152341 | 108% | 21.7% | 1.08 | +0.65 |
| Pair (easy) | 2 Bank | Gain $4 | 112749 | 114% | 24.3% | 1.20 | +3.88 |
| Full Spread (medium) | 1 Steel + 1 Oil + 1 Rail + 1 Bank | Gain $6 | 109924 | 77% | 37.0% | 1.84 | +14.57 |
| Three of a Kind (hard) | 3 Steel | Steal $2 from each other player | 117809 | 80% | 46.2% | 2.29 | +16.72 |
| Three of a Kind (hard) | 3 Oil | Sell any number of your stocks; gain +$3 per stock sold | 113007 | 85% | 41.4% | 2.05 | +13.75 |
| Three of a Kind (hard) | 3 Rail | Look at the top 4 Insider Tips. Draw 2 into your hand; return the other 2 to the top of the deck | 126712 | 84% | 24.0% | 1.19 | +1.47 |
| Three of a Kind (hard) | 3 Bank | Gain $8 | 106574 | 78% | 28.3% | 1.40 | +6.46 |
| Two Pair (hard) | 2 Steel + 2 Oil | Adjust one stock by +2 and another stock by -2 | 99363 | 50% | 51.0% | 2.53 | +22.78 |
| Two Pair (hard) | 2 Steel + 2 Rail | Swap one of your cards for a face-up market card | 97900 | 55% | 53.7% | 2.66 | +23.53 |
| Two Pair (hard) | 2 Steel + 2 Bank | At the end of the game, gain $12 | 102871 | 72% | 39.5% | 1.96 | +14.01 |
| Two Pair (hard) | 2 Oil + 2 Rail | Draw the top Insider Tip into your hand. Adjust any one stock by +2 or -2 | 104928 | 70% | 35.7% | 1.77 | +12.33 |
| Two Pair (hard) | 2 Oil + 2 Bank | Gain $4 and adjust one stock by +2 or -2 | 103545 | 65% | 37.6% | 1.86 | +14.01 |
| Two Pair (hard) | 2 Rail + 2 Bank | Draw the top Insider Tip into your hand and gain $6 | 99202 | 52% | 30.5% | 1.51 | +11.21 |
| Four of a Kind (very hard) | 4 Steel | Gain $12 | 92030 | 30% | 59.9% | 2.97 | +25.73 |
| Four of a Kind (very hard) | 4 Oil | Gain $12 | 93387 | 42% | 55.7% | 2.76 | +23.77 |
| Four of a Kind (very hard) | 4 Rail | Gain $12 | 96453 | 33% | 42.9% | 2.13 | +18.13 |
| Four of a Kind (very hard) | 4 Bank | Gain $12 | 92162 | 33% | 33.9% | 1.68 | +10.67 |

## Pooled across all player counts

Pooled baseline win rate: **25.2%**.

| Tier | Requirement | Reward | inPlay | claim% (difficulty) | win%\|claim | lift | Δwealth ($) |
|---|---|---|---:|---:|---:|---:|---:|
| Pair (easy) | 2 Steel | Steal $1 from each other player | 352013 | 102% | 38.3% | 1.52 | +7.65 |
| Pair (easy) | 2 Oil | Adjust any one stock by +/-3 | 364166 | 100% | 37.7% | 1.49 | +7.18 |
| Pair (easy) | 2 Rail | Look at the top 3 Insider Tips. Draw 1 into your hand; return the other 2 to the top of the deck | 394053 | 103% | 25.6% | 1.02 | -0.85 |
| Pair (easy) | 2 Bank | Gain $4 | 302110 | 106% | 32.1% | 1.27 | +3.97 |
| Full Spread (medium) | 1 Steel + 1 Oil + 1 Rail + 1 Bank | Gain $6 | 293382 | 69% | 43.2% | 1.71 | +12.93 |
| Three of a Kind (hard) | 3 Steel | Steal $2 from each other player | 304125 | 67% | 48.0% | 1.90 | +13.65 |
| Three of a Kind (hard) | 3 Oil | Sell any number of your stocks; gain +$3 per stock sold | 298613 | 76% | 46.4% | 1.84 | +11.84 |
| Three of a Kind (hard) | 3 Rail | Look at the top 4 Insider Tips. Draw 2 into your hand; return the other 2 to the top of the deck | 329713 | 76% | 27.0% | 1.07 | +0.13 |
| Three of a Kind (hard) | 3 Bank | Gain $8 | 283530 | 66% | 36.8% | 1.46 | +7.52 |
| Two Pair (hard) | 2 Steel + 2 Oil | Adjust one stock by +2 and another stock by -2 | 268220 | 40% | 53.7% | 2.13 | +19.80 |
| Two Pair (hard) | 2 Steel + 2 Rail | Swap one of your cards for a face-up market card | 264454 | 45% | 56.7% | 2.25 | +20.65 |
| Two Pair (hard) | 2 Steel + 2 Bank | At the end of the game, gain $12 | 276176 | 65% | 46.4% | 1.84 | +12.85 |
| Two Pair (hard) | 2 Oil + 2 Rail | Draw the top Insider Tip into your hand. Adjust any one stock by +2 or -2 | 281840 | 62% | 40.1% | 1.59 | +10.07 |
| Two Pair (hard) | 2 Oil + 2 Bank | Gain $4 and adjust one stock by +2 or -2 | 275510 | 53% | 44.9% | 1.78 | +14.13 |
| Two Pair (hard) | 2 Rail + 2 Bank | Draw the top Insider Tip into your hand and gain $6 | 267646 | 44% | 36.5% | 1.45 | +10.54 |
| Four of a Kind (very hard) | 4 Steel | Gain $12 | 251964 | 24% | 61.8% | 2.45 | +23.15 |
| Four of a Kind (very hard) | 4 Oil | Gain $12 | 255002 | 33% | 59.9% | 2.38 | +22.02 |
| Four of a Kind (very hard) | 4 Rail | Gain $12 | 261045 | 26% | 47.3% | 1.88 | +16.80 |
| Four of a Kind (very hard) | 4 Bank | Gain $12 | 251776 | 24% | 41.3% | 1.64 | +12.42 |

## Flags: reward likely needs adjustment

"Underpaid": harder-than-median claim% (below the tier median) but below-median Δwealth for that tier — a real grind for a reward that doesn't pay off. "Overpaid": at or above the tier median claim% but Δwealth stands out well above the tier's peers — cheap goal, outsized payoff.

| Tier | Requirement | Reward | claim% | Δwealth | Flag |
|---|---|---|---:|---:|---|
| Three of a Kind (hard) | 3 Bank | Gain $8 | 66% | +7.52 | **underpaid** |
| Three of a Kind (hard) | 3 Oil | Sell any number of your stocks; gain +$3 per stock sold | 76% | +11.84 | **overpaid** |
| Two Pair (hard) | 2 Rail + 2 Bank | Draw the top Insider Tip into your hand and gain $6 | 44% | +10.54 | **underpaid** |
| Two Pair (hard) | 2 Oil + 2 Bank | Gain $4 and adjust one stock by +2 or -2 | 53% | +14.13 | **overpaid** |
| Four of a Kind (very hard) | 4 Bank | Gain $12 | 24% | +12.42 | **underpaid** |
| Four of a Kind (very hard) | 4 Oil | Gain $12 | 33% | +22.02 | **overpaid** |
