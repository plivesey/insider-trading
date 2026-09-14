# Implementation Progress Log

Append-only log of every significant change made while building the online version of Insider Trading V4. See `PLAN.md` for the overall plan. Each entry: `## YYYY-MM-DD — Phase N: short subject` followed by 1–3 lines on what happened, what was decided, what was tested.

## 2026-05-23 — Phase 0: workspace scaffolding started
Created `online/` directory tree (backend/{src,tests,scripts,game_logs}, frontend/{src/{lib,hooks,pages,game,__tests__}}, shared/src, scripts). Copied PLAN.md from approved plan. Initialized this PROGRESS_LOG.md.

## 2026-05-23 — Phase 0: package.json + tsconfig + jest + vite configured
Wrote `online/package.json` (workspaces) + per-package package.json for shared/backend/frontend. tsconfig.base.json with `@shared/*` path alias. Backend uses ts-jest/ESM preset; frontend uses Vite + Vitest. `npm install` succeeded (691 packages). Removed stray `../shared/src/**/*` include from backend/frontend tsconfigs — typecheck passes via path alias only.

## 2026-05-23 — Phase 0: dev scripts verified
`npx tsc -p */tsconfig.json --noEmit` is green for all three workspaces with placeholder files. Phase 0 done.

## 2026-05-23 — Phase 1: shared types written
shared/src now exposes `cards.ts` (StockCard/ActionCard/InsiderTipCard/GoalCard/LoanCard/HotTipCard discriminated unions), `state.ts` (GameState, PlayerPrivate/Public, AuctionState, PromptEnvelope, FreeActionQueueEntry, GameOver, ProjectedGameState), `protocol.ts` (REST request/response shapes + WS envelopes + cookie name `itPlayerId`), `cardLoader.ts` (reads /cards/*.json, attaches uids `stock-N` etc and `category` discriminator).

## 2026-05-23 — Phase 1: cardLoader test green
Wrote `backend/tests/unit/cardLoader.test.ts` asserting counts (36/11/16/14/6/6), uid uniqueness, category discriminator on every card, and per-color stock special distribution. Hit `__dirname is not defined` under ESM — switched to `fileURLToPath(import.meta.url)`. Switched test script to `NODE_OPTIONS=--experimental-vm-modules jest` so it finds the hoisted Jest binary. All 4 tests pass. Phase 1 done.

## 2026-05-23 — Phase 2: rng (mulberry32) + deck (shuffle/draw/reshuffle) + prices (adjust/halve/adjustAll/setPrice/priceOf) + setup (createGameState) + gameLog (per-game .jsonl file) + MutateQueue (serial async, snapshot, broadcast, rollback on throw) all written and unit-tested. 27 tests pass. Phase 2 done.

## 2026-05-23 — Phase 3+4: turn engine + auction engine
Added GameState.turnPhase ('awaiting_turn_action' | 'in_auction' | 'awaiting_die_roll' | 'turn_complete') + GameState.auction. Built engine/turn.ts (sellStock, payBank/autoLoan, resolveStockSpecialOnBuy, refillMarketIfNeeded, rollEndOfTurnDie, checkEndConditions, advanceTurn) and engine/auction.ts (startAuction, bid, pass, internal resolve). Sequential round-robin auction with Preferred Bidder tie-break. engine/advance.ts auto-progresses (drains free queue, rolls die, advances turn) after every mutation. engine/promptResponse.ts handles peek_ack and pick_color sub-prompts (Tip-Off). engine/insiderTip.ts resolves crash/surge/slump. engine/scoring.ts computes wealth + winners with stocks-held tiebreak.

12 new tests in turnEngine.test.ts cover: autoLoan math, startAuction permissions/prompts/no-bidder resolution, full turn drive with passes/sub-prompts/die roll/advance, sellStock permissions/price-move/Wild-Share refusal/Informant peek, Preferred Bidder tie-break. 39 total tests pass. Phases 3+4 done.

## 2026-05-23 — Phase 5: free actions, action cards, goal claims
Wrote engine/freeActions.ts (submitFreeAction queues; processNextFreeAction drains and dispatches play_action_card/use_hot_tip/claim_goal). engine/actionCards.ts implements all 11 action cards by setting appropriate prompts (Tipster's Choice → draw_and_keep; Corner the Market → pick_market_card; Pump and Dump → pick_stock_from_hand; The Squeeze → pick_color_amount; Wild Speculation → reveals top stock, prompts ±3; Preferred Bidder → persistent; Forgery → flag; Hostile Takeover → 2-stage; Rumor Mill → per-color choices; Inside Track/Wiretap → reorder_tips). engine/goals.ts validates stock assignment with Wild Share substitution and Forgery discount, applies rewards. engine/promptResponse.ts expanded to handle every prompt type (auction_bid is excluded — that goes via /auction-bid).

Replaced ESM-incompatible `require()` lazy imports in turn.ts and promptResponse.ts with normal static imports (no cycle exists). 19 new tests in freeActions.test.ts cover all 11 action cards, Hot Tip, multiple goal-reward types (gain_cash, set_stock, end_game_cash, steal_from_all), Wild Share substitution, Forgery discount, insufficient-stock rejection, and game-over trigger from goal claim. 58 total tests pass. Phase 5 done.

## 2026-05-23 — Phase 6: REST + WebSocket API
Wrote state/serverState.ts (ServerHub holding lobby + MutateQueue + card catalog + paths). http/projection.ts redacts per-player view (myPlayer with hand, other players hand-size only, myPrompt for me only). http/cookies.ts wraps the `itPlayerId` cookie (httpOnly, sameSite=lax, NOT Secure — plain HTTP per PLAN). http/routes.ts defines /me /join /start /reset /state /turn-action /auction-bid /free-action /prompt-response. http/ws.ts attaches a WebSocketServer at /ws, authenticates via cookie, broadcasts state+log on every mutation. server.ts wires Express + cookie-parser + cors + Router + WsHub on http.createServer(). Server boots; /healthz and /api/state both work via curl.

8 supertest HTTP integration tests in tests/integration/http.test.ts cover: empty lobby → joins → state, duplicate-name rejection, cookie persistence via request.agent(), start-too-few-players, start succeeds with hand projection (my hand visible, others' redacted), spectator gets game_in_progress_spectator, full auction round-trip across 2 cookie jars including sub-prompt resolution, /reset returns to lobby. 66 total tests pass. Phases 6+7 done (Phase 7 already split across earlier phases + http.test.ts).

## 2026-05-23 — Phase 7: full-game in-process integration
Wrote tests/integration/full_game.test.ts with a deterministic AI that drives full games via direct engine calls. AI starts $0 auctions, passes, drains every prompt type to a sensible default, auto-claims qualifying goals incl. Wild Share substitution. Asserts: gameOver set with valid reason, wealth math correct (cash + Σ stock·price + endGameBonus − 12·loans), no card uid leaks (every uid in the universe still present somewhere). 2 and 4 player games both terminate cleanly. 68 total tests pass.

## 2026-05-23 — Phase 8: HTTP verification (CHECKPOINT 1) green
Wrote backend/scripts/verifyHttp.ts. Spawns server on port 0 (random), creates 3 cookie-jar clients via fetch+Cookie header, walks: empty lobby → 3 joins → start → 8 turns of auctions+passes+prompt-drains → /reset → back to lobby. Asserts every step. Fixed bug: server.listen(0) returns 0 in the StartedServer; switched to server.address().port to expose the OS-picked port. Script exits 0. Phase 8 done.

## 2026-05-23 — Phase 9+10: frontend skeleton + game UI
React+Vite+TS app under frontend/src. lib/api.ts (typed fetch wrapper with credentials:'include'), hooks/useGameState.ts (WS client with exponential backoff reconnect), pages/Lobby.tsx, pages/GameInProgressBlock.tsx. Game UI: GameBoard, MarketPanel, GoalsPanel, PlayersPanel, MyHand, AuctionPanel, TurnPanel, FreeActionPanel, PromptModal (handles every prompt type), LogFeed, GameOverPanel, cardLabel helper, styles.css. App.tsx routes by state.mode: lobby / game_in_progress_spectator / in_game / game_over. Vite proxies /api and /ws to backend.

## 2026-05-23 — Phase 10: typecheck fixes
Three TS errors uncovered by `tsc --noEmit`: GameBoard passed nullable myPlayer to MyHand (wrapped in conditional), PromptModal interpolated `unknown` into JSX (String()-coerced), TurnPanel indexed StockPrices with `any` (cast through Color). All three workspaces typecheck clean.

## 2026-05-23 — Phase 10: lobby broadcast middleware ordering bug
`server.ts` registered the lobby-rebroadcast middleware AFTER the /api router, so its `res.on('finish')` handler was attached after the route had already sent a response → tab 2 never saw tab 1's join. Fixed by moving the middleware before the router. Also simplified the conditional: always rebroadcast after any /api request (the prior gating on `!getGame() || gameOver` missed the lobby→in_game start transition, which goes through queue.setState and does NOT trigger the MutateQueue broadcaster).

## 2026-05-23 — Phase 10: cookie-preserving rejoin
`ServerHub.join` minted a fresh uuid for every lobby entry, ignoring the existing cookie's playerId — so after /reset, the frontend's "New Game" flow would mint a new playerId instead of preserving the browser's cookie identity. Fixed: when no matching lobby entry, reuse `existingPlayerId` if provided. PLAN.md said "The cookie is preserved so the same browser can re-join" — now it actually is.

## 2026-05-23 — Phase 10: verifyFullGame.ts (HTTP, 2-player, to completion)
Phase 10 doneness asked for a manual 2-tab playthrough; added backend/scripts/verifyFullGame.ts as the autonomous equivalent. Two cookie-jar clients drive a full 2-player game over HTTP to gameOver (goal-claiming AI with Wild-Share substitution + greedy auctioning + prompt-drainer), then asserts: game ended via a valid reason, breakdown for both players, /reset returns to lobby, /me preserves playerId after reset, re-join preserves playerId via cookie. Exits 0.

## 2026-05-23 — Phase 10: live UI verified via Playwright
Drove the running dev servers with playwright-mcp: Alice joined in a real browser tab, Bob joined via curl on a separate cookie jar, Alice's tab live-updated to show both lobby members, Start Game transitioned both views to in_game, Bob's start_auction triggered Alice's AuctionPanel with bid/pass controls, Alice's pass advanced the auction → Bob won → Yellow $5, market refilled, turn advanced to Alice with "Your Turn" panel and a populated log feed. Confirms the full UI loop end-to-end. Phase 10 done.

## 2026-05-23 — Phase 10: regression check
`npm test -w backend` still 68/68 green after the cookie + middleware fixes. No frontend tests yet (Phase 11).

## 2026-05-23 — Phase 11: frontend Vitest + RTL tests
Three suites: Lobby (5 tests; mocks api.join/start, covers empty/filled lobby, error path, start button), AuctionPanel (5 tests; covers no-prompt/auction_bid-prompt states, bid amount input, pass call, awaiting bidder rendering), useGameState (4 tests; FakeSocket harness covers open→state push, 200-cap log buffer, exponential reconnect backoff, no reconnect after unmount). 14/14 pass in 750ms.

## 2026-05-23 — Phase 12: groundwork — op-events + replay module
Added `op_*` events at the route boundary (`op_start_auction`, `op_sell_stock`, `op_auction_bid`, `op_auction_pass`, `op_free_action`, `op_prompt_response`) carrying the raw HTTP body. Wrote `backend/src/domain/replay.ts` (replayFromLog + diffStates) — feeds events back through the engine to reproduce final state, with a structural comparator that ignores non-deterministic fields (timestamps, connected map, eventCounter, sub-event payloads). Added `defaultSeed` to ServerHub and threaded `SEED` env var through startServer.

## 2026-05-23 — Phase 12: real engine bug — sell_bonus_batch termination
The `sell_bonus_batch` sub-prompt (issued by goal-6's reward) had no terminal exit when the player runs out of sellable stocks: `{done:true}` without `stockUid` was rejected with "stockUid required", and `{stockUid:X}` only worked with a valid uid. Engine fix in `promptResponse.ts`: when mode === 'sell_bonus_batch' and `response.done && !stockUid`, clear the prompt and emit `sell_bonus_done`. Without this fix the verifier hung the prompt and the game never ended.

## 2026-05-23 — Phase 12: real bug — game_start never written to per-game log
`createGameState` builds the initial `game_start` log entry into `state.log` but it never reached the per-game `.jsonl` file — the MutateQueue only appends events from mutations. Replay then failed on its first event ("first event must be game_start, got op_free_action"). Fix in `serverState.startGame`: explicitly `appendLog(ev)` for the initial state's log array immediately after `openLog`.

## 2026-05-23 — Phase 12: non-determinism — prompt IDs
`newPromptId()` uses `Date.now()` + a module counter, so replay generates different IDs and `op_prompt_response` from the original session fails the "stale prompt id" check. Resolved by relaxing replay: when applying `op_prompt_response`, use whatever prompt is currently active for the actor. Event ordering guarantees we're at the right step.

## 2026-05-23 — Phase 12: verifyE2E.ts and assertion sweep
`scripts/verifyE2E.ts` (root). Boots backend with SEED=1234 + 3 cookie-jar+WS clients, deterministic AI: bid currentHigh+1 if affordable else pass; on-turn auction the cheapest stock at $1 or sell if cash<$5; greedily claim any qualifying goal with Wild Share substitution + Forgery; play any unplayed action card on every free-action opportunity; use Hot Tip once. Loops to gameOver, then asserts: (1) valid end condition, (2) full wealth math + winners match, (3) no card uid leaks against the initial post-setup universe (NOT the catalog — the game only uses `2*players-1` tips and `players+2` goals), (4) replay log .jsonl reproduces live state via diffStates, (5) action card coverage (warning only, per plan). Wired as root `npm run verify`. Exits 0 in ~1.4s.

## 2026-05-23 — Phase 12: bug in AI — goal requirement schema
Initial AI read `goal.goal.requirements` (an array) but the actual schema is `goal.goal.parsed.requirements` (object `{Color: count}`). So tryBuildGoalAssignment always returned `{}`, the engine rejected with "goal requirement not met", and the script retried in an infinite loop until safety cap (5000 iterations, ~80s). Fixed the field path and added a failed-attempt blacklist keyed by (playerId, goalUid, hand-fingerprint) so future spins are cheap.

## 2026-05-23 — Phase 12: action card coverage
With SEED=1234 and the deterministic AI, 7 of 11 action cards land in hands and get played; 4 (Wild Speculation, Preferred Bidder, Stock Certificate Forgery, Inside Track) stay in mainDeck because the game terminates after ~47 turns. Swept seeds 1–80; best is seed 52 at 8/11. Per the plan, missing-card coverage is a warning, not a failure — kept seed 1234 (plan-specified) and log the gap.

## 2026-05-23 — Phase 13: error toasts + your-turn highlight + connection state
Replaced all blocking `alert(e.message)` calls (8 sites) with a small toast module (`lib/toast.ts` + `components/ToastRack.tsx`) that pushes auto-dismissing error pills at the top of the page — non-blocking, visible, accessible. Added a yellow border + glow to the TurnPanel when it's the player's turn (matches the existing player-card highlight). Disconnected state on the conn indicator now goes red so dropped WS connections are obvious. 14/14 frontend tests still green; `npm run verify` still exits 0.

## 2026-05-23 — Plan complete
Phases 0–13 done. End-state: backend 68 tests + frontend 14 tests + 1 HTTP verification script + 1 full-game HTTP script + 1 root E2E verification script. Production-shape Node/TS backend + React/TS frontend, single in-memory game, cookie-based identity, WS state push, per-game .jsonl logs with deterministic replay, full UI playable across multiple browser tabs.
