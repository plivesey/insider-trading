# Current Task — Optimize bot's hand-coded constants with Evolution Strategies

Plan file: `~/.claude/plans/i-d-like-to-improve-curried-sun.md`
Working dir for all commands: `online/backend`

## Goal
The stock-valuation net (`nets/champion.json`, trained earlier) is done and beats the
heuristic at all table sizes 2–5p. Now optimize the **~29 remaining hand-coded bot
constants** (bidding/auction, action-card valuation formula numbers, goal weighting,
personality offsets) with the same ES approach, holding the net fixed.

## Decisions locked in
- **Scope: bot-strategy constants only** (not game-rules/balance). Objective = win-rate.
- **Keep action-card formulas; tune the magic numbers inside them** (not flat costs).
- **Remove bot variety during training** — single strongest config; add variety back later.
- Candidate = net + tuned params; **baseline field = net + default params** (so gen 0 ≈
  baseline, edge ≈ 0, then ES climbs). Method mirrors the net: placement fitness, CRN,
  seat rotation, per-count validation over 2–5p, champion by best avgEdge.

## Status: implementation ~done, training not yet run

### Completed
- [x] **Task 8** — `src/bots/botParams.ts`: `BotParams` (29 fields), `defaultBotParams()`,
  `PARAM_SPECS` (min/max/int), `encodeParams`/`decodeParams` (sigmoid↔range), `defaultVector()`,
  `makeBotProfile(params, net?)`.
- [x] **Task 9** — Threaded params through the bot:
  - `src/bots/profile.ts`: widened 4 offset fields to `number`, added required `params: BotParams`,
    `createBotProfile` attaches `params` (defaults + its random offsets).
  - `src/bots/decide.ts`: `winnerMargin`, `loanCostOffset`, `openingDiscount` (was random `rng.int(2)`
    → now single constant), `emergencySellCash`, `ownedColorWeight` read from `profile.params`.
    `effectiveBidCeiling`/`nextLoanCost` now take params.
  - `src/bots/valuation.ts`: `SPECIAL_BUMP`→params, all `actionCardBaseValue` literals→params,
    `rewardCashEquivalent` multipliers/flats→params, `goalBumpPerStock` `total+3`/`gap>2`→params,
    `secondHighestMarketStock` fallback→params. Added optional `params=DEFAULTS` args so non-profile
    callers still match today.
  - `src/bots/valueNetFeatures.ts`: encoder passes `profile.params` to goalBump/bestGoalBump.
  - Left `actionHeuristics.ts` play-thresholds frozen (intentionally not optimized).
- [x] **Task 10** — `src/bots/esCore.ts` (NEW): `hashSeed`, `gaussianVec`, `rankUtilities`,
  `esStep(theta, evalFn, opts)`. Refactored `scripts/trainStockValueNet.ts` to use it (no behavior
  change). Generalized `src/bots/evaluate.ts` to `evalSubjectVsField` + `evalAcrossCountsBuilders`
  (builder-based); `evalNetVsHeuristic`/`evalAcrossCounts` are now thin wrappers.
- [x] **Task 11** — `scripts/trainBotParams.ts` (NEW): ES over the param vector. Loads
  `nets/champion.json`, `theta=defaultVector()` (or `--resume`), CRN games across 2–5p, placement
  fitness vs default-params field, `esStep`, per-count validation, champion → `nets/bot_params.json`.
- **Build + full test suite green** after every step (104 tests). Parity guard: existing
  `bot_valuation.test.ts` asserts default-profile valuations unchanged.

### Remaining
- [x] **Task 12a — Tests**: `tests/unit/botParams.test.ts` (6 tests, pass): encode/decode
  round-trip, `defaultVector()`→defaults, bounds/int clamping, special-bump + reward parity,
  `makeBotProfile`. Full suite 110 green; build clean.
- [x] **Task 12b — Smoke**: param trainer avgEdge rose ~0→+3.9% in 20 gens; NN trainer (esStep
  refactor) smoke OK.
  - **FIX applied**: continuous params made `perceivedCardValue` fractional → invalid bids → all
    games stuck. Now `Math.floor(perceivedCardValue(...))` at both bid sites in `decide.ts`
    (no-op at integer defaults, so parity holds).
- [x] **Task 12c — Trained to plateau**: iter1 (250 gens) → avgEdge ~10%; annealed resume iter2
  (sigma .08/lr .03) → ~14% nominal; iter3 (sigma .05/lr .02) held at ~14% (plateau). Champion =
  `nets/bot_params.json`. Added `scripts/abBotParams.ts` (net+params vs net+defaults | random,
  per-count A/B).
- [x] **Task 12d — Final A/B (2400 games/count)**: tuned bot beats BOTH baselines at every size,
  CIs all above fair share:
  - vs default-params bot: 2p 60.1% / 3p 42.2% / 4p 37.8% / 5p 31.4% (~+11% avgEdge)
  - vs random-personality (deployed) bot: 2p 58.8% / 3p 46.9% / 4p 36.2% / 5p 30.8% (~+11% avgEdge)
  - What changed: bot was overpaying for action cards + Wild Shares; optimizer trimmed those
    (wildShareValue 4→2.1, most action-card values −15..30%), valued Hostile Takeover more.
- **DONE. Build clean, 110 tests pass.**

### Productionization (DONE — 2026-06-29)
- [x] **Min-bid bidding** (`decide.ts`, `profile.ts`): model returns `maxBid` (effectiveBidCeiling);
  `minBid = maxBid − rand(0..3)` drawn once per auction (cached in new `profile.auctionBidOffsets`,
  reset in createBotProfile/withValueNet/makeBotProfile). Opener opens at `minBid`; responder bids
  `max(minBid, currentHigh+1)` up to `maxBid`, else pass. `openingDiscount` retired (kept as
  @deprecated field for JSON/vector compatibility). New `auctionOffset()` helper.
