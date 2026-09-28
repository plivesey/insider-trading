# V5 Open Tuning Questions & Ideas

Running list of things we've deliberately deferred while designing the next
version (V5) — decided "good enough for now, needs playtesting" rather than
settled. Check back here before/while playtesting; move an item into
`rules.md` once it's settled and delete it from here.

## 1. Initial goal-reveal count at setup

Setup reveals goal cards face-up from the shuffled event deck until **4**
are found. For now this is a flat 4 regardless of player count. The old V4
ruleset scaled goals-in-play with player count (`players + 3`). Worth
testing whether a flat 4 works across 2–6 players or whether it should
scale similarly (e.g. more goals revealed at setup for more players).

## 2. Progress tracker end-game threshold

Currently **3 × players + 2** (8 / 11 / 14 / 17 / 20 for 2–6 players),
changed from a flat **4 × players** (8 / 12 / 16 / 20 / 24) after
playtesting found games running too long, especially at higher player
counts. Needs more playtesting to confirm 3×+2 is the right slope/offset;
still just a placeholder.

Dated game-length benchmarks (mean/percentile turns per player count,
bot self-play) are tracked in `v5_game_length_log.md` — check there before
changing this knob, and add a new dated entry after any change that might
affect pacing.

## 3. Merged event deck card counts — RESOLVED: expanded to 47 cards

The original merge carried over V4's 16 market-movement cards (8 crash / 4
surge / 4 slump) + 14 goal cards (4 pair / 4 three-of-a-kind / 6 two-pair)
unchanged, into one 30-card deck. This turned out too small once the
Alternate variant deals straight from the event deck at setup (see item 13):
a 4-player Alternate game was leaving only ~10 cards in circulation for the
rest of the game. Expanded (2026-09-19) to 47 cards total:
- **Market-movement, 28** (was 16): 12 crash (was 8, +1/color), 4 surge
  (unchanged), 6 slump (was 4, now covers all 6 color pairs — resolves item
  4 below), 6 shift (new type: one color +2, the other -2, all 6 pairs).
- **Goals, 19** (was 14): the original 14 unchanged, + 4 Four of a Kind
  (very_hard, own 4 of one color, $12 reward) + 1 Full Spread (medium, own 1
  of each color, $6 reward).

Also added: the `GoalCard.difficulty` field now includes `'medium'` and
`'very_hard'` (was just `'easy' | 'hard'`) to label the two new goal tiers.

Caveat found while balancing this: adding more Crash (bearish) with no
added Surge (bullish, deliberately not added) means Slump+Shift can no
longer offset Surge to net exactly $0 per color like the original 16-card
deck did. The math only allows 2 of the 4 colors to land back at net $0;
Green and Purple absorb the rest, netting **-4** each (see
`tests/insider_tip_cards.test.js`'s balance test for the exact numbers).
Partially offset by item 15 below (one dice face changed from Nothing to
Bull). Worth revisiting if playtesting shows Green/Purple feeling
noticeably worse to hold than Blue/Orange.

## 4. Slump-card color-pair asymmetry — RESOLVED

Slump now covers all 6 possible color pairs (was 4 of 6, missing the two
"diagonal" pairs Blue-Purple and Orange-Green) — see item 3.

## 5. Informant naming

Informant's ability just changed from "peek 1 on sell" to "peek top 2 on
buy" — its trigger condition is now the same as Scout's (both trigger on
buy), and the name no longer references selling. Purely cosmetic/flavor;
consider a rename once the new specials are finalized.

## 6. Event deck exhaustion is now a non-event

Deck exhaustion and "only 2 goals remain" are no longer game-end
conditions — the progress tracker hitting its threshold is the only end
trigger now. Because the full ~30-card merged deck stays in play (rather
than a small curated subset like the old Insider Tip deck), running the
deck dry is expected to be essentially unreachable in practice. If it
somehow does happen mid a multi-card draw, no special handling: just
resolve whatever cards remain and nothing else happens.

## 7. Black Market action card — RESOLVED: removed

