# Bot training & experiment scripts

All commands run from `online/backend`. Scripts run with `tsx` (no build step needed):

```bash
cd online/backend
npx tsx scripts/<script>.ts [flags]
```

## Bot architecture (what gets trained/tuned)

A bot's decisions come from three pieces, combined in `makeProductionBotProfile`
(`src/bots/botParams.ts`):

1. **The stock-valuation net** (`nets/champion.json`) — a tiny MLP that scores how much a
   colored stock / Wild Share is worth. Trained by Evolution Strategies (ES). This is the main
   "brain"; it drives bidding.
2. **Hand-coded constants** (`nets/bot_params.json`) — bidding margins, action-card valuation,
   goal weighting, etc. (`BotParams`). Tuned by ES separately.
3. **Heuristics** in `src/bots/decide.ts` — which market card to auction, when to sell, the
   Market-Order buy strategy, goal claiming. Not learned.

**Shipped artifacts** (committed, loaded by `serverState.ts` at startup): `nets/champion.json` +
`nets/bot_params.json`. Everything else in `nets/` is scratch and gitignored
(`champion_seed.json`, `champion_round*.json`, `champion_selfplay.json`, `*_log.csv`).

---

## Training the net

### Iterated self-play (the current/preferred trainer) — `trainSelfPlay.ts`
Retrains the net by playing candidates against the **current champion** across table sizes 2-5,
keeping the best-by-average-edge checkpoint and annealing the step size.

```bash
npx tsx scripts/trainSelfPlay.ts \
  --gen 200 --pop 28 --games 16 \
  --sigma 0.05 --lr 0.03 --annealTo 0.3 \
  --valEvery 20 --valGamesPerCount 400 \
  --promoteThreshold 0.015 --maxRounds 4 \
  [--zeroInputs 38,39]
```
- Warm-starts from `nets/champion.json`; each round's promoted net becomes the next round's field.
- Writes the best net to `nets/champion_selfplay.json` (never touches `champion.json`).
- `--zeroInputs i,j` zeros the w1 columns for those feature indices after loading, so newly-added
  features start with **no effect** (the seed then behaves identically to the deployed champion).
  It also saves that seed to `nets/champion_seed.json` for honest A/B.

### Net vs heuristic (original trainer) — `trainStockValueNet.ts`
Trains a net from scratch (or `--resume`) against pure-heuristic opponents.
```bash
npx tsx scripts/trainStockValueNet.ts --gen 250 --pop 32 --games 16 [--resume nets/champion.json]
```

### Tuning the hand-coded constants — `trainBotParams.ts`
ES over `BotParams` (holds the net fixed). Produces `nets/bot_params.json`.
```bash
npx tsx scripts/trainBotParams.ts --gen 250 [--resume nets/bot_params.json]
```

> ⚠️ **Self-play is non-transitive.** Round-over-round "edge vs the previous champion" can be
> illusory (round N beats N−1 yet loses to the original). **Always validate a candidate directly
> against the seed** with `abNets` before trusting/promoting it.

---

## Evaluating a net (A/B)

| Script | Compares | Use |
|---|---|---|
| `abNets.ts <subject> <field>` | net vs net, both in production profile | the real "did it improve?" test (e.g. `abNets champion_selfplay.json champion_seed.json`) |
| `abWinRate.ts <champion>` | net vs heuristic | quick sanity that a net still dominates heuristics |
| `abBotParams.ts <bot_params> [--net N]` | tuned params vs default/random params | did the constant-tuning help under a given net |

```bash
npx tsx scripts/abNets.ts nets/champion_selfplay.json nets/champion_seed.json --games 2400
npx tsx scripts/abWinRate.ts nets/champion.json --games 2400 --seats 4
npx tsx scripts/abBotParams.ts nets/bot_params.json --net nets/champion.json --vs default --games 2400
```
All report per-count win rate vs fair share (1/players) with 95% CIs. A 2p regression is acceptable
if 3-5p improves a lot — a single net can't be optimal at every player count.

**Promote** a candidate by copying it over `nets/champion.json`, then `npm test`.

---

## Experiments

### Rule-change game-length experiment — `measureGameLength.ts`
Runs the current ruleset (`DEFAULT_RULES`) as a baseline plus rule variants, reporting total turns
(mean / p50 / p90), the delta vs baseline, and the goal-vs-tip end split.
```bash
npx tsx scripts/measureGameLength.ts --games 1000 --counts 4,5
```
Edit the `VARIANTS` array to define configs (each is a `Partial<RulesConfig>`; combos merge them).
Note: with `1+2+3` now the default, the harness `baseline` = the shipped game.

### Bot goal-pursuit / end-reason diagnostic — `analyzeGoals.ts`
How well bots complete goals, plus turns and the tip-vs-goal end split. `--trace` dumps one game.
```bash
npx tsx scripts/analyzeGoals.ts --net nets/champion.json --games 300 --seats 4 --trace
```

### Emergency-sell threshold A/B — `abSell.ts`
Compares emergency-sell trigger variants (cash threshold × min-loans) vs the current rule.
```bash
npx tsx scripts/abSell.ts --games 1500 --counts 2,3,4,5
```

---

## Rulesets

`createGameState` takes an optional `rules: Partial<RulesConfig>` merged over `DEFAULT_RULES`
(shared/state.ts). `DEFAULT_RULES` is the shipped game (the "1+2+3" config); `CLASSIC_RULES` is the
original V4 game (used by engine-mechanics unit tests). Knobs: `startingBuyCard`, `goalStopCount`,
`extraGoals`, `tipReduction` (tips floored at `MIN_TIPS=4`).

## Verifying changes
```bash
npm run build   # tsc --noEmit
npm test        # full suite
```
