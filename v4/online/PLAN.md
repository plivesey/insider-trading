# Online Insider Trading V4 — Implementation Plan

> **This is a living document.** It can (and should) be updated with more phases, refined acceptance criteria, and design changes as I learn things during implementation. If a phase turns out wrong or a new phase becomes necessary, edit this file and `PROGRESS_LOG.md` together so the plan and reality stay in sync.

## Context

The Insider Trading V4 board game currently lives only as JSON card files, rules, and a manual AI-facilitated playtest workflow. Manual playtests are slow and hard to iterate on. We want a real online web version primarily for playtesting — multiple humans (or AI agents driven through the API) can play a full game in their browsers, with the backend enforcing all rules.

**Goal:** ship a feature-complete online version with a Node/TypeScript backend, React/TypeScript frontend, and autonomous end-to-end verification I can run myself without a human in the loop.

## Confirmed design decisions

| Decision | Choice |
| --- | --- |
| Backend | Node.js + TypeScript (Express + ws + uuid + cookie-parser) |
| Frontend | React + Vite + TypeScript |
| Project location | `online/` with `backend/`, `frontend/`, `shared/` (npm workspaces) |
| Concurrency | One game at a time, single in-memory state, no multi-tenancy |
| Identity | No accounts. Name in lobby. Cookie-based session: server issues `playerId` UUID, sets httpOnly cookie. WS upgrade reads cookie. |
| Pass-and-play | Not supported. One browser = one player. |
| Spectators | None. Anyone who opens the site while a game is in progress sees "Game in progress, please wait". |
| Persistence | In-memory state + atomic JSON snapshot to `online/backend/game_state.json` (current game) + append-only per-game log file (see below) |
| Transport | Plain HTTP only — no HTTPS, no TLS. Local-network playtest tool. Cookies are httpOnly + sameSite=lax but NOT `Secure` (so they work over plain HTTP). |
| Real-time | WebSocket. Server broadcasts state (per-player projection) and per-player prompts on every mutation. |
| Auctions | Sequential round-robin. Auctioneer commits at initial bid; each other player in turn order prompted to bid-higher or pass; passes are sticky; resolves when only one bidder remains. |
| Free actions | Always-available. POST any time. Server queues, drains serially, blocks turn/auction prompts during drain. |
| Tests | Jest (backend), Vitest + RTL (frontend) |

## Per-game action log requirement

Every game gets its own **append-only** log file at `online/backend/game_logs/{startedAt-ISO}-{gameId}.jsonl` (JSON Lines, one event per line). Files are **never overwritten** — the directory grows over the lifetime of the project, giving a permanent archive of every playtest.