- [x] **Production wiring** (`serverState.ts`): loads `nets/champion.json` + `nets/bot_params.json`
  once at module load (from `../../nets`, server runs from `src/` via tsx). `addBot` now builds bots
  with `makeProductionBotProfile(botRng, TRAINED_NET, TRAINED_PARAMS)`. ON by default, NO flag;
  heuristic-only path removed from production (`createBotProfile`/`withValueNet` kept for eval/tests).
- [x] **Variety** (`botParams.ts` `makeProductionBotProfile`): jitters ONLY action-card-valuation
  knobs (`VARIETY_ACTION_KEYS`: actionOffset + action-card constants + reward mults) by ±15% of each
  param's range, clamped to bounds, plus `hotTipThreshold` redrawn 0..2. Everything that feeds the
  net (stockOffset, wildShareValue, bump*, goal-progress params) and all bidding constants stay
  fixed at trained centers (user: "no bidding change outside the net except the min bid").
- [x] **Latent bug fixed**: `pick_market_card` bot decider now excludes the card under auction
  (engine forbids grabbing it). Surfaced by the RNG-stream shift from the new offset draws.
- [x] **Verified**: build clean; 113 tests pass (added 3 `makeProductionBotProfile` tests — bounds,
  excluded-params-fixed, knobs-actually-vary). A/B 2400 games/count under the NEW bidding still beats
  both baselines at every size (no regression; slightly better at 3-5p):
  - vs default-params: 2p 60.0 / 3p 48.7 / 4p 41.0 / 5p 33.8
  - vs random (deployed): 2p 59.5 / 3p 44.3 / 4p 36.5 / 5p 29.1
  → min-bid change did NOT regress the trained constants, so NO retrain needed.

### Net retrain via iterated self-play (DONE — 2026-06-29)
Context: the net was trained in the OLD environment (heuristic opponents, deterministic opening,
no production variety). After freezing the params + shipping min-bid + variety, the net was stale.
Retrained it IN the new environment via iterated self-play vs the current champion.
- [x] **`scripts/trainSelfPlay.ts`** (NEW): iterated self-play ES. Each round warm-starts from the
  current champion; OTHER seats play the frozen champion net; all seats use trained params +
  variety + min-bid. Placement fitness; validation = candidate vs frozen champion across 2-5p.
  Promote-on-gain → that net becomes next round's opponent; stop when a round can't beat it.
  Writes `nets/champion_selfplay.json` (NEVER touches champion.json mid-run).
- [x] **Domination-aware selection** (key fix): first run's plain `avgEdge` metric drifted toward
  nets that crushed 3-5p but REGRESSED heads-up at 2p. Fixed: a candidate is only eligible if it
  doesn't regress at ANY count (`minEdge >= minEdgeFloor`, default -1% for noise); among those,
  maximize avgEdge. Guarantees a strict all-count improvement.
- [x] **`scripts/abNets.ts`** (NEW): A/B two nets head-to-head, both in production profile
  (params + variety + min-bid), per-count with CIs. The "did the retrain beat the old champion?" test.
- [x] **Result**: Round 0 promoted (+19.4% avg edge over original champ, dominating all counts);
  Round 1 found no candidate that beats the Round-0 net at every count → clean plateau (stable).
- [x] **Verified (2400 games/count)** then PROMOTED `champion_selfplay.json` → `champion.json`:
  - new net vs ORIGINAL champion (both + params + variety): 2p 53.4 / 3p 50.1 / 4p 54.1 / 5p 55.3,
    every CI above fair share (incl. heads-up 2p) — uniform improvement, no regression.
  - sanity vs heuristic (abWinRate, 4p): 40.9% (fair 25%) — still dominant.
  - frozen params still help under new net (abBotParams --vs default): 2p 61 / 3p 43 / 4p 34 / 5p 29,
    all above fair share (param edge naturally smaller at 4-5p under a stronger net, but positive).
- [x] Build clean; 113 tests pass after promotion. Production (`serverState.ts`) loads champion.json
  at startup, so the copy is the deploy.
- Params (`bot_params.json`) frozen throughout; only the net changed.

### Deferred (optional)
- [ ] gitignore scratch (`nets/*_log.csv`); keep `champion.json` + `bot_params.json`.
- [ ] Could iterate self-play again later (each major env change makes the net stale).

## Key commands (run in `online/backend`)
- Build: `npm run build`   · Tests: `npm test`
- Train params: `tsx scripts/trainBotParams.ts [--gen --pop --games --sigma --lr --valEvery --valGamesPerCount --resume --out]`
- A/B a champion net: `tsx scripts/abWinRate.ts nets/champion.json --games 2400 --seats 4`
  (NOTE: abWinRate currently evaluates a *net* vs heuristic; for params we need the final A/B
  to compare net+params vs net+defaults — may add a small `abBotParams.ts` or reuse
  `evalSubjectVsField` in a one-off script during Task 12d.)

## Artifacts
- `nets/champion.json` — trained stock net (DONE, ship-ready).
- `nets/bot_params.json` — optimized constants (produced by Task 12c). Human-readable JSON.
- Scratch logs: `nets/training_log.csv` (net), `nets/bot_params_log.csv` (params).

## Notes / gotchas
- `openingDiscount` deliberately changed random→constant (the "how to bid" knob) — exact
  full-game RNG parity vs pre-refactor is not expected, but per-decision valuations with defaults
  are unchanged (guarded by tests).
- Always build fresh profiles per game (`makeBotProfile`/`createBotProfile` reset
  `auctionCeilings`/`knownPeekedTips`).
- ~2.5% of headless games livelock (pre-existing engine edge case); eval/trainer exclude stuck games.
