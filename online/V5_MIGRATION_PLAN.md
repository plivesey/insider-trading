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

**Status:** not started
**Rationale:** the online app loads cards directly from root `/cards/*.json`, and this plan references `rules.md` throughout. Both must be fully consistent with V5 (including the two decisions above) before any code changes.

- [ ] `cards/stock_cards.json`: rename all 8 `"color": "Yellow"` entries to `"color": "Green"`.
- [ ] `cards/action_cards.json`: delete the 2 `Black Market` (`auction_unused_tip`) entries. Append 4 new entries for Oil/Rail/Steel/Bank Broker (new effect type `broker_discount`, persistent, one per color). File goes from 13 → 15 entries.
- [ ] Author a new `cards/starter_deck.json`: 24 entries — 12 basic stock cards (3 each Blue/Orange/Green/Purple, `type: 'blank'`) + 12 starter action cards transcribed verbatim from `rules.md` (7 playable: Fire Sale, First Look, Foresight, Windfall, Market Panic, Backroom Deal, Double Down; 5 hidden bonus, never played: Nest Egg, Portfolio, Trophy Case, Clean Ledger, Easy Credit).
- [ ] `rules.md`: fix "17 action cards"/"53-card market deck" → 15/51 (the Broker-card and market-deck-size lines), and rewrite the Black Market row to state it's removed from V5.
- [ ] `v5_tuning_notes.md`: mark the Black Market item resolved ("removed"), leave the rest as-is.
- [ ] Root `npm test` still passes (these files are covered by root Jest tests — update `tests/*.test.js` counts as needed for the new numbers).
- [ ] Commit.

---

## Phase 1 — Shared Types & Card Data Loading Rewrite

**Status:** not started
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
  - `PromptType`: drop `'final_tip_play_choice'` (dead — no more deck-exhaustion end condition). Add `'setup_draft_pick'`, `'foresight_reorder'`, `'backroom_deal_pick_own_card'`, `'backroom_deal_pick_market_card'`.
  - `ProjectedGameState`: mirror the renames (`eventDeckSize`, `goalRow`, `progressTracker`, `progressThreshold`).
