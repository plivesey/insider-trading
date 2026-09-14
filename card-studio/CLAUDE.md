# Card Studio

## What this is

An internal tool for generating card artwork with OpenAI's image generation
API (`gpt-image-1`), compositing it onto an uploaded card template at a
configurable position, and overlaying text — so two people can iterate on
prompts and preview roughly what a finished card will look like. It is a
separate app from the board game itself: not part of the `online/` npm
workspace, and its "cards" are freeform records independent of the shipped
`cards/*.json` data (see root `CLAUDE.md`) — nothing here feeds back into the
actual game.

See `README.md` in this folder for setup/running instructions and the known
sync limitations. This file is about how the code is organized.

## Stack

npm workspaces (`server`, `web`), TypeScript, ESM throughout. Mirrors the
conventions in `online/backend` and `online/frontend` (same `tsconfig.base.json`
shape, same `tsx`-for-dev / `concurrently`-for-both pattern) but is
intentionally its own project, not an `online/` workspace member.

- **server/** — Express 4, run via `tsx` (no build step in dev).
- **web/** — React 18 + Vite 5, dev server proxies `/api` to the backend.

## Data model

All persistent state (templates, cards, generated images) lives under a
single `DATA_DIR` path (see `server/.env`) — plain files, no database. See
`README.md` for the exact folder layout and why it's shaped the way it is
(one file/folder per entity, to keep Google Drive sync conflicts rare and
scoped).

`server/src/storage.ts` is the only place that builds filesystem paths or
reads/writes `card.json`/template `.json` files — routes never touch `fs`
directly. `server/src/types.ts` and `web/src/lib/types.ts` are duplicate,
hand-kept-in-sync copies of the same shapes (`Card`, `Template`,
`TextOverlay`, `GenerationRecord`) — there's no shared package between
server and web here, unlike `online/shared`.

## The placement/preview model

Art placement (`Box = {x,y,w,h}`) is stored in a *template's* native pixel
space, not the card's — every card sharing a template shares the same art
box (see `README.md`). Text overlay boxes are per-card. Both are rendered
the same way in three places, which must stay in sync if you touch the
layout math:

1. **`web/src/lib/pctBox.ts`** — converts a pixel-space box to CSS
   percentages (`boxStyle`) and a font size to container-query width units
   (`fontSizeCqw`), ported from the fraction-of-master-canvas technique in
   `cards/print-cards.js`.
2. **`web/src/editor/CardPreview.tsx`** — the live DOM/CSS preview, using
   `pctBox.ts`. Art is `object-fit: cover` (crop-to-fill, never stretched).
3. **`web/src/editor/DownloadButton.tsx`** — the one-time `<canvas>`
   compositor for the "Download flattened PNG" export, at the template's
   native resolution. This is a manual re-implementation of the same cover-fit
   and text-box math (canvas has no `object-fit` or flexbox) — kept
   deliberately simple (single-line text, no wrapping, horizontal align +
   vertical-center only) specifically so it stays an exact port of what
   `CardPreview.tsx` shows on screen rather than drifting into a separate
   text-layout engine.

If you add a feature to text overlays (wrapping, multi-line, etc.), it has to
land in both `CardPreview.tsx` and `DownloadButton.tsx` or the download will
stop matching the preview.

## Conventions worth knowing

- Every route handler that awaits something is wrapped in
  `asyncHandler` (`server/src/asyncHandler.ts`) — Express 4 does not catch
  rejected promises on its own, and an unwrapped async handler will hang the
  client instead of returning an error.
- All errors, including path-safety violations (`assertSafeId`), reach the
  JSON error middleware at the bottom of `server/src/index.ts` — never
  Express's default HTML error page.
- Frontend components that persist edits (e.g. `ArtPlacementControls.tsx`,
  `CardEditorPage.tsx`) treat **local state as the source of truth** and
  never write a server response back over local state after a save. This
  isn't a style preference — an earlier version did overwrite local state
  from the save response and it caused a real bug: a fast edit made while an
  earlier save was still in flight got silently clobbered by that save's
  stale response arriving after. Persist is fire-and-forget; only the
  initial `GET` populates state.
- `web/src/lib/useDebouncedEffect.ts` skips firing on the effect's first run
  (the initial load), so populating state from a `GET` never immediately
  triggers a `PATCH` back.
- **Always set `MOCK_OPENAI_IMAGES=true` in `server/.env` before doing
  browser QA on this app** (e.g. via Playwright). It makes `generateImage()`
  (`server/src/openaiClient.ts`) return the fixture at
  `server/assets/mock-generation.png` instead of calling OpenAI — no API key
  required, no per-click cost, deterministic output. Never exercise the real
  `gpt-image-1` call during routine QA.
