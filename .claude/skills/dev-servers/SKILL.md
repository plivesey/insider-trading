---
name: Dev Servers
description: Start, stop, and restart the online/ backend + frontend dev servers correctly — avoids leaving stacked zombie processes behind, and avoids freezing a live game by restarting the backend mid-game.
---

# Dev Servers

`online/` is an npm workspace (`shared` + `backend` + `frontend`). The backend
(Express + WS) serves `:4000`; the frontend (Vite) serves `:5173` and proxies
`/api` + `/ws` to `:4000` (see `online/frontend/vite.config.ts`). The single
command to run both together is `npm run dev` from `online/` (runs
`concurrently -n backend,frontend ... npm:dev -w backend npm:dev -w frontend`
per `online/package.json`).

## Two things that will bite you if you skip this

1. **Never kill-and-restart the backend while a game is in progress.**
   `ServerHub.botProfiles` (the chosen value-net + BotParams personality per
   bot) is explicitly **in-memory only, never persisted** — see the comment
   above it in `online/backend/src/state/serverState.ts`. On restart the map
   is empty, and there is no reconciliation that rebuilds it for bots already
   in a restored game: `kickBots` (`src/bots/runner.ts`) does
   `if (!profile) continue`, so every bot in that game just silently stops
   acting forever. The game state itself (`GameState`) *is* persisted via the
   snapshot path, so the game looks alive — it just never progresses again.
   **Before restarting, check `curl -s localhost:4000/api/state`** — only
   restart if `mode` is `"lobby"` or `"game_over"`, never `"in_game"`.

2. **`tsx watch` does not reliably free the port on restart**, and will crash
   the new child with `EADDRINUSE` while an old child keeps serving stale
   code silently in the background (`/healthz` still returns ok — it's the
   *wrong* process answering). This happened repeatedly in one session:
   killing just the top `npm run dev` PID left the `concurrently` child
   orphaned (reparented to PID 1) and still running, and after several
   restart-kill cycles there were **5 stacked `online/`-path process trees**
   simultaneously fighting over `:4000`/`:5173`. Don't trust that killing one
   PID got everything — verify.

## Starting fresh / restarting

```bash
# 1. If a game might be in progress, check first:
curl -s localhost:4000/api/state   # only proceed if mode is lobby/game_over

# 2. Find EVERY process touching this project's online/ path (not
#    card-studio/ — it has its own unrelated concurrently/vite/server trees
#    using workspace names "server"/"web" instead of "backend"/"frontend",
#    don't touch those):
ps -axo pid,ppid,command | grep "insider-trading/online/" | grep -v card-studio | grep -v grep

# 3. Kill ALL matched PIDs (concurrently, tsx watch, vite, esbuild, and the
#    actual `node ... src/server.ts` child tsx watch spawns) with -9 — plain
#    SIGTERM has left children behind before:
kill -9 <every PID from step 2>

# 4. Confirm both ports are actually free before relaunching:
lsof -i tcp:4000 -i tcp:5173   # must print nothing

# 5. Launch exactly one clean instance:
cd online && npm run dev > /tmp/it-dev-logs/dev.log 2>&1 &

# 6. Verify it's really the new code, not a stuck old process:
sleep 5
curl -s localhost:4000/healthz                                   # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" localhost:5173/          # 200
```

If you only need the backend's latest `.ts` changes and no game is in
progress, you don't need to manually restart at all — `tsx watch` picks up
source file changes automatically. Manual restart is only needed for: (a)
changes to data files read via `fs.readFileSync` at startup, which *aren't*
watched (e.g. `nets/bot_params*.json` — see below), or (b) cleaning up a
stuck/stacked process situation like above.

## Checking which bot personalities are in a game

Production bots randomly pick one of three independently-trained `BotParams`
sets per bot (`online/backend/src/state/serverState.ts`'s `addBot`), logged as:

```
[addBot] <bot name> -> bot1|bot2|bot3
```

`grep "\[addBot\]" /tmp/it-dev-logs/dev.log` (or wherever you redirected the
`npm run dev` output) to see the mix for the current lobby. Note this only
shows bots added *after* the log line was added to the code and the backend
last restarted — a restart clears nothing here (it's just a log file), but
remember point 1 above before restarting to add/change this kind of logging
while a game might be running.

Changing which personality a given bot got requires restarting the backend
(the three `nets/bot_params*.json` files are read once at module load via
`fs.readFileSync`, not watched) — safe only when `mode` isn't `"in_game"`.