Black Market's V4 mechanic ("auction a face-down Insider Tip from the
unused-tip pool") had no analog in V5, since the whole event deck goes
into circulation at setup with no leftover pool. Decided: the card is
removed entirely rather than redefined. At the time, this made the Market
Deck 36 stock + 15 action = 51 cards (11 V4 actions carried over + 4 new
Broker cards); both the Market Deck and event deck sizes have since changed
again (Market Deck now 47 for Classic after further action-card cuts; event
deck now 47 after item 3's expansion) — see `rules.md`'s Components section
for current numbers.
`rules.md`, `cards/action_cards.json`, and the online migration plan
(`online/V5_MIGRATION_PLAN.md`) all reflect this.

## 8. Insider Source now might draw a goal card

Since Insider Source draws from the merged event deck, it can now surface
either a market-movement card (as before) or a goal card. `rules.md`
currently treats a drawn goal card as becoming a private goal for that
player, same as one drafted at setup — this is an inferred extension, not
something you explicitly specified, so double-check it's what you want.

## 9. Color-blindness risk: Orange vs. Green

Swapping V4's Yellow for **Green** (Rail) means the four stock colors are
now Blue, Orange, Green, Purple. **Orange and Green are a known problem
pair for red-green color blindness** (deuteranopia/protanopia, ~8% of
men) — both can shift toward a similar brownish/olive hue, which is a
common accessibility complaint in board games that put those two colors
next to each other. Blue and Purple can also be mixed up by some
colorblind viewers, though it's usually a milder issue than Orange/Green.

The game already has a built-in mitigation: each color's cards carry a
distinct **thematic icon** (`icon-oil.png`, `icon-rail.png`,
`icon-steel.png`, `icon-bank.png` in `cards/assets/`), so as long as
every physical card and the price board show the icon alongside the
color swatch (not color alone), colorblind players have a non-color way
to tell stocks apart. Worth double-checking that convention holds
everywhere before finalizing card art — the price board in particular
should show icons, not just colored bars. Consider running a colorblind
simulator over the final card/board art before printing.

## 10. Broker card names are drafts

Oil Broker / Rail Broker / Steel Broker / Bank Broker (the new $2-auction-
discount persistent cards) are placeholder names — open to change once
finalized.

## 11. Private market-movement cards can stall the progress tracker

A privately-held market-movement card only ever gets played if its holder
wants to (playing cards is "any time," never mandatory). A rational player
holding a card that's currently harmful to their own portfolio (e.g. a
crash on a color they're heavily invested in) has no incentive to ever play
it. Discovered via bot self-play at 6 players (where more event-deck cards
get siphoned into the initial draft and end up privately held): it's
possible for every remaining path to +1 progress to be simultaneously
unappealing to whoever holds it, so the progress tracker can sit forever a
few points short of threshold with no way to force a resolution.

The online implementation works around this for bots with a heuristic
fallback (a bot eventually force-plays its least-bad held card after ~400
turns of no tracker movement — see `online/backend/src/bots/decide.ts`),
but that's a bot-AI patch, not a rules fix. Worth deciding whether the
physical rules want an explicit tie-breaker for this case (e.g. "a player
holding a market-movement card must play it before their Nth turn," or a
house rule that the game ends in a stalemate scored as-is after some fixed
number of turns) — not urgent since it seems to require an unlucky
combination of hands, but real enough that it showed up in automated
testing.

## 12. Starter-draft card value ledger & balance pass

Ran a 9,921-game all-bot simulation correlating each player's *drafted*
starting 3-card hand with final placement, broken out per individual card
(not just category) — [The Setup Draft Ledger](https://claude.ai/code/artifact/3b5a775c-c66a-4a9a-8e92-2b64ab60166a).
Headline pattern: **Basic Starter Stocks > Starter Action Cards ≈ Hidden
Bonus Cards ≈ Insider Tip Cards > Goal Cards**, fairly consistently — a
plain stock in hand is unconditional, sellable value from the moment the
draft ends, while a goal only pays off if you actually complete it before
the (now shorter, see item 2) game ends.

Caveat: this reflects value *given how the bots currently draft and play*
— bots actively choose what to keep, so a card's measured value partly
reflects the bots' own (heuristic-only) sense of what's good, not
necessarily the card's true power at a human table.

First balance changes made off this data (2026-09-15), aimed at
strengthening the weakest action cards:
- **Market Panic**: every other player loses $4 (was $3).
- **Double Down**: no longer costs $2 to play — just resolve another
  single-use action card in hand twice, for free.

Worth re-running the simulation after these land to see whether they moved
the needle, and considering similar targeted buffs for the other
consistently-weak actions (Foresight, Double Down were the two lowest
before this change) and goal cards generally.

## 13. Alternate setup variant

A second selectable setup variant, "Alternate," now exists alongside the
Classic rules described throughout `rules.md` (see its "Alternate Setup
Variant" section for the full spec). Summary: an 8-card basic-stock-only
starter deck (1 dealt per player, no draft), a 4-card event-deck-only
initial draft (still ending in a 3-card drafted hand, +1 dealt stock = 4
cards to start), Foresight/Backroom Deal/Double Down promoted from starter
actions into the Market Deck (14 action cards total, no hidden bonus cards),
and a flat 4×players progress threshold instead of Classic's 3×+2.

This was also, incidentally, a partial reversion of item 2 above (4×players
was the pre-3×+2 default) — but only for Alternate; Classic's threshold is
unchanged. The threshold tuning in item 2, the deck-composition numbers in
item 7 (now 36+11=47 for Classic, not 51), and the starter-draft value
ledger in item 12 are all Classic-only observations — none of them have been
re-run or re-validated for Alternate yet. Worth doing so once Alternate gets
some real playtesting.

## 14. Total card exhaustion can deadlock a marathon game (found via Alternate bot testing)

While stress-testing Alternate with very long (tens-of-thousands-of-ticks)
bot-vs-bot games, one seed (6 players, seed 1234) hit a state where the
market, the main deck, AND the discard pile were all simultaneously empty —
every physical Market Deck card had ended up permanently held in a player's
hand (mostly via goal completions, where "your stocks stay in your hand"
per rules.md). With market empty, no auction is possible; with nothing
sellable either, decideTurnAction correctly has no legal move, and the game
deadlocks (an actual `it.each` test hits this, not just a slow game —
raising the tick budget to 100,000 didn't resolve it).

This isn't a Corner-the-Market/Fire-Sale/etc. bug — those specific "no
eligible card" cases now fizzle gracefully (fixed alongside the Alternate
work, see `promptResponse.ts`'s `pick_market_card` handler and
`turn.ts`'s `drawTopOfDeck`, which also had a related refill-starvation bug:
cards returning to `mainDeck` via a reshuffle from a Hostile Takeover/First
Look draw weren't triggering `refillMarketIfNeeded`, so a starved market
could stay stuck at 0 even after mainDeck was replenished). This is instead
total, genuine exhaustion of the shared card pool — the rules.md "Deck
Reshuffle" section assumes this is "essentially unreachable in a normal
game," which is true for a normal ~20-turn game but not for the kind of
extreme marathon (tens of thousands of ticks) a bot stress-test can produce
when it also gets stuck in unproductive loops (see item 11's Hostile
Takeover-style back-and-forth). Needs an actual rules decision (e.g. does a
turn just pass with no action when this happens? does the game force-end?)
rather than an engine-only patch. The failing seed is currently just avoided
in the Alternate bot-game test suite rather than fixed.

## 15. Dice bag rebalanced: one more Bull face

To partially offset item 3's bearish-leaning Event Deck expansion (more
Crash, no added Surge), Mixed-draw die C's third "Nothing" face was changed
to "Bull" (`online/shared/src/dice.ts`). Chosen because C (along with
Draw-heavy D) was one of only two dice with zero existing Bull/Bear faces,
so the change is a light, contained nudge rather than amplifying an
already-Bull-heavy die (A/B). Not an exact numeric offset — just a rough
counterbalance; worth re-measuring average price drift over a full game
once there's been some playtesting.

## 16. Dice bag: fewer big multi-card draws

Mixed-draw C's "Draw 3" face was toned down to "Draw 2", and one of
Draw-heavy D's three "Draw 2" faces was toned down to "Draw 1"
(`online/shared/src/dice.ts`). There is no longer a "Draw 3" face anywhere
in the bag — `DieFace`/the `draw3` case in `engine/turn.ts` are left in
place (harmless dead code) rather than removed, since old game logs and
replays still legitimately contain `draw3` events. Net effect: fewer
big multi-card event-deck draws per 6-turn bag cycle, which also modestly
slows how fast the progress tracker (and Event Deck) depletes.

## 17. Goal card re-theme + reward balance pass

Following on from item 12's "goal cards generally" note: goals were re-themed
per stock color (Bank=pure cash, Rail=insider-tip draws, Oil=market
manipulation/pump-and-dump, Steel=backchanneling/wheeling-and-dealing),
14 of the 19 cards' reward text/mechanics changed (`cards/goal_cards.json`),
the value net and `bot_params.json` were retrained against the new set, and
claim-rate/win-lift/Δwealth were re-measured via
`online/backend/scripts/analyzeGoalValue.ts` (3,000,000-game Alternate-variant
run) — [Goal Reward Ledger](https://claude.ai/code/artifact/7ad9bb3e-1572-451b-8572-785e208452b9).
See `.claude/skills/goal-balancing/SKILL.md` for the reusable process.

Headline finding: Rail's insider-tip theme is the weak link even after
buffing 2 Rail from a peek into a guaranteed card draw — still the lowest-lift
card in the set. Also surfaced a real engine bug (a draw-then-choose prompt
could demand more picks than the event deck actually had left, livelocking
the game) and confirmed Oil's Three-of-a-Kind ("sell any number of your
stocks" vs. the old forced "sell all") was being underplayed by the old bot
policy, not underpowered — same $3/stock value, opt-in selling flipped it
from underpaid to overpaid in the data.

**Follow-up rebalance (same artifact link, re-measured at 200k games/seat)**:
investigating *why* Four-of-a-Kind's Δwealth varies so much by color despite
an identical $12 reward (ledger's own "stock-holding confound" caveat) turned
up that Steel's Three-of-a-Kind ("swap one of your cards for a face-up
market card") was letting bots snipe a strong action card for free — the
mechanism behind a lot of Steel's outsized numbers. Moved that swap to the
harder 2 Steel+2 Rail slot (Two Pair), gave 3 Steel a plain $2-per-opponent
steal instead (doubled from Pair's $1), toned Steel+Oil's stock adjust
±3→±2, and widened Rail's draw-and-choose pool (2/3→3/4 cards looked at,
same keep count) on the theory that more selection should help a human even
if the bots can't exploit it. Re-measured: the swap relocation worked as
intended (3 Steel's Δwealth dropped from ~$18 to ~$14; the swap itself is
now the single strongest Two Pair card, so difficulty gating — not raw
power — is what moved). The Rail widening did not help in simulation — both
2 Rail and 3 Rail got *more* negative, consistent across all three player
counts — which was the predicted outcome going in, since the bots'
`rewardCashEquivalent` formula for this type has no concept of selection
quality. Left as a known bots-can't-use-it gap pending either a smarter
valuation formula or human-table validation.

## 18. Bot bidding/action-play weaknesses (found via human playtesting + a 10-game decision trace, 2026-09-27)

Human playtesting flagged four bot weaknesses; a new diagnostic script
(`online/backend/scripts/traceBotDecisions.ts`, production bots + champion
net, 10 games) confirmed two of them directly with concrete examples and
left two as code-audit-only findings (the trace sample didn't happen to hit
a dramatic case, but the root cause is unambiguous either way):

- **Bid-ceiling cliff (confirmed, 2 clear examples in 10 games)**:
  `effectiveBidCeiling` (`online/backend/src/bots/decide.ts`) collapses a
  bot's willingness to bid far below its own perceived value in two distinct
  ways. (a) Loan-capped: seed 31000 T13, Bot1 perceived a Green stock at $17
  but was already holding 2 loans (`MAX_LOANS`), so its ceiling collapsed
  straight to `cash` ($9) — it won the auction outright at $6, $11 under its
  own valuation, purely because nobody else happened to bid higher. (b) Even
  *without* being loan-capped, the smoothed branch caps at a hardcoded
  `cash + 10` (one loan's worth) rather than `maxAffordableSpend` (which
  accounts for *all* remaining loan headroom): seed 31009 T20, Bot1 perceived
  a Green stock at $20.33 with 0 loans, but its ceiling still capped at $13
  (cash $3 + $10), well short of the ~$23 two-loan headroom the EV gate had
  already confirmed was worth it. Both feed directly into Track 1's
  `loanWillingness` knob design.
- **Greedy tip-card play (confirmed, 9 examples in 10 games)**: bots
  routinely play a surge/shift card the instant it's net-positive off a
  single owned share (e.g. seed 31006 T1, T17; seed 31000 T4, T12, T22 — all
  "owned at play: `<color>`=1"). Exactly the "plays Rail +4 off one Rail
  card" pattern reported from playtesting. Feeds Track 1's
  `tipPlayDelayThreshold` knob.
- **End-game overbidding (confirmed with a follow-up 50-game trace + explicit
  goal-bump breakdown logging)**: the original 10-game sample didn't catch a
  dramatic example, but adding a `winnerGoalBump` field to
  `traceBotDecisions.ts` (prints the `goalBumpPerStock` component of the
  auction winner's own valuation, flagging any endgame auction where it's
  ≥30% of the price paid) found 3 clean examples in the next 50 games — e.g.
  seed 500 T33 [ENDGAME]: Bot1 wins an Orange/peek_sell stock for $10, of
  which $3.00 is a goal-completion bump baked into its perceived value, with
  the progress tracker already within 2 ticks of ending the game. The
  code-level cause was already certain (`progressThreshold`/`progressTracker`
  are never consulted anywhere in bidding or valuation — the one read of
  them, `decide.ts:306`, is an unrelated private-goal-claim-timing check) —
  this just puts concrete numbers on it.
- **Hidden opponent-hand risk**: not something this trace can observe
  directly (it would require deliberately engineering a scenario where an
  opponent is sitting on an unplayed crash/surge card). Deferred entirely to
  Track 2 (a new public-information-only `colorRisk` value-net feature) per
  plan.

Full trace output (2,086 lines) not checked in — regenerate with
`npx tsx scripts/traceBotDecisions.ts --games 10 --seats 4 --seed 31` if
needed for a fresh look.

### Track 1 implementation + bake-off (2026-09-27): none of the three hand-picked fixes beat control

Implemented all three diagnosed fixes as new `BotParams` fields (`loanWillingness`,
`endgameDiscountStrength`, `tipPlayDelayThreshold`, appended to the end of
`PARAM_SPECS` so ES vector layout is preserved), each defaulting to a value
that reproduces the old behavior byte-for-byte (verified: a 10-game trace
with all three at their default is identical, diff-for-diff, to the pre-change
trace). `nets/bot_params.json` was updated with the three new keys at their
no-op defaults (0), so the shipped champion is unaffected until one is
deliberately set nonzero.

- **`loanWillingness`**: `effectiveBidCeiling` (`decide.ts`) now grades a
  bot's loan-funded credit line rather than a flat `+$10`, but — after an
  A/B against control showed a first, looser version (which also relaxed the
  EV gate itself, not just the cap) net-negative — was narrowed to *only*
  extend the cap once the existing EV gate already says a loan is worth
  taking, never overriding the gate. Even in this narrower form it tested
  negative (see below).
- **`endgameDiscountStrength`**: shrinks a bot's `perceived` value as
  `progressThreshold - progressTracker` nears 0, at both the opening-bid and
  re-bid sites in `decide.ts`. Deliberately implemented in `decide.ts` itself
  rather than inside `valuation.ts`'s shared `goalBumpPerStock`/
  `rewardCashEquivalent` — those also feed the trained value net's input
  features, and discounting there would have silently shifted what the
  *already-trained* net receives without a retrain.
- **`tipPlayDelayThreshold`**: raises the auto-play bar in the market-movement
  loop from `score > 0` to `score > 0 && score >= threshold`.

**A new `tournamentVariants.ts` script** (seats 4 labeled `BotParams` variants
in one 4-player table, sharing the same value net) was built to bake off
candidate values. Its first version rotated seats via a deterministic
`(variant + game) % 4` cyclic schedule — this turned out to be a real bug: a
sanity check seating **four byte-identical control copies** against each
other showed a reproducible ~1pp "advantage" for whichever copy sat at array
index 3, persisting across three different `--seed` values. Root cause: a
fixed-period cyclic schedule locks every variant to exactly one seat within
each `game-number mod 4` residue class *forever*, so any structural
correlation between that residue and the outcome (however small, and
regardless of its source) never averages out per variant — it's fully
inherited by whichever variant is locked to the "lucky" residue/seat pairing.
Fixed by drawing a genuine Fisher–Yates random permutation each game instead
of a fixed formula; the four-identical-copies sanity check then came back
clean (all four indistinguishable, margin CIs straddling 0) across three
seeds. Left the fixed-schedule failure mode documented in the script's own
comments since it's a non-obvious trap for any future N-variant-in-one-table
bake-off design.

A second false lead: the first test of `tipPlayDelayThreshold` used a value
of 2, which turned out to be a mathematical no-op — every card's achievable
score is an even integer (deltas are only ever ±2/+4, so score = Σ delta ×
ownedCount is always even), and the auto-play condition is `score >=
threshold`, so `threshold=2` still passes every `score=2` case exactly like
`threshold=0` does. Confirmed via an exact trace diff (byte-identical output
with the deck-wide default at 2 vs. 0) before re-testing at `threshold=3`
(confirmed via the same diff method to actually change decisions).

**Final read, 50,000 games/variant (corrected random-permutation
methodology, `--seed 31`)**:

| variant | winRate | edge vs fair | meanMargin | 95% CI |
| --- | --- | --- | --- | --- |
| control | 25.6% | +0.6% | +0.354 | [+0.178, +0.529] |
| loanFix (loanWillingness=1) | 25.0% | +0.0% | **−0.401** | **[−0.578, −0.225]** |
| endgameFix (endgameDiscountStrength=0.5) | 24.9% | −0.1% | −0.046 | [−0.213, +0.121] |
| tipDelayFix (tipPlayDelayThreshold=3) | 25.4% | +0.4% | +0.094 | [−0.079, +0.266] |

**Conclusion: don't ship any of the three at the tested magnitudes.**
`loanFix` is robustly, significantly *worse* than control (bots taking on
loan-funded bids that don't pay off often enough to cover the loan's
end-game penalty). `endgameFix` and `tipDelayFix` are statistically
indistinguishable from control at n=50,000 — genuinely neutral, not a
disproven hypothesis so much as "this specific hand-picked magnitude doesn't
move the needle." All three `BotParams` knobs are left in place at their
no-op defaults (real weaknesses, confirmed via the trace; the fixes just
don't clear the bar in self-play at the values tried).

### ES search over all params, including the 3 new knobs (2026-09-27)

Ran `trainBotParams.ts --resume nets/bot_params.json --gen 200 --pop 32
--games 16` (full joint ES search over all 32 params, not just the 3 new
ones — resolves the open question above more thoroughly than hand-picking
more magnitudes would). Champion bar rose from 7.3% avgEdge (vs. raw
defaults) to **11.5%** at generation 160. Validated head-to-head against the
pre-ES `bot_params.json` with `abBotParams.ts <new> --vs <old_backup>
--games 3000`:

| count | winRate | 95% CI | vs fair | verdict |
| --- | --- | --- | --- | --- |
| 2p | 56.0% | 54.2–57.7% | 50.0% | beats |
| 3p | 39.8% | 38.0–41.6% | 33.3% | beats |
| 4p | 29.0% | 27.4–30.7% | 25.0% | beats |
| 5p | 21.6% | 20.1–23.0% | 20.0% | beats (narrowly) |

**Promoted** — this is now the shipped `nets/bot_params.json`. Confirms the
gain came from ES fine-tuning the ~20 *pre-existing* constants (owned-color
weight, special-ability bumps, action-card valuation floors, reward
multipliers), not from the 3 new knobs: ES converged `loanWillingness` to
0.00024 and `endgameDiscountStrength` to -0.0003 (both `<=0`, i.e. still
functionally off) and left `tipPlayDelayThreshold` at 0 exactly. This
independently corroborates the bake-off's conclusion via a completely
different method (a full joint search vs. two hand-picked points per knob)
— both agree these three specific mechanisms, as currently formulated,
aren't worth turning on. `abBotParamsFile` support (`--vs <path>.json`) was
added to `abBotParams.ts` to make this kind of old-vs-new head-to-head
validation reusable going forward.

### Track 2: value-net features — `progressRemaining` + `colorRisk` (2026-09-27, promoted)

Grew `STOCK_FEATURE_LEN` from 40 to 45 (`valueNetFeatures.ts`) to add two new
signals, both targeting gaps confirmed by the trace analysis above:

- **`x[40]` `progressRemaining`**: `(progressThreshold - progressTracker) /
  progressThreshold` — replaces the poorly-correlated raw `turnNumber/30`
  (x[31]) as the net's endgame-awareness signal. Unlike Track 1's
  `endgameDiscountStrength` (a blunt heuristic multiplier applied post-hoc in
  `decide.ts`), this lets the *trained net itself* learn how much to
  discount speculative value near the end, and how that interacts with
  everything else it already knows (goal proximity, cash, etc.) — the more
  principled long-term version of the same fix.
- **`x[41..44]` `colorRisk`**: signed price-drift risk still "out there" per
  color, computed from **public information only** — `state.resolvedEventCards`
  (what's already publicly resolved) and the bot's own hand, weighed against
  the fixed, publicly-known 28-card deck composition (12 crash/4 surge/6
  slump/6 shift; exact per-color/per-pair breakdown hardcoded as
  `CRASH_COUNT_PER_COLOR`/`SURGE_COUNT_PER_COLOR`/`PAIR_TIP_DEFS` in
  `valueNetFeatures.ts`). Deliberately never reads any other player's actual
  hand contents — per the design decision earlier in this item, bots should
  reason about hidden-card risk the way a sharp human could, not by cheating.

**Migration**: `champion.json`'s `inputDim` was 40 and its `w1` matrix sized
accordingly; growing `STOCK_FEATURE_LEN` alone doesn't touch a *loaded*
net's shape (`forward()` only reads `x[0..inputDim-1]`, so an unmigrated net
just silently ignores the 5 new slots). Wrote `scripts/growNet.ts`, a
one-time migration that pads `w1` with zero-initialized columns for the new
indices and verifies the grown net's forward pass is byte-identical to the
original across 80 sampled (state, color) pairs before writing anything —
confirmed clean.

**Retrain**: `trainSelfPlay.ts --champion <grown net> --zeroInputs
40,41,42,43,44 --gen 150 --pop 24 --games 16 --maxRounds 4`, output isolated
to scratch (never touched production `champion.json` mid-run). All 4 rounds
promoted internally (round-over-round edges of +16.0%, then two more, then
+19.4%) — per the training scripts' own non-transitivity warning, round-over-
round edges can be illusory, so the only number that matters is the final
head-to-head against the **original, unmigrated** champion:
`abNets.ts <champion_selfplay.json> <original champion.json> --games 3000`:

| count | winRate | 95% CI | vs fair | verdict |
| --- | --- | --- | --- | --- |
| 2p | 51.6% | 49.8–53.4% | 50.0% | ≈ par (no regression) |
| 3p | 37.7% | 36.0–39.4% | 33.3% | beats |
| 4p | 30.7% | 29.0–32.3% | 25.0% | beats |
| 5p | 28.6% | 27.0–30.3% | 20.0% | beats |

**Promoted** — this is now the shipped `nets/champion.json`. A genuine,
validated win at 3-5p with no regression at 2p, achieved in a single
overnight-scale run rather than the many-round tuning campaigns earlier
retrains needed — the new features gave the net real, previously-missing
signal to work with. `npm test` (218 tests, +3 new ones covering the two
features) and a 3,000-game `measureGameLength.ts` + 5,000-game
`analyzeGoalValue.ts` regression check both came back clean (game length
within ~1 turn of the pre-retrain baseline; goal claim%/lift/Δwealth
patterns consistent with the existing Goal Reward Ledger, no degenerate
behavior).

Old artifacts kept for reference (not checked in, but reproducible): the
pre-Track-2 `champion.json`/`bot_params.json` and the grown/pre-retrain net
are backed up under this session's scratch directory. Re-derive by
re-running `growNet.ts` against a git-historical `champion.json` if ever
needed.

## 19. The real root cause of "bots feel much worse now": Classic vs. Alternate, not a bidding bug (2026-09-28)

Playtesting the Track 2 champion above, the user steamrolled the bots
($121 vs $37/$22 final wealth in a 3-player game) and reported they felt
"way under-bidding." Pulled the real game log (`online/backend/game_logs/`
-- disk logging is on unconditionally for `npm run dev`, one `.jsonl` per
game) and replayed it with a new ground-truth diagnostic
(`scripts/analyzeRealGame.ts`): recomputing the folding bot's own
`perceived`/`maxBid` at the exact moment of every fold showed **every single
fold was mathematically rational given the bot's own valuation** -- no
bidding-cliff bug. The bots just valued several stocks meaningfully lower
than the human did (e.g. Purple bought by bots' opponents for $6-8 later
resold by the human for $15-16).

The real finding: **that game was played on the "Alternate" setup variant,
and `playOneGame` (the self-play function underlying every training/
validation script run this session -- `trainBotParams.ts`, `trainSelfPlay.ts`,
`tournamentVariants.ts`, `validateVsPool.ts`, all of it) never passed a
`variant` through to `createGameState`, so self-play always silently
defaulted to Classic.** Every ES retrain and value-net retrain this session,
and every validation that said "beats the old champion," was measured
against Classic games -- a setup the user wasn't even playing. The bots
weren't exploited by a clever human strategy; they were never trained or
validated on the ruleset actually being played.

**Decision: remove Classic entirely, make Alternate the only way to play.**
Rather than plumb variant selection through the self-play harness (which
would perpetuate a real ongoing risk of silently training/validating against
the wrong mode again), the game itself no longer has two modes:

- **Full removal from `online/`**: `GameVariant` type, `ALTERNATE_DEFAULT_RULES`/
  `VARIANT_DEFAULT_RULES` (Alternate's former rules are now simply
  `DEFAULT_RULES`), the `variant` field on `GameState`/`ProjectedGameState`,
  the `variant` param on `createGameState`/`ServerHub.startGame`, the
  `/api/start` request field, and the Lobby ruleset dropdown are all gone.
  `setup.ts`'s Classic dealing branch (24-card starter-deck draft pile) and
  `turn.ts`'s Classic Scout-peek branch are deleted -- there's only one
  setup/resolution path now. `CardCatalog.alternateStarterStocks` renamed to
  `starterStocks` (the `alt-` prefix no longer means anything); `starterDeck`
  (the 24-card Classic deck) is kept loaded as a data source since several
  unit tests use it as a fixture for specific named cards (Windfall, hidden
  bonus cards), even though no real game deals from it anymore.
  `bumpPeekBuy` in `BotParams` is now vestigial (Scout always values via
  `drawTipValue`) -- left in place rather than resized out of the ES vector.
  Merged the duplicate `bot_full_game.test.ts` describe blocks (Classic +
  "Alternate variant" were testing near-identical things once there's only
  one setup) into one, preserving the known seed-1234-at-6-players exclusion
  (`v5_tuning_notes.md` item 14).
- **Full retrain from scratch under the now-only ruleset**: with Classic
  gone, `playOneGame` unconditionally builds Alternate-shaped games, so
  simply re-running the existing training scripts retrains correctly with no
  special flag needed.
  - `trainBotParams.ts --resume nets/bot_params.json --gen 200`: avgEdge
    7.3%->9.6%. Validated head-to-head vs. the pre-retrain (Classic-tuned)
    params: beats at 4p (30.0% vs 25% fair)/5p (22.5% vs 20% fair), at-par at
    2p/3p. Promoted.
  - `trainSelfPlay.ts --champion nets/champion.json --params
    nets/bot_params.json --maxRounds 4`: all 4 rounds promoted internally.
    Validated head-to-head vs. the pre-retrain (Classic-trained) champion
    with `abNets.ts`, 3000 games/count:

    | count | winRate | fair | verdict |
    | --- | --- | --- | --- |
    | 2p | 55.3% | 50.0% | beats |
    | 3p | 49.0% | 33.3% | beats |
    | 4p | 36.8% | 25.0% | beats |
    | 5p | 30.9% | 20.0% | beats |

    A decisive win at every table size -- much larger than the params-only
    retrain's edge, confirming the old net was meaningfully miscalibrated for
    a game shape it was never actually trained on. Promoted.
- **Full regression sweep**: `npm run build` + `npm test` clean across the
  whole `online/` workspace (backend 195 tests, frontend 32 tests -- both
  updated for the removed variant: merged/renumbered Scout tests, updated
  hardcoded threshold-formula expectations from 3x+2 to 4x+1 throughout,
  removed the dropdown's Lobby/CardTile tests). `measureGameLength.ts`
  (3000 games/count) and a 5000-game `analyzeGoalValue.ts` spot check both
  came back with no degenerate patterns (Rail still weakest goal color,
  consistent with the existing Goal Reward Ledger).

**Lesson for future retrains**: `playOneGame`/`createGameState` no longer
have a variant concept to get wrong, so this specific failure mode can't
recur -- but the general lesson (verify what self-play actually simulates
matches what's actually shipped/played) is worth remembering for any future
rule/setup change. The real-game-log diagnostic (`analyzeRealGame.ts`,
replaying `online/backend/game_logs/*.jsonl` with the live bot params to
recompute perceived-value/bid-ceiling at any decision point) is a reusable
tool for grounding any future "bots feel off" report in what the bots
actually saw, not just self-play aggregates.

## 20. Progress-tracker threshold lowered to 3×players+3 (2026-09-28)

After item 19's Classic removal put the online game on the `4×players+1`
formula (inherited unchanged from the old Alternate variant), a quick
before/after simulation comparing it against a proposed `3×players+3`
(5,000 games/count, production bots, `DEFAULT_RULES` overridden per run)
surfaced two things worth acting on, not just a pacing preference:

| Players | Old threshold (4n+1) | Old mean turns | Old turns/person | New threshold (3n+3) | New mean turns | New turns/person |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 9 | 17.3 | 8.67 | 9 | 17.3 | 8.67 |
| 3 | 13 | 25.9 | 8.63 | 12 | 23.8 | 7.93 |
| 4 | 17 | 34.4 | 8.60 | 15 | 30.3 | 7.57 |
| 5 | 21 | 43.3 | 8.67 | 18 | 36.3 | 7.27 |
| 6 | 25 | **85.4** (median 76, p90 121, **max 1208**) | 14.23 | 21 | 49.2 (median 46, p90 68, max 176) | 8.21 |

2p is unchanged (both formulas give 9 there). 3-5p get a modest ~10-15%
shorter game with the new formula. **6p was the real finding**: under the
old threshold it's a severe outlier — mean 85 turns and a max of 1,208 in a
5,000-game sample, dragging turns/person up to 14+ versus ~8.6 at every
other count. This is the same card-exhaustion long-tail dynamic documented
in item 14 ("Total card exhaustion can deadlock a marathon game"), showing
up here as *pathologically slow* rather than a hard deadlock — a higher
threshold gives the game more opportunities to wander into that near-empty-
deck long tail before finishing. The new threshold's 6p max (176) is still
the largest of the five counts but nowhere near the old 1,208, and its
turns/person (8.21) is back in line with 2-5p.

**Decision: adopt `progressThresholdPerPlayer: 3, progressThresholdBase: 3`**
(`DEFAULT_RULES` in `online/shared/src/state.ts`) — new thresholds 9/12/15/18/21
for 2-6 players. This is a genuine, deliberate choice (not a placeholder like
the item 2/13 history), made with real simulation data on the ruleset
actually being played (post item-19), and it materially reduces the 6-player
long-tail risk as a side effect of simply being a smaller number to reach.
Updated every hardcoded reference to the old 9/13/17/21/25 table (`setup.test.ts`,
`gameLengthRules.test.ts`, `http.test.ts`, `measureGameLength.ts`'s baseline
label, `rules.md`'s Alternate Setup Variant table) — full `npm test` (195
backend tests) clean afterward.

Worth revisiting once there's more human playtesting at this new pace, and
worth checking whether item 14's underlying card-exhaustion mechanism is
worth an actual engine fix now that a real game (not just an extreme
bot-stress-test seed) can wander into its long tail, rather than continuing
to treat threshold-tuning as the only lever against it.
