# V5 Game Length Log

Dated benchmark runs of total game length (player-turns to reach the progress
tracker's threshold), so a rule change's effect on pacing can be compared
against a prior baseline. Measured via 100,000-game bot self-play runs
(`online/backend/scripts/measureGameLength.ts`-style harness — production
bots, default ruleset unless noted). See `v5_tuning_notes.md` item 2 for the
`progressThresholdPerPlayer`/`progressThresholdBase` knob these numbers are
sanity-checking.

All figures are total player-turns (one turn = one player's turn in
rotation; a full round around the table is `players` turns).

## 2026-09-27 — baseline (3×players+2 threshold, 4-goal reveal, Classic)

100,000 games per player count. Bots: champion net + bot_params from the
2026-09-22 goal-balancing retrain (commit `fc357a0`).

| Players | Games | Mean | P10 | P50 (Median) | P90 | P95 | Min | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 100,000 | 26.2 | 19 | 26 | 35 | 37 | 8 | 58 |
| 4 | 100,000 | 31.8 | 24 | 31 | 40 | 43 | 10 | 71 |
| 5 | 99,999* | 37.7 | 29 | 37 | 47 | 50 | 16 | 77 |

\* One 5-player game hit the simulation's turn cap without finishing and was
excluded from its stats.

~8 rounds around the table regardless of player count. Full write-up + a
median/P10-P90 chart: [Game Length Simulation](https://claude.ai/artifact/CzJzBGZVcmysw2PjmVp3Gj).

**Gut check at this point:** this feels like it might be a bit too long,
especially at 4-5 players (P90 approaching 45-50 turns). Not acting on it yet
— waiting on real human playtesting to confirm before touching the threshold
again.

## 2026-09-27 — after bot-quality ES retrain (see v5_tuning_notes.md item 18)

Quick 3,000-game/count regression check (not a full 100k re-run) after
promoting the ES-retrained `bot_params.json`: mean turns 25.4 / 31.0 / 37.1
for 3/4/5 players — within ~1 turn of the pre-retrain baseline above (26.2 /
31.8 / 37.7) at this smaller sample size. No meaningful pacing shift; the
small decrease is consistent with marginally sharper play (faster goal
completions / fewer wasted rounds), not a rules or threshold change.

## 2026-09-28 — Classic removed; Alternate's 4×players+1 is now DEFAULT_RULES (see v5_tuning_notes.md item 19)

**Not comparable to the entries above** — the online implementation's default
ruleset itself changed today (Classic's 3×players+2 threshold no longer
exists; `DEFAULT_RULES` is now what was Alternate's 4×players+1), on top of a
full bot retrain under the new ruleset. 3,000-game/count check: mean turns
26.0 / 34.5 / 43.4 for 3/4/5 players. Higher than the old Classic numbers, as
expected from the larger threshold multiplier (4x+1 vs 3x+2) — not a
regression, a different game. This is the new baseline going forward; a full
100k-game run would be worth doing once there's more human playtesting on
this ruleset specifically.