- [ ] `protocol.ts`: `FreeActionRequest` gains `'claim_private_goal'` (source: the player's own hand) alongside `claim_goal`; consider renaming `'play_insider_tip'` → `'play_market_movement'` for clarity (optional, do it if convenient).
- [ ] **Tests**: rewrite `backend/tests/unit/cardLoader.test.ts` for the new counts (36 stock incl. 8 Green, 15 action, 30 event-deck source, 24 starter deck) and assert `Yellow` appears nowhere. New test asserting the `DICE` table: 6 dice, 6 faces each, exact face multiset per die.
- [ ] Commit.

---

## Phase 2 — Backend Domain: V5 Setup & Draft

**Status:** not started
**Rationale:** setup is the most mechanically distinct part of V5. Isolate it so later phases can assume "every player already has a legal 3-card V5 hand."

Files: `online/backend/src/domain/setup.ts` (rewrite `createGameState`), new `online/backend/src/engine/setupDraft.ts`.

- [ ] Delete `makeBuyCard`/`makeHotTipCard` helpers.
- [ ] Market deck: `[...catalog.stocks, ...catalog.actions]` (51 cards), shuffle, reveal 5.
- [ ] Event deck build: shuffle `[...catalog.insiderTips, ...catalog.goals]` (30), flip one at a time until `rules.initialGoalRevealCount` goals have surfaced → `goalRow`; gather everything else (flipped market-movement cards + untouched remainder) into one pile, reshuffle → `state.eventDeck`.
- [ ] Starter deck build: shuffle `catalog.starterDeck` (24).
- [ ] Deal 2×players from `eventDeck` + 2×players from starter deck (face-down), combine into ONE pile, reshuffle **together** (not a guaranteed 2-and-2 split per player — this is intentional, per rules.md), deal 4 face-down to each player. Leftover undealt starter cards are discarded from the game (never tracked again).
- [ ] Implement the pass-and-draft-to-3 as an explicit new setup sub-phase (it needs live per-player choices, so it can't be a pure synchronous function like V4's setup):
  - Game starts in `turnPhase: 'setup_draft'`.
  - `beginDraft(state)`: deals the 4-card hands, issues a `'setup_draft_pick'` prompt to every player simultaneously.
  - `submitDraftPick(state, playerId, keepUid)`: removes the kept card into the player's permanent hand, stages the other 3 to pass left. Once all players have picked for a round, rotate the staged piles and issue the next round's prompt (3 cards → keep 1 → pass 2; then 2 cards → keep 1 → auto-discard the last, no prompt needed for that final discard). On completion, transition to `'awaiting_turn_action'` and start turn 1.
- [ ] `cash: 25` (was 30), starting `hand: []` (draft populates it). `progressTracker: 0`, `progressThreshold: computeProgressThreshold(numPlayers, rules)`. `diceBagRemaining: ['A1','A2','B1','B2','C','D']`. Stock prices stay $4 flat (unchanged). Random first player, clockwise (unchanged logic).
- [ ] **Tests**: rewrite `backend/tests/unit/setup.test.ts` for V5 (deck sizes, $25 cash, `MAX_LOANS=2`, no Hot Tip/Market Order, `progressThreshold` matches default formula). New `setupDraft.test.ts`: drive a full 3-round draft across 2–6 players; assert every player ends with exactly 3 cards, total-card conservation (4×players dealt = 3×players kept + 1×players discarded), no uid duplicated or lost.
- [ ] Commit.

---

## Phase 3 — Backend Engine: Dice Bag & Event-Deck Resolution

**Status:** not started
**Rationale:** the riskiest mechanical piece (order-sensitive multi-card resolution, threshold-check timing). Isolate before wiring goals/scoring on top.

Files: `online/backend/src/engine/rng.ts`, `turn.ts`, rename `insiderTip.ts` → `eventDeck.ts`.

- [ ] `rng.ts`: delete `rollD6`. Add `drawDieFromBag(state): DieId` (refills `diceBagRemaining` to all 6 *before* drawing if it was empty, then removes one at random) and `rollDieFace(dieId, state): DieFace` (uniform pick from `DICE[dieId]`).
- [ ] `eventDeck.ts` (renamed from `insiderTip.ts`):
  - `resolveMarketMovementCard(state, card, events)`: same effect shapes as V4 (halve / per-color adjust), reused almost verbatim. Always +1 to `progressTracker`; pushes to `resolvedEventCards`.
  - `resolveEventCard(state, card, events)`: dispatch by category — `insider_tip` → `resolveMarketMovementCard`; `goal` → push to `goalRow` (public), does **not** touch the tracker.
  - `drawFromEventDeck(state, n, events)`: draws up to `n` cards one at a time, resolving each in sequence via `resolveEventCard`, stopping early only if the deck empties. **No threshold check between cards** — that happens once, after this returns.
- [ ] `turn.ts`: replace `rollEndOfTurnDie` with `resolveEndOfTurnDiceBag(state, events)`: draw a die, roll its face, dispatch (`bull`→all prices +1, `bear`→all prices −1 floored at 0 [reuse existing `adjustAll` helper], `draw1/2/3`→`drawFromEventDeck`, `nothing`→log only). The threshold check runs once in `advance.ts` right after this call (Phase 4).
- [ ] Replace `checkEndConditions`'s body with `checkProgressThreshold(state, events)`: ends the game the instant `progressTracker >= progressThreshold`, reusing `computeBreakdown`/`selectWinners` from `scoring.ts` (rewritten in Phase 6).
- [ ] **Tests**: new `diceBag.test.ts` (bag empties after 6 draws and refills correctly; face distributions match `DICE`; a `draw3` face resolving goal+goal+tip only bumps the tracker once, for the tip). New `eventDeck.test.ts`, most importantly: a multi-card draw where the tracker crosses threshold on card 2 of 3 still resolves card 3 before game-over is set. Rewrite `turnEngine.test.ts` for `resolveEndOfTurnDiceBag` across all 6 `DieId`s.
- [ ] Commit.

---

## Phase 4 — Backend Engine: Goals (Public + Private) & Progress-Tracker End Condition

**Status:** not started
**Rationale:** goals are now two pathways that both feed the same tracker from Phase 3; this is also where the simultaneous-dual-claim edge case lives.

Files: `online/backend/src/engine/goals.ts`, `freeActions.ts`, `advance.ts`.

- [ ] `claimGoal` (public path): source renamed `goalRow`; on success, +1 `progressTracker` (new — V4 had no tracker).
- [ ] New `claimPrivateGoal(state, player, goalUid, assignment, events)`: source is `player.hand`. Factor the shared stock-assignment/Wild-substitution validation out of the old `claimGoal` into a helper both functions call, rather than duplicating it. On success: remove the goal card from hand, push to `player.goalsClaimed`, apply reward via the existing (unchanged) `applyReward`, +1 `progressTracker`.
- [ ] Simultaneous-claim handling: whenever a public goal newly enters `goalRow` (setup reveal or a dice draw), immediately check — in the same mutation, before any player can act — whether multiple current hands already satisfy it. If so, apply the reward to **all** qualifying players in one pass, remove the goal, bump the tracker **once**. Implement as `checkSimultaneousGoalClaims(state, newGoal, events)`, called right after a goal is placed into `goalRow` in both places that can happen (setup, `drawFromEventDeck`).
- [ ] `freeActions.ts`: add the `'claim_private_goal'` branch alongside the existing ones.
- [ ] `advance.ts`: swap in `checkProgressThreshold` and `'awaiting_dice_bag_draw'`/`resolveEndOfTurnDiceBag`. **Delete** the `tryFireBlackMarketTrigger` call and import entirely. Add a no-op branch for `turnPhase === 'setup_draft'` (draft progression is driven by `submitDraftPick`, not `advance()`'s auto-loop, since it needs one prompt per player per round rather than a single current player).
- [ ] **Tests**: rewrite `freeActions.test.ts` to cover both claim paths, including a private-goal claim via Wild Share. New `goalsV5.test.ts`: private claim removes card from hand + bumps tracker; a dual-qualifying public goal pays both players but bumps the tracker once; nothing happens automatically without an explicit free-action submission.
- [ ] Commit.

---

## Phase 5 — Backend Engine: Action Cards (Starter + Broker) & Auction Cleanup

**Status:** not started
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
- [ ] `auction.ts`: delete `tryFireBlackMarketTrigger`, `startSideAuction`, and the `sideAuctionTip`/`resumePhase` fields on `AuctionState` (confirm nothing else needs `resumePhase` before deleting). Add `applyBrokerDiscount(state, winner, color, amount)` at auction settlement — checks `winner.persistentEffects` for a matching Broker card, subtracts $2 floored at $0.
- [ ] `turn.ts::resolveStockSpecialOnBuy`: Informant now triggers on **buy** (move its logic here from `sellStock`, delete it from `sellStock`), peeking **2** event-deck cards instead of 1. Scout unchanged.
- [ ] `promptResponse.ts`: add handlers for the new prompt types from Phase 1; delete the `'final_tip_play_choice'` case.
- [ ] **Tests**: new `actionCardsV5.test.ts` — one case per new effect (Fire Sale, First Look, both Foresight paths, Windfall, Market Panic incl. the floor-at-$0-no-loan case, Backroom Deal incl. trading away a private goal and confirming it's now visible in market, Double Down incl. doubling a card and the cannot-target-persistent/bonus guard, all 4 Broker discounts). Remove/rewrite any existing test asserting `auction_unused_tip`/side-auction behavior.
- [ ] Commit.

---

## Phase 6 — Backend Scoring Rewrite

**Status:** not started
**Rationale:** small and surgical, but every game ends here — sequenced after Phase 5 so bonus cards and `goalsClaimed` are fully wired first.

Files: `online/backend/src/engine/scoring.ts`.

- [ ] `loanPenaltyFor(loans, hasEasyCredit)`: replace the escalating formula with `0→$0, 1→$12, 2→$26`, or `loans * 10` flat if `hasEasyCredit`.
- [ ] `computePlayerWealth`: add a bonus-card pass over `player.hand` (bonus cards only ever live there): Nest Egg +7 flat, Portfolio +2 × every stock card held (Wild included — reuse the existing stock-count logic), Trophy Case +3 × `goalsClaimed.length`, Clean Ledger +10 if `loans === 0`. Detect Easy Credit and pass into `loanPenaltyFor`. Fold the bonus total into the existing `endGameBonus` field (same semantic category as a goal's end-game cash reward).
- [ ] **Tests**: new (or rewritten) `scoring.test.ts` — one case per bonus card, 0/1/2 loans without Easy Credit, 2 loans with Easy Credit (confirm $20 not $26), one "everything at once" combined case.
- [ ] Commit.

---

## Phase 7 — API / Protocol Wiring

**Status:** not started
**Rationale:** thread the new setup-draft phase and new request/prompt kinds through HTTP/WS. No version branching — a direct rewrite of the single existing path.

Files: `online/backend/src/http/routes.ts`, `projection.ts`, `online/backend/src/state/serverState.ts`.

- [ ] `routes.ts`: audit every endpoint for correct behavior if a request arrives during `turnPhase === 'setup_draft'` (should reject cleanly, matching the existing "pending prompts must resolve first" pattern already used elsewhere).
- [ ] `projection.ts::projectState`: rename fields per Phase 1 (`eventDeckSize`, `goalRow`, `progressTracker`, `progressThreshold`). Verify (by reading this file fresh) that the existing allow-list logic doesn't need any new special-casing for `goal`/`bonus` cards sitting privately in another player's hand — it shouldn't, since hands are already redacted wholesale per-player, but confirm before assuming.
- [ ] `serverState.ts`: `catalog` now includes `starterDeck`. No other changes needed (bot-net loading is unrelated).
- [ ] **Tests**: rewrite `backend/tests/integration/http.test.ts` for the setup-draft flow over HTTP and the renamed `/state` fields.
- [ ] Commit.

---

## Phase 8 — Bot AI: Heuristics for All New V5 Decision Points

**Status:** not started
**Rationale:** ships playable bots without touching the frozen value net. Widest fan-out across files (bot dispatch is duplicated 3–4× today) — fix that duplication *before* piling new cases onto it, not after.

Files: `online/backend/src/bots/decide.ts`, `valuation.ts`, `actionHeuristics.ts`, `runner.ts`, `selfPlay.ts`, `bot_full_game.test.ts`, `analyzeBotGame.ts`, `scripts/measureGameLength.ts`, `analyzeGoals.ts`.

- [ ] **First**: extract one shared `executeBotAction(state, botDecision)` function (e.g. into a new `bots/execute.ts`) that `runner.ts`, `selfPlay.ts`, `bot_full_game.test.ts`, and `analyzeBotGame.ts` all import, instead of 3–4 independently-maintained copies. Do this before adding the new V5 action kinds below, so they only need to be wired in once.
- [ ] `decide.ts::decideBotAction`: add a `turnPhase === 'setup_draft'` branch — `chooseDraftKeep(hand, botProfile): uid`, ranking the (up to 4) candidates via `valuation.ts`'s existing per-card-type value functions, extended to also value `GoalCard` (simple: reward payout value, undiscounted by completability, since deeper play is out of scope) and `BonusCard` (flat per-card heuristic values, e.g. Portfolio scaled by expected end-game stock count).
- [ ] Fix the flagged "always claim any satisfiable goal instantly" bug **for private goals only**: keep public goals claimed instantly (unchanged — no new information is created by revealing a public claim), but for private goals, claim immediately **unless** holding a Trophy Case bonus card with enough estimated turns left to plausibly complete more goals first — in which case delay briefly. Keep this simple; a deeper "bluff by concealing a completed private goal" strategy is explicitly out of scope for a heuristic bot.
- [ ] `valuation.ts::actionCardBaseValue` / `actionHeuristics.ts::shouldPlayActionCard`: both switch exhaustively over `ActionEffect` — add the 8 new cases (compile errors will mark every required site). Rough dollar-equivalent heuristics: Fire Sale ≈ (target stock's value − $3); First Look ≈ half a random stock's expected value; Foresight ≈ small constant; Windfall = $5; Market Panic ≈ $3×(other players), discounted; Backroom Deal ≈ (market card's value − own worst card's value); Double Down ≈ (2× best other single-use card's value − $2); Broker cards ≈ small constant × expected future auctions won in that color.
- [ ] Add a mild "dice awareness" discount/boost to auction bid ceilings in `decide.ts` reflecting expected Bull/Bear draws before an estimated game end — coarse, not a full expectation calculation.
- [ ] `measureGameLength.ts`/`analyzeGoals.ts`: update `RulesConfig` overrides to the new V5 knob names and the single new end-reason value. (Once this phase lands, informally run `measureGameLength.ts` to sanity-check the default `4×players` progress threshold empirically — not a blocking gate, just useful signal for the open tuning item.)
- [ ] **Tests**: rewrite `bot_valuation.test.ts`/`botParams.test.ts` for the new effect valuations (spot-check Windfall/Broker/Double Down at minimum, since they have unambiguous correct values). Rewrite `botSell.test.ts`/`selfPlay.test.ts` for the setup-draft phase and dice-bag turn structure.
- [ ] Commit.

---

## Phase 9 — Frontend Rewrite

**Status:** not started
**Rationale:** last major surface; depends on all backend types/shapes being final. Two sub-phases for committability.

### 9a — Progress tracker, dice bag, colors

Files: `frontend/src/game/theme.tsx`, `Header.tsx`, `RecentTip.tsx`, `DieRollOverlay.tsx`.

- [ ] `theme.tsx`: rename the `Yellow`→`Green` color key (display label "Rail" stays, since that was already the industry label pre-migration); update the accent color to an actual green.
- [ ] `Header.tsx`: replace the "TIPS LEFT" chip with a **visual step/progress element** (not just a bare number — the user specifically asked for a "step progress tracker") showing `progressThreshold - progressTracker` counting down as play proceeds, while the underlying field stays an up-counter. A simple segmented bar or step-dots row that fills/empties as the count changes is enough — doesn't need to be fancy.
- [ ] `RecentTip.tsx`: same countdown value swap; keep a secondary "event deck: N left" stat since that's genuinely different information (deck size vs. progress toward game end).
- [ ] `DieRollOverlay.tsx`: rewrite from the single `1..6` pip animation to a named-outcome model (`dieId`, `face`, optional list of drawn cards for `draw1/2/3` faces) with a short sequential reveal for multi-card draws, generalizing the existing multi-step timeout pattern already in this file.
- [ ] Commit.

### 9b — Cards, hand, goals, prompts

Files: `frontend/src/game/CardTile.tsx`, `cardLabel.tsx`, `HandDock.tsx`, `GoalsPanel.tsx`, `ClaimGoalModal.tsx`, `PromptModal.tsx`.

- [ ] `CardTile.tsx`/`cardLabel.tsx`: add a `goal` branch (goal text + requirement + reward; visually flagged "PRIVATE" when shown from `myPlayer.hand` vs "PUBLIC" from `goalRow`, via a `context` prop) and a `bonus` branch (name + effect text, a sealed/locked visual with no click affordance, since it's never played).
- [ ] `HandDock.tsx`: extend the click dispatch from 2 branches to 4 — action card → `play_action_card` (covers the 7 playable starter actions too, same category); market-movement card → renamed free-action kind; goal card → a "claim from hand" flow (not a "play") that opens the stock-assignment UI then submits `claim_private_goal`; bonus card → no-op/tooltip only.
- [ ] `GoalsPanel.tsx`: keep rendering `goalRow` for public goals; add a small "My Private Goals" section reading from the player's own hand.
- [ ] `ClaimGoalModal.tsx`: parameterize by `source: 'row' | 'hand'`, dispatching `claim_goal` or `claim_private_goal` accordingly; stock-assignment UI itself unchanged.
- [ ] `PromptModal.tsx`: remove `final_tip_play_choice`; add cases for `setup_draft_pick`, `foresight_reorder`, and the two Backroom Deal picker prompts (reuse existing list-picker UI patterns already used for similar prompts).
- [ ] Audit every place a color swatch renders (`CardTile`, `MarketPanel`, `Ticker`) to confirm the per-color icon (`icon-oil.png` etc.) always renders alongside the color, never color-alone — this is the mitigation for the Orange/Green colorblindness note in `v5_tuning_notes.md`.
- [ ] **Tests**: rewrite `AuctionPanel.test.tsx`/`useGameState.test.tsx`/`Lobby.test.tsx` for the renamed `ProjectedGameState` fields. New tests for the `goal`/`bonus` `CardTile` branches and `HandDock`'s 4-way dispatch.
- [ ] Commit.

---

## Phase 10 — Integration Tests & Full Regression Pass

**Status:** not started
**Rationale:** the real end-to-end confidence gate. Prior phases prove components in isolation; this proves a complete V5 game plays out correctly, repeatedly, across player counts and seeds.

Files: `backend/tests/integration/full_game.test.ts`, `bot_full_game.test.ts`, `_invariants.ts`, `http.test.ts`.

- [ ] `_invariants.ts::assertGameOverInvariants`: rewrite for the new single `GameOver.reason`, the new bonus-card/loan-penalty math (recompute independently here, don't just re-call `scoring.ts`, so this test actually catches regressions there), and extend uid-leak checks to `goalRow`, `eventDeck`, `resolvedEventCards`, any private goals still in hand at game end, and confirm discarded starter-deck cards are truly gone from every zone.
- [ ] `full_game.test.ts`: a scripted (non-bot) full game through setup-draft → several turns → forced dice-bag draws → a public goal claim → a private goal claim → game end via progress threshold, asserting the exact `progressTracker` value at each step (this is the highest-value test for catching an off-by-one in the "finish the whole draw before checking threshold" rule).
- [ ] `bot_full_game.test.ts`: full bot-vs-bot games for every player count 2–6, ~20 seeds each, asserting invariants on every run and a sane turn-count ceiling (regression guard against a livelock in the new draft phase or `advance()`'s new branches).
- [ ] New stress test: over many turns, confirm that within any window of 6 consecutive dice draws, each of the 6 `DieId`s appears exactly once (directly encodes the "without replacement, refill after 6" rule).
- [ ] Run the full `npm test` (root script runs backend then frontend) — must be 100% green before proceeding.
- [ ] Commit.

---

## Phase 11 — Browser QA

**Status:** not started
**Rationale:** the user explicitly asked for real browser verification — the existing `scripts/verifyE2E.ts` is API-level only (raw HTTP/WS, no DOM), which doesn't satisfy that ask.

Approach: use the Playwright browser tools available in this environment to drive the actual dev server through a real V5 game in a real browser (a one-time scripted checklist run, not necessarily a new permanent CI suite — that's a reasonable future add-on, not required now).

- [ ] Start the dev server, navigate to the lobby.
- [ ] Join as a human player, add 2+ bots, start the game.
- [ ] Verify the setup-draft UI end to end: 3 rounds of pick prompts render, hands end at 3 cards, the game auto-transitions into turn 1 once everyone's done.
- [ ] Screenshot the new progress-tracker element and confirm it visibly counts down.
- [ ] Trigger and screenshot: an auction with a Broker discount applied at settlement; a dice-bag Draw 2/3 overlay; a public goal claim; a private goal reveal-and-claim from hand; a Foresight reorder prompt; a Backroom Deal trade (including trading away a private goal and confirming it becomes visible in the market); a Double Down doubling another card's effect; the game-over screen with bonus-card contributions visible in the breakdown.
- [ ] Check the browser console for zero uncaught errors/warnings across the whole run.
- [ ] Play the game through to actual completion.
- [ ] Run this checklist once after Phase 10 passes, and once more at the end of Phase 12 as a final sanity pass.
- [ ] Commit (any fixes found along the way).

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
