---
name: Retrain Bot Value Net
description: Retrain the online bots' stock-valuation neural net via champion-vs-challenger self-play, validate the improvement, and promote it to production.
---

# Retrain Bot Value Net

The online backend's bots (`online/backend/src/bots/`) value colored stocks with a
tiny trained MLP (`ValueNetWeights` in `valueNet.ts`) rather than a hand-written
formula. Everything else about bot behavior (action-card play, goal claims,
auction bidding logic, drafting) is hand-tuned heuristics — only the "what is
this stock worth" number for a colored share comes from the net. This skill
covers retraining that net.

## When to use this skill

- A rule/economy change shifted the ranges the net's input features see (new
  starting cash, new loan cap, a redesigned deck, a new end condition, a new
  color, etc.) and the deployed net (`nets/champion.json`) was trained before
  that change.
- You want to try to improve the net's play quality in general.
- Someone asks to "retrain the bots" or "retrain the value net."

Do **not** reach for this if the complaint is about a *heuristic* (action-card
play timing, goal-claim timing, bidding ceiling logic) — those live in
`decide.ts`/`actionHeuristics.ts`/`valuation.ts` and are hand-tuned constants,
not trained. See `botParams.ts`/`scripts/trainBotParams.ts` if those constants
themselves need tuning (a separate, smaller ES optimizer — same pattern as
this skill, over `BotParams` instead of net weights).

## Before you retrain: check the feature encoder

`valueNetFeatures.ts::encodeColorFeatures` is the *only* place game state
becomes the net's input vector — both training and runtime inference call it,
so there's no train/inference skew from the code path itself. But it's worth
auditing by hand whenever the game's rules changed, because:

- **The 40-slot schema is frozen on purpose.** Adding, removing, or reordering
  slots invalidates every existing checkpoint. `STOCK_FEATURE_LEN` and the
  comment above it are the source of truth — don't resize it as part of a
  retrain; that's a separate, bigger decision.
- **Slots can still be silently wrong even with the schema unchanged.** Diff
  the file against a frozen prior-ruleset snapshot if one exists (this repo
  keeps one at `v4/online/backend/src/bots/valueNetFeatures.ts` from the V4→V5
  migration) and look specifically for:
  - Hardcoded normalization denominators that used to match a game constant
    (starting cash, a loan cap, a deck size formula) and no longer do. These
    are cheap, unambiguous fixes — do them before training, not after: a
    denominator that's stale means the feature's usable range is needlessly
    compressed or is missing the "at the cap" region entirely.
  - Any feature whose *scale* changed because the underlying pool/mechanic it
    reads was redesigned (not just renamed) — e.g. a deck that used to be
    small and curated is now a much bigger merged deck. You can't "fix" this
    with a constant tweak; retraining under the new rules is the actual fix,
    because it makes the training distribution and the inference distribution
    the same again. Just be aware of it so you're not surprised the old
    checkpoint behaved differently — that mismatch is expected and exactly
    what retraining resolves.
  - Any brand-new end condition or mechanic with **zero** representation in
    the feature vector at all (frozen schema ⇒ no new slots ⇒ genuinely blind
    to it). Retraining can't fix an omitted signal — only adding a slot can,
    which is out of scope for a same-schema retrain. Flag it and move on.

## The training pipeline

Three scripts in `online/backend/scripts/`, all built on the same shared ES
core (`src/bots/esCore.ts`, OpenAI-style mirrored-sampling evolution strategies
— no backprop, no GPU, just many fast headless games via
`src/bots/selfPlay.ts::playOneGame`):

1. **`trainStockValueNet.ts`** — trains from scratch (or `--resume <ckpt>`)
   against a field of pure-heuristic bots (no net). This is how the *original*
   champion was bootstrapped. Not what you want for an incremental retrain of
   an already-good net — heuristic opponents are much weaker than the current
   champion, so the candidate can "win" by being only slightly better than
   heuristic while actually being worse than the current net.

2. **`trainSelfPlay.ts`** — **this is the one for a retrain.** Champion-vs-challenger
   self-play, matching exactly the workflow "iterate until the new model wins
   most of the time, then everyone gets it, then keep going":
   - Warm-starts the candidate from `--champion` (default `nets/champion.json`).
   - Each *round*: runs ES for `--gen` generations. Every generation, the
     candidate occupies one rotating seat (`candSeats[k] = k % numSeats`) and
     **every other seat plays the frozen current champion** (not heuristic).
     Fitness is placement (fraction of opponents beaten, centered to
     `[-0.5, 0.5]`) — scale-free across mixed table sizes, so a 2-player game's
     bigger dollar margins can't dominate a 5-player game's smaller ones.
   - Every `--valEvery` generations, validates the in-progress candidate vs
     the frozen champion on `--valGamesPerCount` held-out seeds per table
     size (a disjoint seed band from training, so validation isn't grading the
     candidate on games it already implicitly saw). Tracks the best-by-
     average-edge candidate seen so far in the round.
   - End of round: if that best candidate beats the champion by at least
     `--promoteThreshold` average edge, **promote** it — it becomes the next
     round's frozen opponent — and start a new round. This is exactly the
     "then update so everyone gets the new model and keep going" step, just
     scoped to the training loop's own internal champion, not production yet.
   - Stops when a round fails to clear the promotion threshold, or after
     `--maxRounds`.
   - Writes progress to `nets/champion_selfplay.json` (never touches the
     starting `--champion` file) and a per-generation log to
     `nets/selfplay_log.csv`.

