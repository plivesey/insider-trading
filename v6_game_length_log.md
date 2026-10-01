# V6 Game Length Log

Dated benchmark runs of total game length (player-turns to reach the progress
tracker's threshold), for the V6 work (bot decaying tip-play threshold +
Event Deck split / dice rebalance / Classic removal — see the plan at
`.claude/plans/pasted-content-id-aa6b-from-our-humble-russell.md` in this
repo's Claude Code plan history, and `v6_tuning_notes.md`). `v5_game_length_log.md`
stays as the frozen V5-era record; this file picks up from there.

All figures are total player-turns (one turn = one player's turn in
rotation; a full round around the table is `players` turns). Measured via
`online/backend/scripts/measureBaselineV6.ts` (single-config version of
`measureGameLength.ts`'s harness, reporting the same Mean/P10/P50/P90/P95/Min/Max
table as the V5 log) — production bots, default ruleset unless noted.

## 2026-09-30 — Phase 1-2 bot retune only, still V5 rules (pre-rule-change baseline)

100,000 games per player count (6p: 99,998 finished, 2 stuck at the
self-play harness's tick cap). Bots: champion net (unchanged) + `bot_params.json`
from a fresh 200-generation ES retrain that added the decaying tip-play
threshold (`tipPlayThresholdStart`/`Floor`/`DecayWindow`, replacing the
permanently-inert flat `tipPlayDelayThreshold`) to the search space —
converged to Start≈10.1, Floor≈5.7, DecayWindow≈1.0. Validated via
`abBotParams.ts`: beats `defaultBotParams()` by $5-10/game across 2-5p, and
beats the prior production params by $2-3/game across 2-5p. `traceBotDecisions.ts`
spot-check (6 games) confirmed the intended behavior change directly: bots now
only play a market-movement card once holding 2-3 of the affected color
(scores $8-12), versus the old "plays at $2, often while holding ≤1" pattern —
zero instances of the old premature-play signature in the sample. Rules
unchanged from V5 (3×players+3 threshold, 4-goal reveal, merged 47-card Event
Deck, no deck split yet).

| Players | Games | Mean | P10 | P50 (Median) | P90 | P95 | Min | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 100,000 | 20.6 | 14 | 20 | 28 | 30 | 5 | 54 |
| 3 | 100,000 | 28.7 | 21 | 28 | 37 | 40 | 8 | 64 |
| 4 | 100,000 | 35.9 | 27 | 35 | 45 | 48 | 12 | 72 |
| 5 | 100,000 | 43.1 | 33 | 42 | 54 | 59 | 18 | 126 |
| 6 | 99,998 (2 stuck) | 72.5 | 45 | 67 | 103 | 119 | 21 | 745 |

**Comparison to the last V5 baseline** (`v5_game_length_log.md`, 2026-09-28,
same 3×players+3 threshold, prior bot_params): mean turns rose from
17.3/23.8/30.3/36.3/49.2 to 20.6/28.7/35.9/43.1/72.5 — roughly **+18-21%**
at 2-5 players and **+47%** at 6 players, with 6p's max jumping from 176 to
745 and 2 stuck games reappearing (0 before). **Not yet acted on** — this is
the bot-threshold change's effect in isolation, confirming the economically
"smarter" behavior (better win margins vs. both defaults and the prior
production params) comes at a real pacing cost: cards now sit in hand longer
before clearing the decaying bar, so progress-tracker-advancing plays happen
less often per turn. This breaks the plan's working assumption that the bot
fix alone wouldn't move pacing much — see `v6_tuning_notes.md` for the open
question of how to address it (tighten the ES search bounds / add a
pacing-aware ES fitness term vs. compensate via the dice/threshold retune in
the later rule-change phases) before proceeding further.

## 2026-09-30 — opponent-impact + preemptive-sell attempt #1: REVERTED, regressed pacing further

Added `state.publicStockKnowledge` (tracks every publicly-observable stock
transfer — auctions, sells, steals, etc. — excluding the secret initial
starter-stock deal), an `opponentImpactWeight` term in `tipScoreForBot`
(weighs a card's effect on opponents' publicly-known holdings), and a
preemptive-sell heuristic: sell a stock if the bot holds *any* held (unplayed)
crash/slump card affecting that color. Also fixed an unrelated, genuine
engine bug found along the way: `sellStock` and several other
discard-producing sites never called `refillMarketIfNeeded`, which could
permanently strand the market at 0 cards and deadlock the game (now fixed,
all discard sites recheck the market afterward).

First ES retrain attempt was **corrupted**: the resume file predated the new
`opponentImpactWeight` field, so `encodeParams` silently produced `NaN` for
that dimension (serialized as `null`), and since `NaN !== 0` is `true` in JS,
every tip score came out `NaN` for the entire 200-generation run — bots
couldn't play a single tip card via the normal path the whole time. Fixed:
`encodeParams` now throws on any non-finite value, `nets/bot_params.json`
was patched to include the missing field, and a regression test
(`botParams.test.ts`) was added asserting the saved production file always
has every current `BotParams` key.

Second (corrected) retrain validated at parity with production
(`abBotParams.ts`, ~$0.01-0.14/game, all "≈ par") and was promoted — but the
partial game-length re-measurement (2-5p; 6p was cancelled before
completion, mid-run) showed a severe regression versus the Phase 1-2
baseline: mean turns **27.5 / 37.1 / 46.1 / 68.2** for 2-5p (+28-58%), with
5p's tail blowing out badly (P95 59→122, max 126→438).

**Root cause** (confirmed via `diagnoseSellVsGoals.ts`, a new diagnostic
tracking goal claims / sells / whether sold stock was goal-useful): the
preemptive-sell heuristic was based on a flawed premise. A market-movement
card sitting in the bot's *own* hand is not an external threat — only the
holder can ever choose to play it, and `tipScoreForBot`'s self term already
discourages playing a card that would hurt the bot's own current holdings.
Treating "I hold a card that would hurt this color" as a reason to sell
preemptively caused bots to dump stock (including goal-critical stock, since
this branch — unlike the existing sell-on-low-cash branch — had no
`goalHoldUsefulnessByColor` guard) far more often than the old, narrow
peeked-tip-only version ever did, directly suppressing the goal-claim channel
of progress-tracker advancement on top of the Phase 1 threshold's existing
suppression of the tip-play channel.

## 2026-09-30 — opponent-impact + preemptive-sell attempt #2 (corrected): restores pacing to baseline or better

Fix: reverted the defensive sell-on-bad-news branch back to peeked-tips-only
(a real external risk — an upcoming dice-bag draw — vs. a self-controlled
held card, which isn't a threat). Replaced it with a narrower, correctly-gated
**sell-to-enable-an-attack** heuristic: only sells to clear the way for a
held crash/slump card when (a) none of its affected colors are needed for a
goal (`goalHoldUsefulnessByColor`), (b) the card isn't already playable as-is,
and (c) selling would actually flip it from below-threshold to playable
(checked via a new `ownedOverride` param on `tipScoreForBot` — "what would
this score if I sold my holding of color X first"). This can only ever
convert an idle card into a progress-tracker-advancing play, never remove one.

Retrained (dim=35, resumed from the corrected code + prior params) — beat
production by $1.47-3.12/game across all counts (`abBotParams.ts`, all
"✅ beats"). `opponentImpactWeight` converged to essentially 0 for the
**third** time running (-2.5e-5) — a stable result, not a training artifact
of the earlier bug: opponent-aware tip scoring doesn't appear to earn its
keep under this self-play evaluation setup. Promoted to production.

| Players | Games | Mean | P10 | P50 (Median) | P90 | P95 | Min | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 100,000 | 20.3 | 14 | 20 | 27 | 30 | 5 | 54 |
| 3 | 100,000 | 28.3 | 21 | 28 | 37 | 39 | 8 | 62 |
| 4 | 100,000 | 35.5 | 27 | 35 | 45 | 48 | 13 | 72 |
| 5 | 100,000 | 43.1 | 33 | 42 | 54 | 59 | 19 | 119 |
| 6 | 99,997 (3 stuck) | 71.2 | 45 | 67 | 100 | 115 | 18 | 836 |

**All 5 player counts now at or better than the Phase 1-2 baseline**
(20.6/28.7/35.9/43.1/72.5 → 20.3/28.3/35.5/43.1/71.2, i.e. -1.1% to -1.8%
everywhere except 5p which is flat) — the success criterion for this whole
detour. 6p still shows 3 stuck games out of ~100k and a high max (836); per
the earlier stuck-game investigation, this specific long tail is a separate,
already-understood phenomenon (extremely slow but not truly deadlocked games
hitting the self-play harness's 20,000-tick cap), not something this fix
was meant to address — the market-refill bug fix earlier this session
already closed the *true*-deadlock failure mode.

## 2026-09-30 — opponentImpactWeight ES-bound fix: real value unlocked, pacing improves substantially

Investigated why `opponentImpactWeight` (added in the attempt #2 entry above)
converged to ~0 across 3 separate ES runs despite the underlying mechanism
being verified correct (an isolated test: bot owns 0 of a color, opponent
publicly known to hold 5, halve card — score jumps from 0 at weight=0 to 20
at weight=1). Root cause: its `PARAM_SPECS` bound (`min: -0.001`, default
`0`) put the logit-encoded default at ≈-6.9, deep in the sigmoid's saturated
tail — a single ES mutation step there (σ=0.15) only moves the *decoded*
value by ≈0.0002, far too small to escape within any realistic generation
budget, even though a directly-forced `opponentImpactWeight=0.3` (same
production params otherwise) beat production by $0.67-4.11/game in a direct
A/B test. This was a search-parameterization bug, not a scoring-logic bug —
the identical "-0.001 nudge, default 0" pattern is also used for
`loanWillingness`/`endgameDiscountStrength`, but those were previously
validated as genuinely unhelpful via direct A/B testing (not just ES
convergence), so they were left alone.

Fix: widened the bound to `min: -0.1` (puts the default at a healthy,
non-saturated logit ≈-2.3) and re-ran the retrain seeded from the validated
`opponentImpactWeight=0.3` variant rather than from scratch. Converged to
**0.398** — meaningfully refined beyond the manual seed. Validated:
`avgEdge` climbed from 16.5% to 23.5% during training; `abBotParams.ts` shows
it beating the prior (corrected-sell-logic) production params by
**$3.25-6.69/game across every player count** (2p-5p), a much larger margin
than any other retrain this session. A 2000-game/4p sanity check
(`diagnoseSellVsGoals.ts`) showed hand-played market-movement cards nearly
**tripling** (0.99 → 2.98/game) — direct confirmation the weight is doing
exactly what it's supposed to: making previously-marginal cards (especially
Crash/Slump, which can only ever be "worth it" via opponent harm once the
bot owns none of the affected color) actually worth playing.

| Players | Games | Mean | P10 | P50 (Median) | P90 | P95 | Min | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 100,000 | 20.1 | 14 | 20 | 27 | 30 | 5 | 53 |
| 3 | 100,000 | 27.1 | 19 | 27 | 35 | 38 | 8 | 66 |
| 4 | 100,000 | 32.6 | 25 | 32 | 41 | 44 | 11 | 75 |
| 5 | 100,000 | 36.7 | 28 | 36 | 46 | 49 | 13 | 97 |
| 6 | 100,000 (0 stuck) | 41.2 | 31 | 40 | 53 | 58 | 17 | 139 |

**Substantially faster than the corrected-sell-logic baseline, not just at
parity**: -1% (2p) to **-42.1% (6p)** — the improvement scales sharply with
player count, exactly where the original Phase 1 regression hit hardest.
6-player finished all 100,000 games with **zero stuck** (down from 2-3/100k
and a max of 745-836) — the long-tail pathology that originally motivated
this whole detour is gone; max turns at 6p dropped to 139. Compared to the
very first V5 baseline before any of this session's bot work (17.3/23.8/
30.3/36.3/49.2), 6p (41.2) and 5p (36.7) are now *better* than that original
number despite the bots being considerably smarter; 2-4p remain a bit above
it but far closer than at any point in this investigation, a reasonable
trade for meaningfully better economic play. See `v6_tuning_notes.md` item 1
(now updated: the single global weight is confirmed working well; per-card-
type weighting stays deferred, not obviously needed).

## 2026-09-30 — actual V6 rules (deck split + dice rebalance + players+3 goal formula): first measurement under the real new rules

Every prior entry in this log was measured under **old V5 rules** (the
merged Event Deck, flat 4-goal reveal, old dice composition) with the new
V6-era bots — the rule-change implementation itself (Phases 4-8 of the plan:
Event Deck split into `tipDeck`/`goalReserve`, `players+3` goal-reveal
formula, the rebalanced dice bag, tip-only Insider Source, Classic's full
removal) hadn't landed in code yet. This is the first run under the actual
new rules.

| Players | Games | Mean | P10 | P50 (Median) | P90 | P95 | Min | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 100,000 | 22.4 | 16 | 22 | 29 | 32 | 6 | 52 |
| 3 | 100,000 | 28.6 | 21 | 28 | 36 | 39 | 8 | 60 |
| 4 | 100,000 | 32.7 | 25 | 32 | 41 | 44 | 12 | 67 |
| 5 | 100,000 | 35.9 | 28 | 35 | 45 | 47 | 14 | 103 |
| 6 | 100,000 | 38.2 | 29 | 37 | 48 | 53 | 15 | 117 |

**Zero stuck games across all 500,000 games at every player count** — the
best result of this entire investigation; the 6p stuck-game pathology that
originally motivated the market-refill bugfix is fully gone under the real
rules, not just reduced.

Versus the previous entry (old V5 rules, same bots: 20.1/27.1/32.6/36.7/41.2)
the actual rule changes shift pacing differently by player count: **slower
at 2-3p** (+11.4%, +5.5%) but **faster at 5-6p** (-2.2%, -7.3%), 4p roughly
flat (+0.3%). Plausible read: the `players+3` goal-reveal formula gives
low-player-count games relatively *fewer* available goals than the old flat
4-goal reveal did (5 at 2p vs. the old flat 4 — actually slightly more, so
this isn't the explanation; more likely it's the dice rebalance interacting
with how few turns a 2p game takes in total, where each individual draw's
pacing effect is proportionally larger) — not fully diagnosed, flagged in
`v6_tuning_notes.md` as a minor open item, not blocking.

**Versus the original pre-Phase-1 V5 baseline** (17.3/23.8/30.3/36.3/49.2,
before any of this session's bot or rule work): +29.5% (2p), +20.2% (3p),
+8.0% (4p), -1.1% (5p), **-22.4% (6p)**. Despite substantially smarter bots
(opponent-aware scoring, corrected sell logic, properly-tuned decaying
threshold) and a fully reworked ruleset, final pacing lands close to or
better than the original numbers at every count from 4p up, with 6p — the
worst-hit case throughout this whole investigation — now dramatically
faster and fully stuck-free. 2-3p run moderately longer but remain
well within a reasonable range (22-29 mean turns).
