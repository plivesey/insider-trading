# V6 Tuning Notes

Open/tunable numbers and follow-up ideas for the V6 work (bot decaying
tip-play threshold, opponent-aware tip scoring, Event Deck split / dice
rebalance / Classic removal — see the plan at
`.claude/plans/pasted-content-id-aa6b-from-our-humble-russell.md` in this
repo's Claude Code plan history). `v5_tuning_notes.md` stays as the frozen
V5-era record; this file picks up from there.

## 1. Per-card-type opponent-impact weighting (not yet needed)

`tipScoreForBot`'s `opponentImpactWeight` is a single global scalar applied
identically across all four market-movement card types (Crash/halve,
Surge/+4, Slump/-2/-2, Shift/+2/-2). Raised as a question: should each type
get its own weight, since they might call for different strategies?

Current read: **not needed on sign-logic grounds** — the formula sums the
effect per color with its natural sign, so a single weight already generalizes
correctly across all four types without modification: for a positive-effect
card (Surge, or the "+2" side of a Shift), a loaded-up opponent makes
`opponentTotal` positive, so `score = selfTotal - weight·opponentTotal` goes
*down* (correctly discourages helping a rival); for a negative-effect card
(Crash, Slump, the "-2" side of a Shift), `opponentTotal` is negative, so the
same formula pushes the score *up* (correctly encourages hurting them). No
card-type-specific logic is needed for the sign to come out right.

Where per-type weights *might* still matter: risk/timing considerations the
current formula doesn't model at all, e.g. weighting a Crash's big
all-or-nothing swing differently from a Shift's moderate ±2 — not a sign-logic
question, a genuinely separate one. Deliberately not built now: it would add
3-4 more ES search dimensions right as we're validating the fix for
`opponentImpactWeight` getting trapped near its default by a bad bound (see
`v6_game_length_log.md`, 2026-09-30 entries) — adding more dimensions before
confirming the single-weight version is solid would make it harder to
attribute results. Revisit once the single-weight version's game-length and
economic effects are confirmed stable across a few more validation passes.

**Update, same day**: the single-weight version is now confirmed working
well after the ES-bound fix — converged to `opponentImpactWeight=0.398`,
beats prior production by $3.25-6.69/game across all player counts, hand-
played market-movement cards nearly tripled (0.99→2.98/game at 4p), and game
length improved substantially (-1% to -42.1% vs. the pre-fix baseline,
scaling with player count; 6p's stuck-game rate dropped to 0/100k). No sign
the single weight is a bottleneck in practice. Per-card-type weighting stays
a deferred, speculative follow-up — not clearly motivated by anything
observed so far.

## 2. Value-net self-play retrain for the V6 deck split: declined, kept the existing net

Per the `retrain-bot-value-net` skill (triggered because the Event Deck split
shifts `valueNetFeatures.ts`'s feature semantics), ran a full
`trainSelfPlay.ts` champion-vs-challenger retrain under the new V6 rules
(deck split, `players+3` goal reveal, rebalanced dice, tip-only Insider
Source). Pre-training audit per the skill's checklist caught a real stale
denominator: `x[30] = goalRow.length / (numPlayers + 2)` assumed the old flat
4-goal reveal; fixed to `/ (numPlayers + 3)` to match the new formula exactly
(now starts at 1.0 at setup instead of always sitting above 1.0). This fix
shipped regardless of the retrain's outcome below — it's correct either way.

Training ran 5 successful promotion rounds before round 6 failed to improve
further (`avgEdge` across 2-5p: +8.7% vs. the original champion). **Declined
to promote** despite the positive average: the per-count breakdown showed a
real, statistically significant regression at 2 players (38.0% win rate vs.
50% fair share, mean margin **-$5.85**, 95% CI `[-6.79, -4.91]` over 2,000
games — doesn't cross 0) traded off against solid gains at 3p (+$3.58), 4p
(+$6.38), and 5p (+$7.28). The training loop's own in-loop promotion gate
only checks `avgEdge`, so it happily promoted through this tradeoff
internally across all 5 rounds without ever surfacing it — exactly the
"avgEdge averages across table sizes; minEdge is the regression guard" trap
the skill's own documentation calls out. `minEdge=-12.0%` on the final
candidate was the tell.

**Kept the original `champion.json`** — it was already thoroughly validated
under V6 rules throughout this session's work (the game-length and economic
numbers in `v6_game_length_log.md` all reflect the un-retrained net), and
"the deployed net already generalizes fine to the new rules, no promotion
necessary" is an explicitly normal, fine outcome per the skill. If anyone
revisits this: the 2p regression is worth digging into on its own merits
(e.g. does `trainSelfPlay.ts`'s per-generation seat sampling under-weight 2p
relative to 3-5p, given a 2-player table has only one opponent to place
against, making its placement-fitness signal binary/noisier than a 5-player
table's? — not investigated further this session) before trying again.
