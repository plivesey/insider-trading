# V5 Online Migration Plan

## Context

The physical/rules design for "Insider Trading" V5 is finished and written up at `/Users/peterlivesey/Repo/insider-trading/rules.md` (plus open tuning items in `v5_tuning_notes.md`). V5 changes deck structure (merges the Goal deck and Insider Tip deck into one shuffled Event Deck), setup (a new Starter Deck + pass-and-draft mechanic), the end-of-turn mechanic (a single d6 becomes a bag of 6 weighted dice), goals (adds a private/secret pathway alongside the existing public goal row), the win condition (a progress tracker replaces the two old end conditions), the economy ($25 start, 2-loan cap), 16 new action cards, and a color rename (Yellow→Green).

The next step is migrating the online multiplayer implementation (`online/` — a TypeScript monorepo: `shared/`, `backend/`, `frontend/`) from V4 to V5, so the user can play V5 against bots and against friends online and use that to playtest the new rules. This is a full replace, not a dual-ruleset toggle: the entire V4 online implementation already exists as a frozen, untouched snapshot at `v4/online/` (archived in an earlier session), so `online/` can be rewritten in place with nothing lost.

**Decisions locked in during planning** (do not re-litigate these):
- **Full replace.** No `version: 4|5` discriminant, no dual code paths, no lobby ruleset picker. `online/` becomes V5 only.
- **Bots: heuristic-only for every new V5 decision point.** The trained stock-value net (`nets/champion.json`, frozen 40-slot feature schema) is reused as-is, untouched. No retraining, no feature-vector growth in this project. That is an explicitly separate future phase.
- **Black Market action card is deleted entirely** (not redefined) — its V4 mechanic (auction from a leftover "unused tip pool") has no analog in V5 since the whole Event Deck goes into circulation at setup. Market Deck becomes 36 stock + 15 action = **51 cards** (11 V4 actions carried over + 4 new Broker cards).
- **Progress tracker UI counts down** (`threshold − current`) even though the underlying `GameState` field is a plain up-counter (0 → threshold) for log/replay clarity — the subtraction happens only in the frontend render.

## Note for whoever picks this up

If you're an agent starting fresh on this: **read this entire file first**, top to bottom, before touching any code. It's long on purpose — it's the only context you get. Something like: *"Going to read the rulebook. Here's the entire plan file, what we're working on, and where we may be part of the way through."* Check the boxes below (`- [ ]` → `- [x]`) as you complete each item, **commit after every phase** (small phases may be one commit; large ones may be a few — use judgment, but don't let uncommitted work pile up across phase boundaries), and update the "Status" line at the top of whichever phase you're mid-way through so the next reader knows exactly where things stand. Also skim `/Users/peterlivesey/Repo/insider-trading/rules.md` and `v5_tuning_notes.md` — they're the source of truth for every rule referenced here.

---

## Phase 0 — Source-of-Truth Corrections (root repo)

**Status:** DONE
**Rationale:** the online app loads cards directly from root `/cards/*.json`, and this plan references `rules.md` throughout. Both must be fully consistent with V5 (including the two decisions above) before any code changes.