3. **`abWinRate.ts`** — standalone A/B harness, but only net-vs-*heuristic*.
   For a net-vs-*current-champion* comparison (what you actually want to
   report "how much did it improve"), reuse `evalAcrossCountsBuilders` from
   `src/bots/evaluate.ts` directly with `subject` = new net and `field` = old
   champion, both wrapped in `makeProductionBotProfile` so the comparison
   matches production exactly (trained `BotParams` + per-bot variety +
   min-bid bidding, not the bare defaults `trainSelfPlay.ts`'s own in-loop
   validator already uses this builder — you can lift the same call with more
   games for a tighter final confidence interval than the in-loop checks used).

All costs are cheap. Empirically on this repo's hardware: 2–5 player games
average roughly ~1ms/game, so a full generation (population × games, default
48 × 16 = 768 games) runs in under a second, and a full 120-generation round
takes on the order of 1–2 minutes. **6-player games are dramatically more
expensive** (~19× per-game in a quick check) because a meaningful fraction of
them run into the thousands of turns before the progress tracker hits
threshold — this is why the deployed champion's `COUNTS` range has always
been `[2, 5]` (see `trainStockValueNet.ts`'s comment: "6-player is being
dropped"). Time a small trial (`--gen 3 --pop 4 --games 8 --valGamesPerCount 20`,
seconds) before committing to a full run, and only add `--minSeats 6
--maxSeats 6` (or extend the existing range to include it) as an explicit,
separate decision — it changes both the cost profile and what the net is
optimized for.

## Step by step

```bash
cd online/backend

# 1. Time a tiny trial first — confirms the pipeline runs and gives a
#    per-generation cost estimate before committing to a real budget.
npx tsx scripts/trainSelfPlay.ts --gen 3 --pop 4 --games 8 \
  --valEvery 1 --valGamesPerCount 20 --maxRounds 1 --out /tmp/trial

# 2. Run for real, writing into the real nets/ dir (champion_selfplay.json is
#    gitignored scratch — this never touches champion.json itself).
#    Defaults below match how the original champion was produced.
npx tsx scripts/trainSelfPlay.ts \
  --gen 120 --pop 24 --games 16 --sigma 0.05 --lr 0.03 \
  --minSeats 2 --maxSeats 5 --valEvery 10 --valGamesPerCount 200 \
  --promoteThreshold 0.01 --maxRounds 6 --seed 1 \
  --champion nets/champion.json --params nets/bot_params.json --out nets

# 3. Final head-to-head report: new net vs the ORIGINAL deployed champion,
#    more games than the in-loop validator for a tighter confidence interval.
#    (Write a one-off script, or run interactively — see evaluate.ts's
#    evalAcrossCountsBuilders; subject = nets/champion_selfplay.json wrapped
#    in makeProductionBotProfile, field = nets/champion.json likewise.)

# 4. If it genuinely improved (positive avgEdge with a CI that excludes 0,
#    ideally checked per player-count too so you're not shipping a regression
#    at some table size in exchange for a win at another):
cp nets/champion_selfplay.json nets/champion.json
```

## Promoting to production

`champion.json` and `bot_params.json` are the only two files in `nets/`
tracked in git (everything else — `*_log.csv`, `champion_selfplay.json`,
`champion_seed.json`, `champion_round*.json`, `latest.json` — is gitignored
training scratch, see `nets/.gitignore`). After overwriting `champion.json`:

- `online/backend/src/state/serverState.ts` loads `TRAINED_NET`/`TRAINED_PARAMS`
  **once at module load** (server startup), as module-level constants — it
  does not hot-reload. Overwriting the file on disk is safe to do while a
  server is running (won't disturb an in-progress game), but the new weights
  only take effect after the backend process restarts.
- Commit `champion.json` (and `bot_params.json` if that also changed) — they're
  real production artifacts, not scratch.
- Re-run the backend test suite (`npm test` in `online/backend`) — none of it
  should depend on the net's specific weights, but it's a cheap sanity check
  that nothing about the promotion broke loading/shape assumptions
  (`inputDim === STOCK_FEATURE_LEN` etc.).

## Gotchas

- **`inputDim` must equal `STOCK_FEATURE_LEN`.** `abWinRate.ts` checks this
  explicitly; `trainSelfPlay.ts`'s `--resume`/`--champion` path derives
  `INPUT_DIM`/`HIDDEN`/`OUT_SCALE` from the loaded checkpoint itself, so it'll
  silently keep training an old-shaped net if you accidentally point it at a
  stale checkpoint from before a legitimate schema change. If you ever *do*
  intentionally resize the schema (a bigger decision than this skill covers),
  you cannot warm-start from a differently-shaped checkpoint — that requires
  the `--zeroInputs` seeding path in `trainSelfPlay.ts` (zero the new columns'
  weights so the seed net behaves identically to the deployed one before
  self-play learns the new columns from a clean baseline) or training from
  scratch with `trainStockValueNet.ts`.
- **Determinism.** Every game is seeded (`gameSeed` for the engine's RNG,
  `tickSeed` for bot-decision RNG), and validation uses a seed band
  (`VAL_SEED_BASE = 100_000_007`) disjoint from training seeds — don't reuse
  that constant for anything else that needs to stay independent of training.
- **`stuck` games are excluded, not penalized.** A small fraction of games hit
  a livelock/engine-cap edge case regardless of weights; both training fitness
  and validation drop them rather than scoring them as a loss, so a candidate
  can't be graded on dodging or causing a seed-driven stuck game. Common
  random numbers per generation mean roughly the same games stick across
  candidates anyway, so this doesn't meaningfully bias selection.
- **`avgEdge` averages across table sizes; `minEdge` is the regression guard.**
  Promotion in `trainSelfPlay.ts` only checks `avgEdge` — a net can be promoted
  even if it slightly regressed at one table size, as long as the average
  improved enough. Look at `minEdge` and the per-count breakdown
  (`v.perCount`) before promoting to production if you care about not
  regressing any specific player count.
