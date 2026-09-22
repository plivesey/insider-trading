---
name: Goal Balancing
description: Analyze goal-card difficulty vs. reward value from self-play data, redesign reward text/mechanics, and rebalance — implement, retrain the bots, re-measure.
---

# Goal Balancing

The 19 goal cards (`cards/goal_cards.json`) each pair a stock requirement
(difficulty) with a reward (value). This skill covers measuring whether a
reward is actually worth its difficulty, redesigning rewards that aren't, and
validating the change — end to end, from data to a retrained bot.

## When to use this skill

- Someone asks whether a goal's reward is under- or over-powered relative to
  how hard it is to claim.
- You're re-theming goal rewards (e.g. giving each stock color a consistent
  identity) and need to know what already exists before inventing new
  mechanics.
- A goal reward's text/mechanic changed and the bots need to be re-measured
  (and possibly retrained) against the new card set.

Do **not** reach for this if the question is about a *stock's* price
dynamics or the value net's stock valuation — that's
the `retrain-bot-value-net` skill. This skill is specifically about goal *reward*
balance; it calls into that other skill for the net-retraining step, but the
measurement and card-design work here is separate.

## Before you touch anything: how the difficulty signal stays clean

`analyzeGoalValue.ts` (below) reports `claim%` as a difficulty signal and
`lift`/`Δwealth` as a value signal. This split only works because bot goal
pursuit is **reward-blind by construction**:

- `tryBuildGoalClaim` (`online/backend/src/bots/decide.ts`) claims any
  completable goal instantly — it never inspects `goal.reward`.
- `goalTargetBoostByColor` (same file) weights auction pursuit purely by "how
  close does this get me to completing *any* goal" — fixed constants, never
  the reward.

So `claim% = claims ÷ inPlay` measures purely how often the stock combo gets
assembled before the game ends, independent of whether the reward is any
good. **Don't add reward-awareness to either function as part of a goal
redesign** — doing so would make claim% start measuring "goals bots bother
to pursue" instead of "goals bots are able to complete," destroying the clean
difficulty axis this whole methodology depends on.

The three reward types (`goals.ts::applyReward`, `valuation.ts::rewardCashEquivalent`,
the `cards.ts::GoalReward` union) can — and should — care about reward value.
Only the *claiming/pursuit* logic must stay blind.

## The pipeline

1. **Analyze current goals.** Run `analyzeGoalValue.ts` (below) against the
   current card set. `claim%` = difficulty (reward-independent, see above).
   `lift` = win-rate-of-claimers ÷ baseline, comparable **only within a
   tier** (across tiers, difficulty dominates). `Δwealth` = mean final wealth
   of claimers minus non-claimers in the same games — comparable *across*
   tiers since it's already in dollars, but read the confound below before
   trusting it at face value.

   **Stock-holding confound**: a card requiring 3-4 colored stocks bakes in
   real dollar value from the stock itself, separate from the reward text —
   whoever claims "4 of a color" is, almost by definition, already holding a
   pile of stock worth real money. The cleanest internal check for this is a
   same-reward control: if several cards share an identical reward (e.g. all
   four Four-of-a-Kind cards granting flat cash), any spread in their
   claim%/Δwealth is coming from difficulty/market dynamics, not the reward
   — don't read that spread as "this color's copy of the reward is better."

2. **Design theme + reward changes**, preferring to relocate/retune an
   *existing*, already-parameterized `GoalReward` type over inventing a new
   mechanic — it's the difference between a JSON-only edit and new engine
   code (see the case study below). Iterate the design with whoever's asking
   before writing code; goal reward design is a creative/balance judgment
   call, not something to solve unilaterally.

3. **Implement**: card content (`cards/goal_cards.json`), any new
   `GoalReward` union variants + engine cases + bot valuation cases (only if
   a genuinely new mechanic is needed — see below), and tests.

4. **Retrain** (only if warranted — see the retrain-or-not judgment call
   below): `trainBotParams.ts` first, then `trainSelfPlay.ts` — order
   matters, see Gotchas.

5. **Re-run the analysis** against the new card set + (if retrained) new
   nets, and read the new numbers against the old ones.

### Case study: what needed new code vs. what didn't (Sept 2026 re-theme)