- [x] `cards/stock_cards.json`: rename all 8 `"color": "Yellow"` entries to `"color": "Green"`. (Also updated Scout/Informant `ability` text on all 4 colors to the new "top 1"/"top 2 of the event deck" wording, and confirmed Informant's trigger is "When bought" — the `type` value is still `peek_sell`, a cosmetic misnomer left as-is per the plan.)
- [x] `cards/action_cards.json`: deleted the 2 `Black Market` (`auction_unused_tip`) entries. Appended 4 new entries (ids 12-15) for Oil/Rail/Steel/Bank Broker (`broker_discount`, persistent, one per color). File is now 15 entries.
- [x] Authored `cards/starter_deck.json`: 24 entries — 12 basic stock cards (3 each Blue/Orange/Green/Purple) + 12 starter action cards (7 playable with `"hidden": false`, 5 bonus cards with `"hidden": true`).
- [x] `rules.md`: fixed action-card/market-deck counts to 15/51, removed the Black Market row from the Action Cards table, added it to "Removed from V5", and removed the now-resolved design-note callout at the top.
- [x] `v5_tuning_notes.md`: marked the Black Market item resolved ("removed").
- [x] Also (beyond the original scope, but needed since these files also referenced `Yellow`): renamed `Yellow`→`Green` in `cards/insider_tip_cards.json` and `cards/goal_cards.json`; deleted `cards/peek_cards.json` (Hot Tip cards no longer exist in V5); rewrote `tests/deck_composition.test.js` and `tests/action_cards.test.js` for V5 counts/cards; fixed color references in `tests/stock_cards.test.js`, `tests/goal_cards.test.js`, `tests/insider_tip_cards.test.js`; updated root `CLAUDE.md` to describe V5 (was still fully V4).
- [x] Root `npm test` passes — 5 suites, 63 tests, all green.
- [x] Commit.

---

## Phase 1 — Shared Types & Card Data Loading Rewrite

**Status:** DONE (with two deviations noted below)
**Rationale:** every other phase depends on this type surface. Highest-leverage, lowest-risk phase to do first, in isolation.

Files: `online/shared/src/cards.ts`, `cardLoader.ts`, `state.ts`, `protocol.ts`.

- [ ] `Color`: rename `'Yellow'` → `'Green'` everywhere (type, `COLORS` array).
- [ ] `ActionEffect`: remove `'auction_unused_tip'`. Add: `broker_discount` (`{ color: Color }`), `fire_sale`, `first_look`, `foresight`, `windfall`, `market_panic`, `backroom_deal`, `double_down`. This is a closed/exhaustive union — TypeScript will force compile errors at every switch site that needs a new case (Phases 5/8). That's intentional; don't work around it with a default case.
- [ ] New `BonusEffect` union + `BonusCard` interface (`category: 'bonus'`) for the 5 hidden cards (`flat_cash`, `per_stock_held`, `per_goal_completed`, `no_loans_bonus`, `easy_credit`). Never played — no dispatch path, no `persistent` field.
- [ ] `HandCard = StockCard | ActionCard | InsiderTipCard | GoalCard | BonusCard` (widen from V4's 3-member union).
- [ ] `cardLoader.ts::loadCards`: drop `hotTips`/`peek_cards.json`; add `starterDeck` loaded from the new `starter_deck.json`. Update `CardCatalog`.
- [ ] `state.ts` — `GameState` rewrite:
  - `insiderTipDeck` → `eventDeck: (InsiderTipCard | GoalCard)[]` (merged deck).
  - `activeGoals` → `goalRow: GoalCard[]` (public only).
  - Delete `unusedInsiderTipPool` entirely.
  - `resolvedInsiderTips` → `resolvedEventCards: InsiderTipCard[]`.
  - Add `progressTracker: number` (up-counter, starts 0) and `progressThreshold: number` (computed once at setup).
  - Add dice-bag types: `DieId = 'A1'|'A2'|'B1'|'B2'|'C'|'D'`, `DieFace = 'bull'|'bear'|'nothing'|'draw1'|'draw2'|'draw3'`, a `DICE: Record<DieId, DieFace[]>` constant (6 faces each, exact multiset per `rules.md`'s dice table), and `diceBagRemaining: DieId[]` on `GameState` (starts full, shrinks as drawn, refills to all 6 when empty).
  - `TurnPhase`: rename `'awaiting_die_roll'` → `'awaiting_dice_bag_draw'`; add `'setup_draft'`.
  - `GameOver.reason`: replace the 2-value union with `'progress_threshold_reached'`.
  - `RulesConfig`: replace the 4 V4 knobs with V5 ones — `initialGoalRevealCount` (default 4) and `progressThresholdPerPlayer` (default 4) + a `computeProgressThreshold(numPlayers, rules)` helper, written so swapping in a non-linear per-player-count table later is a one-function change. Drop `CLASSIC_RULES` (no longer meaningful); keep one `DEFAULT_RULES`.
  - `MAX_LOANS = 2` (was 3). `LOAN_CASH` stays `10` (only the end-game penalty schedule changes — that's Phase 6).
  - `PromptType`: drop `'final_tip_play_choice'` (dead — no more deck-exhaustion end condition). Add `'setup_draft_pick'`, `'foresight_reorder'`, `'backroom_deal_pick_own_card'`, `'double_down_pick_card'`. **Deviation:** no `'backroom_deal_pick_market_card'` -- its 2nd step reuses the existing `'pick_market_card'` prompt type with a new `mode: 'backroom_deal'`, same pattern already used for Corner the Market / swap_with_market. Also added `'double_down_pick_card'` (the plan's action-card list omitted a prompt for Double Down's "which card to double" step).
  - `ProjectedGameState`: mirror the renames (`eventDeckSize`, `goalRow`, `progressTracker`, `progressThreshold`).
  - Added `DraftState { round: 1|2|3; hands: Record<PlayerId, HandCard[]> }` and a `draft: DraftState | null` field on `GameState` -- the plan didn't fully spec the transient bookkeeping the pass-and-draft procedure needs (each round's not-yet-kept candidates, per player), so this was designed during implementation (Phase 2).
- [x] `protocol.ts`: `FreeActionRequest` (actually lives in `state.ts`, `protocol.ts` just re-exports it) gains `'claim_private_goal'`; `'play_insider_tip'` renamed to `'play_market_movement'`.
- [x] **Tests**: `cardLoader.test.ts` rewritten (36 stock incl. 8 Green/0 Yellow, 15 action, 24 starter deck w/ 12 stock + 7 playable + 5 bonus, no Black Market). Dice-table shape asserted directly in `state.ts`'s own review rather than a separate test file (the `DICE` constant is a static literal, low regression risk); revisit if it ever needs to move.
- [x] Commit — included in the combined Phases 1-8 commit (see bottom of this phase list for why: the type change alone doesn't compile against the rest of the untouched codebase, so committing it in isolation would leave the repo in a broken intermediate state; all phases 1-8 landed as one commit instead of one-per-phase).

---

## Phase 2 — Backend Domain: V5 Setup & Draft

**Status:** DONE
**Rationale:** setup is the most mechanically distinct part of V5. Isolate it so later phases can assume "every player already has a legal 3-card V5 hand."

Files: `online/backend/src/domain/setup.ts` (rewrite `createGameState`), new `online/backend/src/engine/setupDraft.ts`.

- [ ] Delete `makeBuyCard`/`makeHotTipCard` helpers.
- [ ] Market deck: `[...catalog.stocks, ...catalog.actions]` (51 cards), shuffle, reveal 5.
- [ ] Event deck build: shuffle `[...catalog.insiderTips, ...catalog.goals]` (30), flip one at a time until `rules.initialGoalRevealCount` goals have surfaced → `goalRow`; gather everything else (flipped market-movement cards + untouched remainder) into one pile, reshuffle → `state.eventDeck`.
- [ ] Starter deck build: shuffle `catalog.starterDeck` (24).
- [ ] Deal 2×players from `eventDeck` + 2×players from starter deck (face-down), combine into ONE pile, reshuffle **together** (not a guaranteed 2-and-2 split per player — this is intentional, per rules.md), deal 4 face-down to each player. Leftover undealt starter cards are discarded from the game (never tracked again).
- [ ] Implement the pass-and-draft-to-3 as an explicit new setup sub-phase (it needs live per-player choices, so it can't be a pure synchronous function like V4's setup):
  - Game starts in `turnPhase: 'setup_draft'`.
  - `beginDraft(state, events)`: deals the 4-card hands, issues a `'setup_draft_pick'` prompt to every player simultaneously.
  - `handleDraftPick(state, playerId, keepUid, events)`: **Deviation** -- named `handleDraftPick`, not `submitDraftPick`, and it's called from `promptResponse.ts`'s `'setup_draft_pick'` case rather than being a standalone mutation exposed to routes -- the draft is driven entirely through the existing prompt-response endpoint, no new API surface needed. Removes the kept card into the player's permanent hand, stages the other 3 to pass left. Once all players have picked for a round, rotates the staged piles and issues the next round's prompt (3 cards → keep 1 → pass 2; then 2 cards → keep 1 → auto-discard the last, no prompt needed for that final discard). On completion, transitions to `'awaiting_turn_action'` and starts turn 1.
- [x] `cash: 25`, starting `hand: []` (draft populates it). `progressTracker: 0`, `progressThreshold: computeProgressThreshold(numPlayers, rules)`. `diceBagRemaining` full at game start. Stock prices $4 flat. Random first player, clockwise.
- [x] **Tests**: `setup.test.ts` fully rewritten for V5 (deck sizes, $25 cash, pre-draft 4-card hands, `progressThreshold`/`goalRow` per player count). **Deviation**: no separate `setupDraft.test.ts` file -- draft-completion coverage (3-round conservation, no uid loss, works across player counts) ended up folded into `bot_full_game.test.ts` (which exercises the draft as part of every full game, across 5 seeds) and `full_game.test.ts`, rather than a dedicated isolated-draft unit test. Worth adding later if the draft logic gets more complex.
- [x] Commit — combined into the single Phases 1-8 commit (see Phase 1 note).

**Bug found during Phase 8 integration testing, fixed here in spirit:** a directly-constructed `GameState` (bypassing `ServerHub.startGame`) needs one explicit `advance(state, events)` call before `beginDraft` ever runs, since `advance()` is what lazily triggers it. Production code already does this (`ServerHub.startGame`'s existing "run advance() once after setup" step); the test-only drivers in `full_game.test.ts`, `bot_full_game.test.ts`, and `selfPlay.ts::driveSelfPlay` needed the same call added (see Phase 10 notes).

---

## Phase 3 — Backend Engine: Dice Bag & Event-Deck Resolution

**Status:** DONE
**Rationale:** the riskiest mechanical piece (order-sensitive multi-card resolution, threshold-check timing). Isolate before wiring goals/scoring on top.

Files: `online/backend/src/engine/rng.ts`, `turn.ts`, rename `insiderTip.ts` → `eventDeck.ts`.

- [ ] `rng.ts`: delete `rollD6`. Add `drawDieFromBag(state): DieId` (refills `diceBagRemaining` to all 6 *before* drawing if it was empty, then removes one at random) and `rollDieFace(dieId, state): DieFace` (uniform pick from `DICE[dieId]`).
- [ ] `eventDeck.ts` (renamed from `insiderTip.ts`):
  - `resolveMarketMovementCard(state, card, events)`: same effect shapes as V4 (halve / per-color adjust), reused almost verbatim. Always +1 to `progressTracker`; pushes to `resolvedEventCards`.
  - `resolveEventCard(state, card, events)`: dispatch by category — `insider_tip` → `resolveMarketMovementCard`; `goal` → push to `goalRow` (public), does **not** touch the tracker.
  - `drawFromEventDeck(state, n, events)`: draws up to `n` cards one at a time, resolving each in sequence via `resolveEventCard`, stopping early only if the deck empties. **No threshold check between cards** — that happens once, after this returns.
- [ ] `turn.ts`: replace `rollEndOfTurnDie` with `resolveEndOfTurnDiceBag(state, events)`: draw a die, roll its face, dispatch (`bull`→all prices +1, `bear`→all prices −1 floored at 0 [reuse existing `adjustAll` helper], `draw1/2/3`→`drawFromEventDeck`, `nothing`→log only). The threshold check runs once in `advance.ts` right after this call (Phase 4).
- [x] Replaced `checkEndConditions` with `checkProgressThreshold(state, events)` (renamed, lives in `turn.ts` alongside the old function rather than a new file): ends the game the instant `progressTracker >= progressThreshold`, reusing `computeBreakdown`/`selectWinners` from `scoring.ts`.
- [x] **Tests**: **Deviation** -- no separate `diceBag.test.ts`/`eventDeck.test.ts` files. Coverage landed instead in `turnEngine.test.ts` (dice-bag draw drives a full turn), `freeActions.test.ts` (Insider Source drawing a market-movement vs. a goal card, each verified against `eventDeck`), and `gameLengthRules.test.ts` (`checkProgressThreshold` behavior, including the "finish the whole draw before ending" case verified there and in `freeActions.test.ts`'s "defers game_over until an open reward prompt is resolved" test). The single highest-value scenario the plan called out -- multi-card draw crossing threshold mid-draw -- is covered by `freeActions.test.ts`'s deferred-game-over test. Dedicated `diceBag.test.ts`/`eventDeck.test.ts` files would still be a reasonable follow-up for more exhaustive face-distribution/edge-case coverage.
- [x] Commit — combined into the single Phases 1-8 commit.

---

## Phase 4 — Backend Engine: Goals (Public + Private) & Progress-Tracker End Condition

**Status:** DONE
**Rationale:** goals are now two pathways that both feed the same tracker from Phase 3; this is also where the simultaneous-dual-claim edge case lives.

Files: `online/backend/src/engine/goals.ts`, `freeActions.ts`, `advance.ts`.

- [ ] `claimGoal` (public path): source renamed `goalRow`; on success, +1 `progressTracker` (new — V4 had no tracker).
- [ ] New `claimPrivateGoal(state, player, goalUid, assignment, events)`: source is `player.hand`. Factor the shared stock-assignment/Wild-substitution validation out of the old `claimGoal` into a helper both functions call, rather than duplicating it. On success: remove the goal card from hand, push to `player.goalsClaimed`, apply reward via the existing (unchanged) `applyReward`, +1 `progressTracker`.
- [ ] Simultaneous-claim handling: whenever a public goal newly enters `goalRow` (setup reveal or a dice draw), immediately check — in the same mutation, before any player can act — whether multiple current hands already satisfy it. If so, apply the reward to **all** qualifying players in one pass, remove the goal, bump the tracker **once**. Implement as `checkSimultaneousGoalClaims(state, newGoal, events)`, called right after a goal is placed into `goalRow` in both places that can happen (setup, `drawFromEventDeck`).
- [x] `freeActions.ts`: added the `'claim_private_goal'` branch; also renamed `'play_insider_tip'` → `'play_market_movement'` (Phase 1 protocol change) with its handler updated accordingly.
- [x] `advance.ts`: swapped in `checkProgressThreshold` and `'awaiting_dice_bag_draw'`/`resolveEndOfTurnDiceBag`. Deleted the `tryFireBlackMarketTrigger` call/import entirely. Added the `turnPhase === 'setup_draft'` branch (calls `beginDraft` once, then returns -- draft progression is driven by `promptResponse.ts`'s `handleDraftPick`, not this loop).
- [x] **Tests**: **Deviation** -- no separate `goalsV5.test.ts`; coverage folded into `freeActions.test.ts`'s new "Goal claiming (private)" and "end conditions via progress tracker" describe blocks (private claim removes card + bumps tracker; rejecting a claim for a goal not in hand; deferred-game-over-until-prompt-resolved). The simultaneous-dual-claim case is exercised implicitly across many seeds in `selfPlay.test.ts`/`bot_full_game.test.ts` (see the dual-claim invariant note below) rather than a single targeted unit test -- worth adding a direct one later for a faster, more legible regression signal.
- [x] Commit — combined into the single Phases 1-8 commit.

**Found during testing:** the simultaneous-dual-claim rule (rules.md: "both players get the reward, tracker still only +1") means the *same* goal uid can legitimately appear in two different players' `goalsClaimed` arrays. `_invariants.ts`'s uid-uniqueness check originally treated this as a leak (false positive) -- fixed by special-casing `goalsClaimed` in that check (still verifies a claimed uid never *also* appears anywhere else -- hand, market, any deck).

---

## Phase 5 — Backend Engine: Action Cards (Starter + Broker) & Auction Cleanup

**Status:** DONE
**Rationale:** the largest chunk of new gameplay surface (16 effects), sequenced after goals/dice since a couple of the new cards touch the event deck and market directly. Also where Black Market's removal gets cleaned up structurally.

Files: `online/backend/src/engine/actionCards.ts`, `auction.ts`, `turn.ts` (`resolveStockSpecialOnBuy`), `promptResponse.ts`.

- [ ] `actionCards.ts::startActionCard`: remove the `'auction_unused_tip'` case (will be a compile error until removed, since Phase 1 deleted the effect type — that's the point). Add cases for all 8 new `ActionEffect` variants:
  - `broker_discount` → push to `persistentEffects` (same pattern as Preferred Bidder / `tie_breaker`).
  - `fire_sale` → prompt to pick a market **stock** only, buy at flat $3, bypass price-move and special-ability triggering entirely.
  - `first_look` → draw top of market deck into hand (reuse `drawTopOfDeck`).
  - `foresight` → new prompt with the top 4 `eventDeck` cards; response rewrites the deck's first 3–4 slots per the chosen order, optionally burying one at the bottom.
  - `windfall` → `receiveBank(player, 5)`.
  - `market_panic` → every other player: `cash = max(0, cash - 3)`, bypassing `payBank`'s loan-issuance path entirely (never triggers a loan, per spec).
  - `backroom_deal` → two-step prompt (pick own hand card, incl. a private goal → pick a market slot); splice player's card into that market slot, market card into hand — plain swap, no price move, no special trigger (mirror/reuse the existing `swap_with_market` goal-reward logic in `goals.ts` as a reference or shared helper).
  - `double_down` → pay $2 via `payBank` (loan-eligible — confirmed this SHOULD be able to trigger a loan), then pick a different hand action card restricted to `category === 'action' && !persistent`, apply its effect twice before discarding. Factor a `applyEffectOnce` inner function so `double_down` can call the dispatch twice without double-charging itself.
- [x] `auction.ts`: deleted `tryFireBlackMarketTrigger`, `startSideAuction`, `sideAuctionTip`/`resumePhase`. Added `applyBrokerDiscount` at auction settlement.
- [x] `turn.ts::resolveStockSpecialOnBuy`: Informant now triggers on buy, peeking 2 event-deck cards; removed its old on-sell branch from `sellStock`. Scout unchanged (peek 1 on buy).
- [x] `promptResponse.ts`: added handlers for `setup_draft_pick`, `foresight_reorder`, `backroom_deal_pick_own_card`, the `pick_market_card` `mode: 'backroom_deal'`/`'fire_sale'` branches, and `double_down_pick_card`. Deleted `final_tip_play_choice`. Added a guard rejecting a hidden bonus card as the Backroom Deal / swap_with_market trade-away target (bonus cards are never tradeable, per rules.md).
- [x] **Tests**: **Deviation** -- no separate `actionCardsV5.test.ts`. New-effect coverage landed in `freeActions.test.ts` ("Action cards" describe block: Broker persistence; Insider Source drawing either a market-movement or a goal card) and via full-game/bot-game integration runs (Fire Sale, First Look, Foresight, Windfall, Market Panic, Backroom Deal, Double Down all get exercised there since bots can draft and play any starter card, plus the recursion-safety fix below was found and fixed via a bot integration run, not a targeted unit test). **Gap to close later:** none of these 7 starter effects has an isolated, deterministic unit test asserting its exact mutation the way the plan's `actionCardsV5.test.ts` intended -- recommend adding one file with a case per effect (mirroring `freeActions.test.ts`'s existing per-card pattern) before relying on this area for anything beyond "doesn't crash."
- [x] Commit — combined into the single Phases 1-8 commit.

**Real bug found and fixed here:** `bots/valuation.ts`'s `backroom_deal`/`double_down` valuation logic could recurse infinitely (stack overflow) if a Backroom Deal or Double Down card ended up being evaluated against itself, or against each other across market/hand (e.g. a player trades a Backroom Deal card away via Backroom Deal, and it's later valued from both the market and another player's hand in the same call graph). Fixed with a `safeActionCardValue` helper that returns a flat fallback for any of `take_face_up`/`backroom_deal`/`double_down` instead of ever recursing into `actionCardBaseValue` for those three effect types -- they can now only ever be one level deep, never mutually referential. This generalizes the pre-existing `take_face_up` self-recursion guard that already existed in the V4 code.

---

## Phase 6 — Backend Scoring Rewrite

**Status:** DONE
**Rationale:** small and surgical, but every game ends here — sequenced after Phase 5 so bonus cards and `goalsClaimed` are fully wired first.

Files: `online/backend/src/engine/scoring.ts`.

- [x] `loanPenaltyFor(loans, hasEasyCredit)`: `0→$0, 1→$12, 2→$26`, or `loans * 10` flat if `hasEasyCredit`.
- [x] `computePlayerWealth`: bonus-card pass over `player.hand` exactly as specced; folded into `endGameBonus`.
- [x] **Tests**: **Deviation** -- no dedicated `scoring.test.ts` file. `turnEngine.test.ts`'s `loanPenaltyFor` describe block covers 0/1/2 loans and the Easy Credit override directly; the bonus-card math itself is verified independently (not just re-calling `scoring.ts`) inside `_invariants.ts::assertGameOverInvariants`, which every full-game integration test exercises. **Gap to close later:** no isolated per-bonus-card unit test (e.g. "Portfolio alone, nothing else") -- the invariants check only validates consistency between the breakdown and final hand state, it wouldn't catch a bug present in *both* `scoring.ts` and the independent invariants recomputation if they shared the same misunderstanding. A small dedicated `scoring.test.ts` is a good follow-up.
- [x] Commit — combined into the single Phases 1-8 commit.

---

## Phase 7 — API / Protocol Wiring

**Status:** DONE
**Rationale:** thread the new setup-draft phase and new request/prompt kinds through HTTP/WS. No version branching — a direct rewrite of the single existing path.

Files: `online/backend/src/http/routes.ts`, `projection.ts`, `online/backend/src/state/serverState.ts`.

- [x] `routes.ts`: needed no changes -- `turn-action`/`auction-bid`/`free-action` all route through engine functions that already validate phase/turn correctly on their own (e.g. `startAuction` checks `turnPhase !== 'awaiting_turn_action'`), and `setup_draft_pick` responses go through the existing `/prompt-response` endpoint unchanged.
- [x] `projection.ts::projectState`: renamed fields as specced. Confirmed the allow-list needs no goal/bonus special-casing -- hands are redacted wholesale per-player already, and a private goal or bonus card sitting in `myPlayer.hand` is simply included since it's the viewer's own hand.
- [x] `serverState.ts`: needed no changes at all -- `loadCards` already returns `starterDeck` as part of `CardCatalog` from the Phase 1 rewrite, and `catalog` is just passed through unchanged.
- [x] **Tests**: `http.test.ts` updated with a `driveDraft(a, b)` helper (resolves both players' `setup_draft_pick` prompts, always keeping the first candidate offered) called before any turn-action test that needs the game past setup; removed the Black Market side-auction draining logic (dead); updated `pick_color` response color literal (Green, not Yellow).
- [x] Commit — combined into the single Phases 1-8 commit.

---

## Phase 8 — Bot AI: Heuristics for All New V5 Decision Points

**Status:** MOSTLY DONE -- one explicit deferral (see below)
**Rationale:** ships playable bots without touching the frozen value net. Widest fan-out across files (bot dispatch is duplicated 3–4× today) — fix that duplication *before* piling new cases onto it, not after.

Files: `online/backend/src/bots/decide.ts`, `valuation.ts`, `actionHeuristics.ts`, `runner.ts`, `selfPlay.ts`, `bot_full_game.test.ts`, `analyzeBotGame.ts`, `scripts/measureGameLength.ts`, `analyzeGoals.ts`.

- [ ] **DEFERRED, not done**: extracting a shared `executeBotAction` used by all of `runner.ts`/`selfPlay.ts`/`bot_full_game.test.ts`/`analyzeBotGame.ts`. Each of these 4 still has its own copy of the dispatch switch (unchanged from V4 in this respect, just each copy individually updated where needed for the new `BotAction`/`FreeActionRequest` shapes). This refactor is still worth doing -- the risk it guards against (a new `BotAction` kind wired into one copy but not another) is real and was NOT hit this time only because no new `BotAction` *kinds* were added in V5 (all new decision points route through the existing `prompt_response`/`free_action` kinds). Flagging explicitly so a future session doesn't assume this was done.
- [x] `decide.ts::decideBotAction`: setup-draft handled via the existing "pending prompt → respond" path (a `'setup_draft_pick'` case in `respondToPrompt`, reading the true candidates from `state.draft.hands[botId]`) rather than a separate `chooseDraftKeep` entry point -- simpler given the draft is just another prompt type. Added `perceivedDraftCardValue` dispatching by category (stock/action/insider_tip/goal/bonus) for ranking draft candidates.
- [x] Fixed the "always claim instantly" logic for private goals as specced (delay only when holding Trophy Case AND `progressThreshold - progressTracker > 3`).
- [x] `valuation.ts` / `actionHeuristics.ts`: all 8 new `ActionEffect` cases added (7 starter effects + `broker_discount`) to both `actionCardBaseValue` and `shouldPlayActionCard`, using the heuristics the plan suggested. Also added `perceivedGoalCardValue` and `perceivedBonusCardValue` (needed for draft-candidate ranking, not called out explicitly in the plan but required to implement the draft-valuation bullet above).
- [ ] **DEFERRED, not done**: the "dice awareness" auction-bid adjustment. Bots currently bid using the same logic as V4 with no adjustment for expected upcoming Bull/Bear draws. Reasonable to skip for a first playable pass; revisit once playtesting shows whether bots are systematically over/under-bidding near the (still-placeholder) progress threshold.
- [x] `measureGameLength.ts`: rewritten for the new `RulesConfig` knobs (sweeps `initialGoalRevealCount`/`progressThresholdPerPlayer` instead of the old V4 knobs) and dropped the goal-vs-tip end-reason split (moot with one end condition). `analyzeGoals.ts`/`analyzeGoalWins.ts`/`analyzeBotGame.ts` updated for renamed fields (`goalRow`, Green not Yellow) and the removed end-reason split; **not yet actually run** against the new rules to sanity-check the default threshold -- still an open action item, not just a "nice to have."
- [x] **Tests**: `bot_valuation.test.ts` updated (existing tests fixed for a subtle interaction: `goalBumpPerStock` now also counts a bot's own private goals, so tests needed to explicitly clear hands of random pre-existing private goals to keep their controlled scenarios controlled). `botSell.test.ts`/`selfPlay.test.ts` needed only field renames -- **and** `selfPlay.ts::driveSelfPlay` needed the same missing-initial-`advance()` fix described in the Phase 2 note, discovered because `selfPlay.test.ts` initially regressed to 0/12 completions after an unrelated fix elsewhere (see below).
- [x] Commit — combined into the single Phases 1-8 commit.

**Two real bugs found and fixed via `bot_full_game.test.ts`/`selfPlay.test.ts`, not caught by any unit test:**
1. **Setup-draft livelock:** a bot with no pending prompt (it already picked for the current round, others hadn't) would fall through to goal-claim/action-card logic using its partial hand -- but `advance()` intentionally refuses to drain the free-action queue while `turnPhase === 'setup_draft'` (queuing an action mid-draft would never resolve), so once every bot ran out of draft prompts to answer, the game livelocked with all prompts null. Fixed by making `decideBotAction` return `null` unconditionally once it has no prompt of its own during `setup_draft` -- there is nothing else legal to do until the draft finishes.
2. **Missing bootstrap `advance()` call:** `driveSelfPlay`, and the two integration-test drivers in `full_game.test.ts`/`bot_full_game.test.ts`, construct `GameState` via `createGameState` directly (bypassing `ServerHub.startGame`, which already calls `advance()` once post-setup). Without that call, `beginDraft` never runs and the game is stuck at tick 1 forever. All three now call `advance(state, [])` once before their drive loop starts.

---

## Phase 9 — Frontend Rewrite

**Status:** DONE (with deviations noted below)
**Rationale:** last major surface; depends on all backend types/shapes being final. Two sub-phases for committability.

### 9a — Progress tracker, dice bag, colors

Files: `frontend/src/game/theme.tsx`, `Header.tsx`, `RecentTip.tsx`, `DieRollOverlay.tsx`.

- [x] `theme.tsx`: `Yellow`→`Green` rename done; also fixed a pre-existing CSS bug found along the way — `styles.css`'s `--rail`/`--bank` variables were swapped relative to `theme.tsx`'s `C.rail`/`C.bank` (CSS had rail=red/bank=green, JS had the opposite). Aligned CSS to JS: `--rail: #52a173` (green), `--bank: #8a6243` (brown).
- [x] `Header.tsx`: "TIPS LEFT" chip replaced with a new `ProgressSteps({remaining, total})` component in `theme.tsx` (step-dots, falls back to a plain number above 24 total) showing `progressThreshold - progressTracker`, labeled "Until the Bubble Bursts".
- [x] `RecentTip.tsx`: renamed to reflect Market Movement terminology (`deckSize`→`eventDeckSize` prop), label updated; still shows deck-remaining count as a distinct stat from the progress tracker, as specced.
- [x] `DieRollOverlay.tsx`: full rewrite — `Face` type (`bull|bear|nothing|draw1|draw2|draw3`), glyph/label maps, reads `die`/`face` off the `die_roll` log entry, and for draw faces sequentially reveals each resolved card by scanning forward for `market_movement_resolved`/`goal_revealed` log entries, one at a time.
- [x] Commit.

### 9b — Cards, hand, goals, prompts

Files: `frontend/src/game/CardTile.tsx`, `cardLabel.tsx`, `HandDock.tsx`, `GoalsPanel.tsx`, `ClaimGoalModal.tsx`, `PromptModal.tsx`, plus `MarketPanel.tsx`/`AuctionPanel.tsx`/`GameBoard.tsx`/`GameOverPanel.tsx`/`usePriceHistory.ts` (pulled in by the field renames and widened `HandCard`/market-slot types).
**Design gap found and fixed in the backend while building this**: the `setup_draft_pick` prompt payload only carried `candidateUids: string[]`, with no way for the frontend to resolve those into displayable card details (a player's `hand` is empty during the draft; candidates live only in server-side `state.draft`, which isn't part of the client projection). Fixed by adding a `candidates: HandCard[]` field to the payload in `backend/src/engine/setupDraft.ts::issueDraftPrompts`; re-verified backend still compiles and all 125 tests still pass after the change.

- [x] `CardTile.tsx`/`cardLabel.tsx`: added `GoalBody` (shows "Secret Goal" vs "Goal" via a `goalContext: 'row'|'hand'` prop) and `BonusBody` (sealed, `card-tile__seal` "Never played · scores automatically", no click affordance — `onClick`/`role`/`tabIndex` are all disabled for bonus cards regardless of what's passed in).
- [x] `HandDock.tsx`: 4-way dispatch — action→`play_action_card`, market-movement→`play_market_movement` (renamed free-action kind, done), goal→opens `ClaimGoalModal` with `source="hand"` (not a raw `claim_private_goal` call — the modal owns the stock-assignment step, matching the existing `claim_goal` UX), bonus→no-op (hover-only pip "Auto-scores at game end").
- [x] `GoalsPanel.tsx`: added a "My Private Goals" section from `myPlayer.hand` filtered to `category === 'goal'`, alongside the existing public `goalRow` section.
- [x] `ClaimGoalModal.tsx`: takes `source: 'row'|'hand'`; candidates come from `goalRow` or `myPlayer.hand` accordingly; dispatches `claim_goal`/`claim_private_goal`. Stock-assignment UI unchanged.
- [x] `PromptModal.tsx`: `final_tip_play_choice` removed; added `setup_draft_pick` (CardTile grid from `prompt.payload.candidates`), `foresight_reorder` (reorder + bury), `backroom_deal_pick_own_card`, `double_down_pick_card`. **Deviation**: no separate `backroom_deal_pick_market_card` prompt type was implemented — Backroom Deal's market-side pick reuses the existing `pick_market_card` prompt with a new `mode`, since the picker UI was already generic enough; the mode-filter logic there was updated (`fire_sale` now filters to stock-only, other modes fall through unfiltered) to accommodate it. `pick_hand_stock_for_swap` also excludes bonus cards now.
- [x] Colorblind-icon audit: confirmed every stock rendering (`CardTile`, `Ticker`) pairs the shape icon (`IndustryIcon`) with the text label — never color alone. No code changes needed; this was already true pre-migration.
- [x] **Tests**: `AuctionPanel.test.tsx`/`useGameState.test.tsx` needed no field-name updates (neither references the renamed `ProjectedGameState` fields). `Lobby.test.tsx` was failing on an unrelated pre-existing bug (its `vi.mock('../lib/api.js', ...)` never stubbed `getBackendOverride`/`setBackendOverride`/`clearBackendOverride`, added to `api.ts` in a prior, unrelated commit) — fixed by extending the mock; confirmed the same failure reproduces against the pre-Phase-9 stash, so this wasn't caused by this phase's changes. Added new `CardTile.test.tsx` (goal public/private branch, bonus sealed/non-interactive branch) and `HandDock.test.tsx` (all 4 dispatch branches + the `canPlayActions=false` gate). Full suite: 27/27 passing, `tsc --noEmit` clean.
- [x] Commit.

---

## Phase 10 — Integration Tests & Full Regression Pass

**Status:** DONE
**Rationale:** the real end-to-end confidence gate. Prior phases prove components in isolation; this proves a complete V5 game plays out correctly, repeatedly, across player counts and seeds.

Files: `backend/tests/integration/full_game.test.ts`, `bot_full_game.test.ts`, `_invariants.ts`, `http.test.ts`, `backend/tests/unit/diceBag.test.ts` (new), `backend/tests/unit/setup.test.ts`.

- [x] `_invariants.ts::assertGameOverInvariants`: rewritten for the single `GameOver.reason`, independently-recomputed bonus-card/loan-penalty math, and extended uid-leak checks (`goalRow`, `eventDeck`, `resolvedEventCards`), with an explicit carve-out for the legitimate simultaneous-dual-claim case (see Phase 4 note). The discarded-starter-deck check now has its own dedicated test instead (see below) rather than living in this game-over invariant, since the interesting moment to check it is right after setup, before any drafting/play could theoretically move things around.
- [x] `full_game.test.ts`: scripted non-bot driver now clears the setup draft (always keeps the first candidate) before driving turns; still auto-claims goals (public and private) opportunistically rather than scripting a specific "claim exactly one public then one private" sequence with tracker-value assertions at each step -- the plan's most specific ask (assert exact `progressTracker` value at each step) is **not** implemented as a standalone test. That said, the deferred-game-over test in `freeActions.test.ts` (Phase 4) does assert exact tracker values across a claim + pending-prompt + resolution sequence, which covers the same underlying risk (the "finish the draw/reward before ending" rule) via a more controlled unit test rather than this looser integration driver.
- [x] `bot_full_game.test.ts`: **widened per spec** to every player count 2-6 x 7 seeds each (35 cases, up from 3-player x 5 seeds). This widening immediately paid for itself -- it caught three real bugs, all fixed:
  1. **Fire Sale livelock**: a bot with a pending Fire Sale (`pick_market_card`/`fire_sale`) prompt would return `null` if the market's colored stock had been bought out from under it while the prompt was pending, permanently stalling that player. Fixed with a proper engine-side fizzle path (`promptResponse.ts`) plus a matching bot-side fallback (`decide.ts`) that always answers the prompt instead of silently dropping it. Also fixed a related bug in `actionCards.ts::startActionCard`'s `fire_sale` case, which incorrectly counted Wild Share stocks as valid targets when deciding whether to fizzle immediately at play-time.
  2. **Progress-tracker stall at higher player counts**: bots only ever play a market-movement card from hand when it's currently beneficial to themselves -- rational in isolation, but at 6 players (where more event-deck cards get siphoned into the initial draft and end up privately held) it's possible for every remaining path to +1 progress to be simultaneously unappealing to its private holder, so the tracker can sit forever just short of threshold. Added a bounded stagnation fallback: `BotProfile` now tracks `state.turnNumber` since the tracker last moved, and once that gap exceeds `STAGNATION_FORCE_TURNS` (400 turns), a bot force-plays its least-bad held market-movement card instead of holding it forever. This is a bot-AI mitigation, not a rules change -- flagged as an open design question in `v5_tuning_notes.md` (a human table might also want an explicit rule addressing this, but that's a rules-design call, not something to fix unilaterally).
  3. **Action-card volley livelock**: Hostile Takeover's "target draws a replacement from the deck" can, once the market deck empties and reshuffles its discard pile, hand the replacement draw right back to whoever just had a card stolen -- including, on bad luck, the very card just discarded. Two non-current players (free actions are legal for anyone, any time) could then volley the same action card back and forth indefinitely, which never advances `turnNumber` and can starve the actual current player of ever getting a turn. Fixed with `BotProfile.ownTurnActionCardStreak`, capping any one bot to `MAX_OWN_TURN_ACTION_CARDS` (10) action-card plays per `turnNumber` before falling through to other priorities.
  With all three fixed, `driveBotGame`'s tick ceiling was raised from 5000 (3-player-tuned) to 30,000, since a legitimate 6-player game was observed needing up to ~19,000 ticks (occasional long bot skirmishes that don't advance the tracker, now bounded rather than infinite).
- [x] New `backend/tests/unit/diceBag.test.ts`: the dedicated dice-bag stress test -- asserts the `DICE` table shape, that a fresh game starts with a full 6-die bag, that every consecutive 6-draw window (across 600 draws, 5 seeds) uses each `DieId` exactly once, that the bag empties after 6 draws and refills on the 7th, and that `rollDieFace` only ever returns a face from that die's own table.
- [x] New test in `backend/tests/unit/setup.test.ts`: explicit, named check (across player counts 2-6) that exactly `2 x players` starter-deck cards enter play and the remaining `24 - 2 x players` are truly absent from every other zone (market, mainDeck, discardPile, goalRow, eventDeck) -- not just "no duplicates somewhere," but a positive check that the leftover cards are gone.
- [x] Full backend `npm test`: 169/169 green. Root `npm test`: 63/63 green. Frontend `npx vitest run`: 27/27 green, `tsc --noEmit` clean. All three run as the combined regression gate.
- [x] Commit.

---

## Phase 11 — Browser QA

**Status:** MOSTLY DONE — core surfaces verified live; a few rarer prompt types verified by code review + backend tests only (see below)
**Rationale:** the user explicitly asked for real browser verification — the existing `scripts/verifyE2E.ts` is API-level only (raw HTTP/WS, no DOM), which doesn't satisfy that ask.

Ran via the Playwright browser tools against the real dev server (`npm run dev`, backend on :4000, frontend on :5173), a 3-player game (1 human via browser + 2 bots), driven interactively through ~12 turns.

- [x] Started the dev server, navigated to the lobby.
- [x] Joined as a human player, added 2 bots, started the game.
- [x] Verified the setup-draft UI end to end: all 3 rounds rendered correctly (4→3→2 candidates), a private goal card appeared as a draft candidate mid-draft and rendered with the "Secret Goal / only you" framing, bonus cards rendered sealed and non-interactive, the auto-discard of each round's leftover card was logged, and the game auto-transitioned into turn 1 with every player at exactly 3 cards.
- [x] Screenshotted the progress-tracker step-dots (`.playwright-mcp/01-setup-draft.png`, `02-midgame-board.png`) — confirmed it counts down correctly (started 12 of 12, tracked down to 9 of 12 as market-movement/goal events resolved) while log entries show the underlying up-counter incrementing, exactly per the design.
- [x] Verified live: an auction win with Boom's extra-price-rise special firing, Tip-Off's pick_color prompt, dice-bag results for `nothing`/`bull`/`draw2`/`draw3` faces (log-confirmed; the overlay itself renders for ~2.6s per die and is timing-sensitive to screenshot but its trigger logic and log-derived content were confirmed correct), a multi-card `draw3` resolving 2 market-movement cards + 1 goal reveal before the tracker updated once, First Look drawing into hand, Insider Source drawing a market-movement card into hand, playing and activating two different persistent Broker cards (Steel Broker, Rail Broker — both correctly tagged next to the player's name), the full Sell-a-stock flow, and the public+private Goals panel rendering side by side with the "My Private Goals" section.
- [ ] **Not directly screenshotted this run** (verified only via code review of `PromptModal.tsx`/`ClaimGoalModal.tsx` and the corresponding backend tests, since they depend on rarer random card draws that didn't come up in this session's ~12 turns): a Broker discount actually applied at auction settlement (no Rail stock was in the market while Rail Broker was held), a public or private goal claim from the UI, a Foresight reorder prompt, a Backroom Deal trade, a Double Down doubling, and the game-over screen's bonus-card breakdown. Worth a follow-up session if a live screenshot of these specifically is wanted.
- [x] Checked the browser console throughout: **zero application errors** the entire session. The only console error at any point was a harmless `favicon.ico` 404 on first load (no `favicon` file exists in `frontend/public/`; cosmetic, pre-existing, not V5-related).
- [ ] Did not play to actual completion in this session (progress tracker reached 3/12 after ~12 turns; reaching threshold would need substantially more turns than were practical to click through by hand). Full-completion correctness is covered instead by the Phase 10 bot-driven integration suite (`bot_full_game.test.ts`, 35 cases across all player counts).
- **Two minor pre-existing (non-V5, not fixed) UX quirks found along the way**: (1) `App.tsx`'s `myName` is fetched once via `api.me()` and doesn't reflect a same-session `join` until the next `state.mode` change or a page reload — cosmetic (the "· You" tag doesn't appear immediately), not a functional bug. (2) Starting a game from the lobby can briefly land the starting player's own client in the `game_in_progress_spectator` view instead of the seated game view, until that tab reloads (a cookie/session-identity race between `start` and the WS reconnect) — confirmed a manual reload immediately fixes it. Neither is part of the V5 migration's scope (both predate it, in `App.tsx`/`ws.ts`), but worth fixing in a future pass since the second one is a real first-impression papercut.
- [ ] Re-run this checklist once more at the end of Phase 12 as a final sign-off (per the original plan) — still pending.
- [x] Commit (this plan update; no code fixes were needed as a direct result of this QA pass beyond what Phase 9/10 already fixed).

---

## Phase 12 — Playtestable End-State & Cleanup

**Status:** not started
**Rationale:** closes the loop on the actual goal — start a V5 game, play against bots, play against friends online.

- [ ] Full build (shared → backend → frontend) with zero TypeScript errors.
- [ ] Full `npm test` green (backend + frontend + root).
- [ ] `verifyE2E.ts`/`verifyHttp.ts` updated for V5 shapes and passing.
- [ ] Manual multi-tab local playtest: 2+ browser tabs as different human players (no bots), play a full game together, confirming the "play against friends online" path works, not just the bot-driven path.
- [ ] Delete now-dead code: `tryFireBlackMarketTrigger`/`startSideAuction`/`sideAuctionTip`/`resumePhase` (if fully orphaned), `MIN_TIPS`, `CLASSIC_RULES`, the Hot Tip/`peek_cards.json` loader path, `final_tip_play_choice` prompt copy.
- [ ] Update root `CLAUDE.md` and `online/PLAN.md`/`PROGRESS_LOG.md` to reflect V5 as the shipped ruleset (avoid stale V4 references confusing a future session). Note: create this plan's real repo copy as a **distinctly-named file** (e.g. `online/V5_MIGRATION_PLAN.md`) — do NOT name it `plan.md`, since macOS's default case-insensitive filesystem would collide with the existing `online/PLAN.md`.
- [ ] Final Phase 11 browser-QA checklist re-run as closing sign-off.
- [ ] Commit.

**Explicitly out of scope, left for a clearly separate future project:** value-net retraining / growing the frozen 40-slot feature schema to give bots learned (rather than heuristic) judgment over the new cards, dice bag, and drafting. Heuristic bots from Phase 8 are the intended permanent V5 baseline until that's separately scoped.

---

## Open rules items carried forward (non-blocking, tunable later)

From `v5_tuning_notes.md`: initial goal-reveal count (flat 4, Phase 2's `RulesConfig` knob), progress-tracker threshold formula (flat 4×players, Phase 2's knob, empirically checkable via `measureGameLength.ts` in Phase 8), slump-card color-pair asymmetry (cosmetic, no code impact), Informant's name (cosmetic), Broker card names (cosmetic, JSON `name` field only). None of these block any phase above.

## Critical files (most-touched, for quick reference)

`online/shared/src/state.ts`, `cards.ts` · `online/backend/src/domain/setup.ts` · `online/backend/src/engine/advance.ts`, `actionCards.ts`, `eventDeck.ts` (renamed), `scoring.ts` · `online/backend/src/bots/decide.ts` · `online/frontend/src/game/Header.tsx`, `CardTile.tsx` · `online/backend/tests/integration/_invariants.ts`

## Verification summary

Every phase above ends in either a passing test suite addition or a passing build; Phase 10 is the full-regression gate (100% green `npm test` required before Phase 11); Phase 11 is real-browser verification via Playwright tooling against the actual running dev server; Phase 12 is the final manual friends-playtest + cleanup + re-verification sign-off.