- When `POST /start` runs, the backend mints a `gameId` (UUID) and opens the log file. The first line is a `game_start` event with full initial state, player names, seed, and timestamp.
- Every subsequent `mutate` appends one event line: `{ timestamp, gameId, turnNumber, type, actor, payload, resultingPriceVector }`. Event types mirror the queue op types (`start_auction`, `bid`, `pass`, `auction_resolved`, `sell_stock`, `free_action`, `prompt_response`, `goal_claimed`, `die_roll`, `insider_tip_resolved`, `game_over`, etc.).
- The final line on game end is a `game_over` event with final wealth breakdown and end-condition source.
- `POST /reset` closes the current log file (it's already complete on `game_over`) and the next `/start` opens a new one.
- A unit test asserts: replaying a log file's events from initial state reproduces the final state byte-for-byte (round-trip fidelity).

This is distinct from `online/backend/game_state.json` (which only ever holds the **current** game) and from `PROGRESS_LOG.md` (which tracks my implementation, not gameplay).

## Progress logging requirement

Throughout implementation, I maintain `online/PROGRESS_LOG.md`. Every significant change appends an entry (timestamp + phase + one-line description + outcome). Target ~5–10 entries per phase — roughly one per bullet of acceptance criteria, or anywhere I make a non-trivial decision, hit a bug worth remembering, or discover the plan needs updating. Format:

```
## 2026-05-23 — Phase 2: deck.ts shuffle implemented
Seeded shuffle using a tiny xorshift PRNG so tests are deterministic. All deck tests passing.
```

If a log entry reveals the plan is wrong or incomplete, update this file too.

## Architectural backbone

- **Single serial mutation queue.** All state changes flow through one async queue in the backend: `mutate(label, fn)`. `fn` runs against the live `GameState`, then the result is JSON-persisted (atomic tmp+rename), appended to the per-game log (see below), and broadcast over WS. Turn actions, auction bids, free actions, prompt responses, and timer-driven events are all just queue entries — this is what makes free-action interrupts safe without ad-hoc locking.
- **Card uids.** Match `playtest/init.js` convention: every card gets a unique `uid` (`stock-N`, `action-N`, `itip-N`, `goal-N`, `loan-N`, `peek-N`) assigned at setup. A test asserts uniqueness across the universe.
- **Per-player state projection.** `GET /state` and WS broadcasts redact: other players' hands hidden (only sizes/counts), only own prompts visible, insider tip contents never leaked unless that player legally peeked.
- **Reconnect = re-broadcast.** On WS open, server reads cookie, re-sends current projected state plus any pending prompt for that player. Browser refresh "just works".

---

## Phases

Phases 0–6 are sequential. 7 runs alongside 2–6. 8 is the first verification checkpoint. 9–11 build the frontend. 12 is the headline autonomous verification.

### Phase 0 — Scaffolding
- **First step: copy this plan file into `online/PLAN.md`** so it's committed alongside the code, and create an empty `online/PROGRESS_LOG.md` with a header.
- npm workspaces at `online/` (`backend`, `frontend`, `shared`).
- `tsconfig.base.json` with path alias `@shared/*` → `shared/src/*`. Per-package configs extend it.
- Backend deps: `express`, `ws`, `cookie-parser`, `uuid`; dev: `tsx`, `jest`, `ts-jest`, `supertest`.
- Frontend deps: `react`, `react-dom`, `react-router-dom`; dev: `vite`, `vitest`, `@testing-library/react`, `jsdom`.
- Root `online/package.json` scripts: `dev` (concurrently runs backend on `:4000` + frontend on `:5173`), `verify` (calls Phase 12 script).
- Single root `.eslintrc.cjs` + `prettier`.

**Done when:** `cd online && npm install && npm run dev` boots both servers cleanly.

### Phase 1 — Shared types (`online/shared/src/`)
- `cards.ts`: discriminated unions matching every card JSON schema (`StockCard`, `ActionCard`, `InsiderTipCard`, `GoalCard`, `LoanCard`, `HotTipCard`). Literal string unions for every `type` and `effect.type`.
- `state.ts`: `Color`, `PublicPlayer` vs `PrivatePlayer`, `GameState`, `AuctionState`, `FreeActionQueueEntry`, `PromptEnvelope`.
- `protocol.ts`: REST request/response shapes + WS message types (`state`, `prompt`, `log`, `error`).
- `cardLoader.ts`: backend-only — loads `/cards/*.json`, attaches uids identically to `playtest/init.js`.

**Done when:** `tsc --noEmit` clean; unit test asserts loaded counts (36/11/16/14/6/6).

### Phase 2 — Backend domain (`online/backend/src/domain/`)
- `deck.ts`: `shuffle(seed?)`, `draw(deck, n)`, `reshuffleFromDiscard(state)`.
- `prices.ts`: `adjust(color, delta)` floored at 0; `applyHalve(color)`; `applySlump(changes)`.
- `setup.ts`: mirrors `playtest/init.js` — $30, 1 Hot Tip, 5 market, `players+2` goals, `2*players-1` insider tips, random first player, prices $4.
- `model.ts`: extends `playtest/game_state.json` with `auction`, `freeActionQueue`, `pendingPrompts: Record<playerId, PromptEnvelope|null>`, `connectedClients`, `gameOver`. Omits `loanCardsAvailable` (loans are infinite — see Phase 3).
- `mutate.ts`: serial async queue (one in-flight op), runs handler, atomic-writes `online/backend/game_state.json`, appends one line to the active per-game log file, broadcasts.
- `gameLog.ts`: opens/closes per-game `.jsonl` files under `online/backend/game_logs/`; exposes `openLog(gameId, startedAt)`, `append(event)`, `closeLog()`. Files are never overwritten — a new game always gets a new file.

**Done when:** Unit tests for setup/deck/prices/mutate (incl. serialization order under 100 concurrent ops). `setup(3)` diffs cleanly against `playtest/game_state.json`.

### Phase 3 — Turn engine (`online/backend/src/engine/turn.ts`)
- `startAuction(playerId, cardUid, initialBid)` — validates turn ownership and absence of active auction/free-action; constructs `AuctionState` (Phase 4); enqueues first bid prompt.
- `sellStock(playerId, stockUid)` — pays bank, color −1, Informant peek if applicable, discards card.
- `endOfTurn()` — rolls seedable d6: `1` resolves+removes top Insider Tip; `6` all colors +1; else nothing. Advances player, increments turn.
- `autoLoan(playerId, owed)` — `ceil((owed-cash)/10)` loans @ $10 each. **Loans are infinite** — no `loanCardsAvailable` counter, no deck-tracking. The "6 loan cards" from the physical game is a non-constraint here; the backend always issues as many as needed.
- `resolveSpecialOnBuy(card, buyerId)` — Boom (extra +1), Tip-Off (prompt color), Scout (peek prompt).
- `checkEndConditions()` — insider tip deck empty OR `activeGoals.length === 1` → set `gameOver`, compute final wealth (cash + Σ stock·price + endGameBonus − 12·loans; Wild Shares = $0).

**Done when:** Unit tests cover every stock special, every insider-tip effect type, both end-condition triggers, full wealth math.

### Phase 4 — Auction engine (`online/backend/src/engine/auction.ts`)
- `AuctionState`: `{ cardUid, auctioneerId, initialBid, currentHigh, currentHighBidderId, activeBidders: playerId[], awaitingBidderId }`. Auctioneer is initial high bidder. `activeBidders` is turn-order of non-auctioneers.
- `bid(playerId, amount)` — must equal `awaitingBidderId`, amount > `currentHigh`, sets new high/high-bidder, rotates `awaitingBidderId`. When all other-than-high-bidder have responded since last raise, resolve.
- `pass(playerId)` — removes from `activeBidders`, rotates.
- **Preferred Bidder tie-break** — when `amount === currentHigh` and bidder holds Preferred Bidder, accept as new high.
- **Resolve** — winner pays bank (auto-loan if needed), takes card; if stock, color +1 then trigger special; clear `auction`; refill market (reshuffle discard if main deck empty).

**Done when:** Unit tests for: nobody bids (auctioneer wins), one outbid then passes, Preferred Bidder tie, bid > cash triggers loan, market refill with reshuffle.

### Phase 5 — Free actions (`online/backend/src/engine/freeActions.ts`)
- `submitFreeAction(playerId, payload)` enqueues to `freeActionQueue`; queue drains via `mutate`. Each drain step pauses the active turn/auction prompt until the free action's sub-prompts (if any) resolve.
- All 11 action cards dispatched on `effect.type`: `draw_and_choose`, `take_face_up`, `sell_double`, `adjust_stock`, `flip_and_adjust` (Wild Speculation — recurses past non-stock reveals to bottom of deck), `tie_breaker` (moves card to `persistentEffects`), `goal_discount` (single-use flag on player), `steal_stock` (target + private hand peek + bank pays target $6), `adjust_all_stocks`, `peek_reorder_tips`.
- Hot Tip — peek top insider tip, set `hotTipAvailable=false`.
- `claimGoal(playerId, goalUid, stockAssignment, useForgery?)` — validates stocks with Wild Share substitution (1 wild = 1 of any required color) and optional Forgery discount (−1 from any single requirement, min 1). Discards used Wild Shares. Applies reward parser by type. Then `checkEndConditions`.

**Done when:** Unit test per action card, per goal-reward parsed type, Wild Share substitution, Forgery discount, end-condition triggered from goal claim.

### Phase 6 — REST + WebSocket API (`online/backend/src/http/`)
- `server.ts`: Express + ws on the same HTTP server, port 4000. Cookie middleware: first `POST /join` issues `playerId` cookie (httpOnly, lax, 30-day).
- REST:
  - `POST /join { name }` — lobby (rejected if game in progress).
  - `POST /start` — calls `setup(playerCount)`.
  - `GET /me`, `GET /state` (projected).
  - `POST /turn-action { type, ... }`.
  - `POST /auction-bid { type:'bid'|'pass', amount? }`.
  - `POST /free-action { ... }`.
  - `POST /prompt-response { ... }` (Tip-Off color, Scout/Hot Tip ack, etc.).
  - `POST /reset` — clears `gameOver` state and returns server to lobby (called from the post-game "New Game" button).
- WS at `/ws`: upgrade reads cookie. On open: server pushes `state` + any pending `prompt` for that `playerId`. Every `mutate` broadcasts.
- Lobby projection: `{mode:'lobby', joinedNames}` when no game; `{mode:'game-in-progress'}` for non-players during a game; full projected `GameState` otherwise.

**Done when:** Supertest covers every endpoint, cookie issuance, WS upgrade rejection without cookie.

### Phase 7 — Backend tests (in parallel with 2–6)
- Per-module unit suites under `online/backend/tests/unit/`. Aim ≥ 90 % coverage on `domain/` and `engine/`.
- `tests/integration/full_game.test.ts` drives 2-player and 4-player games directly through the engine (no HTTP), deterministic seed, until `gameOver`. Asserts wealth math, end-condition source, every Insider Tip removed permanently, no card uid leaks.

**Done when:** `npm test -w backend` is green.

### Phase 8 — VERIFICATION CHECKPOINT 1 (Backend over HTTP)
- `online/backend/scripts/verifyHttp.ts` spawns the server, uses `fetch` with three independent cookie jars, plays a scripted 3-player game through ~5 turns including an auction, a Hot Tip peek, a goal claim, and a forced `d6=1` outcome (via seeded RNG). Asserts state transitions match expected values.
- Wired as `npm run verify:http -w backend`.

**Done when:** Script exits 0. Catches wire-format, cookie, and projection bugs invisible to in-process tests.

### Phase 9 — Frontend skeleton (`online/frontend/src/`)
- Vite + React + TS app. Router for `/` (lobby) and `/game`.
- `lib/api.ts` — typed fetch wrapper with `credentials:'include'`.
- `hooks/useGameState.ts` — WS client, exponential-backoff reconnect, exposes typed `{state, prompt, log, send}`.
- `pages/Lobby.tsx` — name entry, joined-players list, "Start Game" button (any joined player).
- `pages/GameInProgressBlock.tsx` — "Game in progress, please wait" screen for non-players.

**Done when:** Two browser tabs both join, see the joined list update live; Start routes both to `/game`.

### Phase 10 — Game UI (`online/frontend/src/game/`)
- `GameBoard.tsx` — header stock-price ticker (4 colors), market row (5 face-up), goals row, players panel (cash, loans, hand size, goalsClaimed, persistent effects).
- `MyHand.tsx` — own hand, click for context actions.
- `AuctionPanel.tsx` — card + currentHigh + bidder; when `prompt.type==='bid'`, shows bid input + Pass.
- `TurnPanel.tsx` — visible when it's your turn and no auction/free-action pending; Start Auction (pick market card + initial bid) or Sell Stock.
- `FreeActionPanel.tsx` — always available; play action card, use Hot Tip, claim goal (modal handles stock assignment incl. Wild Share substitution and Forgery toggle).
- `LogFeed.tsx` — scrolling log from WS `log` events.
- Plain CSS (or trivial Tailwind). Functional, not polished — this is a playtest tool.

**Done when:** Manually walk a 2-player game across two browser tabs to completion.

### Phase 11 — Frontend tests (`online/frontend/src/__tests__/`)
- Vitest + RTL: Lobby with mocked API, AuctionPanel across prompt states, useGameState reconnect with mocked WS.

**Done when:** `npm test -w frontend` is green.

### Phase 12 — VERIFICATION CHECKPOINT 2 (End-to-end autonomous)
- `online/scripts/verifyE2E.ts` (root). Spawns backend with `SEED=1234`. Opens 3 HTTP "player" sessions (separate cookie jars + ws clients). Each player runs a deterministic AI:
  - On bid prompt: bid `currentHigh+1` if affordable, else pass.
  - On turn prompt: start auction on cheapest market stock at $1; sell if cash < $5.
  - Claim any goal the player qualifies for.
  - **Plays each action card at least once over the course of the game when it lands in hand.** The script tracks which of the 11 action cards have been exercised; when the AI holds an unused-this-run action card and it's a legal free-action moment, play it (with deterministic sub-prompt answers — e.g. always pick the cheapest color to adjust, always keep first drawn card). After play, mark that card type as covered.
  - Plays Hot Tip once (any player, first opportunity).
- Loops until `gameOver`. Asserts:
  1. Game ended via one of the two valid end conditions.
  2. Final wealth math correct for every player.
  3. Union of all card uids across hands + market + decks + discards + resolved tips + claimed goals equals the initial setup universe (no leaks).
  4. **Replay assertion** — read the just-written game log `.jsonl` file, replay every event from initial state, assert the replayed final state matches the live final state byte-for-byte.
  5. **All 11 action card types were exercised at least once** (if a type never appeared in any hand, log a warning rather than fail — but the script should pick seeds that surface all 11; if any type genuinely doesn't appear, bump the seed and document why).
- Wired as root `npm run verify`.

**Done when:** `npm run verify` exits 0 on a clean checkout in under ~30 s.

### Phase 13 — Polish (optional)
Address whatever Phase 12 + manual playthrough surface: log formatting, "your turn" highlight, color-blind palette, error toasts. No fixed scope.

---

## Files I will create/modify

**New**, all under `online/`:
- `package.json`, `tsconfig.base.json`, `.eslintrc.cjs`
- `shared/src/{cards,state,protocol,cardLoader,index}.ts`
- `backend/src/domain/{deck,prices,setup,model,mutate}.ts`
- `backend/src/engine/{turn,auction,freeActions}.ts`
- `backend/src/http/{server,routes,ws,cookies,projection}.ts`
- `backend/tests/unit/**/*.test.ts`, `backend/tests/integration/full_game.test.ts`
- `backend/src/domain/gameLog.ts`
- `backend/game_logs/` (directory, gitignored except for `.gitkeep`)
- `backend/scripts/verifyHttp.ts`
- `frontend/src/{main,App}.tsx`, `frontend/src/lib/api.ts`, `frontend/src/hooks/useGameState.ts`
- `frontend/src/pages/{Lobby,GameInProgressBlock}.tsx`
- `frontend/src/game/{GameBoard,MyHand,AuctionPanel,TurnPanel,FreeActionPanel,LogFeed}.tsx`
- `frontend/src/__tests__/**/*.test.tsx`
- `scripts/verifyE2E.ts`

**Reuse** (no edits):
- `/cards/*.json` (loaded by `shared/src/cardLoader.ts`)
- `/playtest/init.js` and `/playtest/game_state.json` as references for setup parity

**Untouched:**
- `/cards/`, `/tests/`, `/playtest/`, `/v2/`, `/v3/`, root `package.json`, `CLAUDE.md`, `rules.md`

## Verification strategy (recap)

1. **Phase 2/3/4/5 unit tests** — fast, deterministic, per-module logic.
2. **Phase 7 integration** — full game in-process across multiple seeds and player counts.
3. **Phase 8 HTTP** — same coverage as integration, but over HTTP+cookies+WS to catch wire issues.
4. **Phase 12 E2E autonomous** — separate processes, real network, real WS, deterministic AI plays a full game, asserts wealth + no card leaks. This is the headline gate. I run it myself.

## Resolved edge cases

- **Wild Speculation when the main deck has no stock cards.** Cap recursion at deck length; if no colored stock is found, treat as no-op (card revealed cards return to bottom of main deck in original order, Wild Speculation is discarded).
- **Free action interrupting a mid-resolution prompt** (e.g. Tip-Off color choice, Scout peek acknowledgement). Sub-prompts live in `pendingPrompts` and block the mutation queue until answered. Free actions arriving meanwhile are appended to `freeActionQueue` and drained after the blocking prompt resolves — never injected mid-resolution.
- **Loans are infinite.** No deck cap. Players can always take another loan; each is +$10 immediately, −$12 at end. Simplifies state and removes a class of pathological-AI failures during E2E.

## Post-game flow

When `gameOver` is set, the frontend shows a results screen (final wealth breakdown per player, winner highlighted). A "New Game" button on that screen calls `POST /reset`, which clears the game and returns the server to lobby mode. The cookie is preserved so the same browser can re-join the new lobby with the same name pre-filled.