Redesigning 14 of the 19 cards around a per-color theme, 8 cards were **pure
JSON edits** — relocating/retuning existing types (`gain_cash`,
`steal_from_all`, `swap_with_market`, `adjust_two_stocks`, `draw_and_choose`,
`draw_deck_tip`) to new slots or amounts, zero engine code. Only 3 reward
*shapes* were genuinely new (a tip-draw-and-return-to-event-deck-top
mechanic, and two compound "immediate effect + generic follow-up prompt"
rewards) — and even those reused existing prompt types
(`pick_color_amount`, `draw_and_keep`) rather than inventing new ones. One
existing mechanic (`sell_bonus_batch`) needed a *behavior* change (forced
full-liquidation → opt-in) that turned out to already be fully wired
end-to-end (prompt handler, bot decision branch, frontend) under a sibling
mode name (`sell_same_bonus`, used by the Liquidation action card) — it was
dead code waiting to be pointed at, not new machinery. **Grep for the
mechanic you want before writing it.**

## Where a reward type lives (all three move together)

A `GoalReward` type touches exactly three places, and adding a new one
requires all three:

1. **`online/shared/src/cards.ts`** — the `GoalReward` discriminated union.
   A one-line addition.
2. **`online/backend/src/engine/goals.ts`** (`applyReward`) — the actual
   game-mechanic executor. `void`-returning, **no `default` case** — a
   missed case is a *silent no-op*, not a compile error. Easy to miss.
3. **`online/backend/src/bots/valuation.ts`** (`rewardCashEquivalent`) — the
   bot's cash-equivalent estimate, used by goal-pursuit weighting and the
   value net's input features. `number`-returning, **no `default` case** —
   a missed case is a **hard compile error** (TS exhaustiveness). You cannot
   ship a new type without touching this file.

If the new mechanic draws cards into a prompt (`draw_and_keep`-shaped),
also check `online/backend/src/bots/decide.ts`'s bot handler for that prompt
type — it may be typed for a narrower card union than your new source (see
Gotchas).

## Step by step

```bash
cd online/backend

# 1. Baseline read on the current card set (before any changes).
npx tsx scripts/analyzeGoalValue.ts --games 200000 --seats 3,4,5 --variant alternate --seed 1000000

# 2. After implementing content + engine + test changes:
npm run build && npm test

# 3. Smoke-test the new mechanics before committing to a full retrain --
#    a few thousand games is enough to catch a livelocking bot-decision bug
#    (watch the "stuck" count; it should stay near the historical baseline,
#    not spike -- see Gotchas for a real example of what a spike looks like).
npx tsx scripts/analyzeGoalValue.ts --games 5000 --seats 3,4,5 --variant alternate --seed 999000

# 4. Retrain bot_params (cheap, recalibrates the new reward-type multipliers).
#    Redirect --out -- unlike trainSelfPlay.ts this writes bot_params.json
#    in place by default with no promotion gate.
npx tsx scripts/trainBotParams.ts --gen 250 --resume nets/bot_params.json --out /tmp/goal_retrain/params_scratch
npx tsx scripts/abBotParams.ts /tmp/goal_retrain/params_scratch/bot_params.json --net nets/champion.json --vs random --games 2400
# If it genuinely beats the deployed baseline (no regression at any count):
cp /tmp/goal_retrain/params_scratch/bot_params.json nets/bot_params.json

# 5. Retrain the value net -- see retrain-bot-value-net's own step-by-step,
#    using the just-updated bot_params.json (--params nets/bot_params.json).
#    Trial run, then the real run, then abNets.ts vs the ORIGINAL champion,
#    then promote only if genuinely improved.

# 6. Re-verify after swapping in retrained artifacts.
npm run build && npm test

# 7. Full re-run of the balance analysis against the new card set + nets.
npx tsx scripts/analyzeGoalValue.ts --games 200000 --seats 3,4,5 --variant alternate --seed 1000000
```

### Should you retrain at all?

Not every reward-value edit needs a retrain. `rewardCashEquivalent`'s output
feeds the value net's input features (`valueNetFeatures.ts`, x[38]/x[39]),
normalized by a fixed divisor chosen to match the historical max reward
amount (currently 12, matching the Four-of-a-Kind cards) — an edit that
stays **same-type, within the existing reward range** mostly just shifts
numeric inputs the net already generalizes over, and a retrain buys little.
Retraining earns its cost when: reward *types* change (the bot's cash-
equivalent formula for a new type is a starting-point guess, not tuned), or
an amount pushes meaningfully past the historical ceiling (clipping risk).
When in doubt, run the cheap `trainBotParams.ts` pass regardless (it's a few
minutes) and skip the full value-net retrain unless the smoke-test numbers
look like bots are mis-valuing something structurally.

## Promoting to production

Same discipline as the `retrain-bot-value-net` skill: `nets/champion.json` and
`nets/bot_params.json` are the only two files in `nets/` tracked in git;
`cards/goal_cards.json` is the other production artifact this skill touches.
Commit all three together with the engine/type/test changes that made them
consistent with each other — a card JSON referencing a `GoalReward` type
without the matching engine case is a silent no-op in production, not a
build failure (see above).

## Gotchas

- **A brand-new mechanic can hit an edge case a relocated/retuned one won't:
  running out of cards to draw.** Building a new "draw N, keep M" mechanic
  off the `draw_and_choose`-style pattern (draw a batch, prompt to keep some,
  return the rest), the prompt's `keepCount` must be clamped to however many
  cards were *actually* drawn, not the requested `drawCount` — if the source
  deck runs dry (routine for the much-smaller event deck late in a game,
  rare but not impossible for the main deck), a prompt demanding more picks
  than exist can never resolve and permanently livelocks the game. This
  exact bug shipped in a first draft of a new event-deck-sourced mechanic
  and showed up as a 1.25%-of-games stuck-rate spike (vs. a ~0.0005%
  historical baseline) in step 3's smoke test — caught by watching the
  `stuck` count, not by the type checker or the test suite. If you add a
  similar draw-and-choose-shaped mechanic, clamp `keepCount = Math.min(r.keepCount, drawn.length)`
  before setting the prompt.
- **id-keyed tests break silently on *type* changes, not just value
  changes.** `online/backend/tests/unit/freeActions.test.ts` looks up several
  goal cards by numeric `id` and asserts on the old reward's specific
  mechanic. Relocating a reward to a different id (which a re-theme does
  constantly — colors keep their ids, rewards move between colors) makes
  the old assertion test the *wrong mechanic* entirely, not just the wrong
  number. Search for both `g.id === <n>` and the specific `reward.parsed.type`
  you're touching before editing card content.
- **A prompt-reusing new type shares its bot handler with every other
  reward that sets the same prompt type — including ones typed for a
  narrower card union.** `decide.ts`'s handler for `draw_and_keep` was
  written when the only source was the main deck (`StockCard | ActionCard`);
  reusing that prompt type for an event-deck-sourced draw needs the handler
  widened (or a value-dispatch helper that already covers all four card
  categories — check for one before writing a new branch; this repo already
  had `marketCardValue` sitting unused for exactly this).
- **`trainBotParams.ts` writes `nets/bot_params.json` in place by default,
  with no promotion gate** (unlike `trainSelfPlay.ts`, which only ever
  writes a gitignored scratch file). Always redirect `--out` during tuning
  and only copy over the tracked file after `abBotParams.ts` validates a
  genuine improvement.
- **Retrain order matters if you're doing both.** `trainSelfPlay.ts` bakes
  `--params` into every game's bot profile, including the value net's own
  training-time input features — train the net against stale reward-type
  multipliers and its training distribution won't match what you just
  tuned. Bot_params first, value net second.
- **Orphaned-but-valid reward types are fine to leave alone.** A re-theme
  routinely retires a type from the 19-card set entirely (nothing currently
  uses it) without removing it from the union/switches — this is correct,
  not debt. Don't "clean up" a type just because claim-share shows 0% for
  it this round; a future redesign may bring it back.
- **The root `tests/goal_cards.test.js` unique-reward-text count is a
  hand-maintained literal**, not derived. Recount by hand (or just run the
  suite) after any change to which cards share exact reward text — the
  duplicate Four-of-a-Kind "Gain $12" texts are the only expected collision
  today, but that's a fact about the current design, not a rule.
