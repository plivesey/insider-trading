# Card Studio

An internal tool for generating and iterating on card artwork with OpenAI's
image generation API, and previewing it composited onto a card template with
text overlaid. It is decoupled from the game's `cards/*.json` data — cards
here are freeform: a prompt, a template, a text layout, and a history of
generated images to pick from.

## Setup

```bash
cd card-studio
npm install
cp server/.env.example server/.env
```

Edit `server/.env`:

- `OPENAI_API_KEY` — required to generate images. `gpt-image-1` requires your
  OpenAI organization to be **verified**; if generation fails with a 403, this
  is almost always why — the app will show OpenAI's error message directly.
- `DATA_DIR` — where templates, cards, and generated images are stored. Point
  this at a folder synced by Google Drive Desktop (or Dropbox, etc.) to share
  data with a teammate — Card Studio only ever does plain filesystem
  reads/writes here; it never talks to Drive directly. Each machine sets its
  own `DATA_DIR` pointing at its own local copy of the same synced folder.
- `PORT` — defaults to 4100.
- `MOCK_OPENAI_IMAGES` — set to `true` to skip the real OpenAI call and
  always return the same fixture image (`server/assets/mock-generation.png`)
  instead. No API key needed, no cost, deterministic. Set this whenever
  doing browser QA / UI testing of Card Studio itself; leave unset (or
  `false`) for real generation.

`.env` is per-machine and gitignored — it is **not** synced via `DATA_DIR`.

## Running

```bash
npm run dev
```

Starts the API on `http://localhost:4100` and the web UI on
`http://localhost:5273` (proxying `/api` to the server).

## Data layout

Everything under `DATA_DIR` (this is the sync unit):

```
templates/
  <name>.png             # uploaded background/border template
  <name>.json            # { id, name, width, height, artPlacement,
                          #   textOverlays, createdAt }
cards/
  <id>/
    card.json             # { id, name, prompt, templateId, textValues,
                           #   generations, selectedGenerationId, ... }
    generations/
      <id>.<ext>           # every past generation — never overwritten;
                           #   extension matches whatever outputFormat was
                           #   set to at generation time (see settings.json)
settings.json             # shared image-generation defaults (size, quality,
                           #   background, output format/compression,
                           #   moderation) — edited on the Settings page
```

- **Art placement and text overlay layout (position, font size, color,
  align) live on the template**, not the card — every card sharing a
  template shares the same layout, set once in the Templates page. A card
  only supplies the text for each overlay (`textValues`, keyed by the
  overlay's id).
- Art is always **cropped to fill** its box (`object-fit: cover`), never
  stretched.
- A template's id (embedded in its JSON, referenced by `card.templateId`) is
  the only stable identifier — its filename is derived from its `name` and
  free to change. **Renaming a template in the app renames its `.json`/`.png`
  files on disk to match** (deduplicated with `(2)`, `(3)`, ... on a
  collision), which is why templates are found by scanning for a matching
  `id` inside each `.json` rather than by filename. Cards keep random,
  never-renamed folder ids — they're identified by UUID in URLs and by other
  cards' data, not browsed by name in Finder the way templates are.
- **A template's PNG can be edited directly on disk** (e.g. open it in an
  image editor, save over the same file) and the app will pick up the change
  — it reads the file's actual mtime on every request and cache-busts the
  `<img>` accordingly. This only refreshes on the next fetch (page load,
  reselecting the template, etc.), not live while a tab sits open.

## Known limitations (by design, not bugs)

- **No real-time collaboration.** If two people edit the *same* card at the
  same moment on two machines, Google Drive will save a
  `card (conflicting copy).json` next to the original rather than merging —
  it won't corrupt anything, but the second edit won't show up until someone
  notices the conflict file and manually reconciles it. Each card's data
  lives in its own folder specifically to keep this rare and scoped to one
  card at a time. In practice: don't edit the same card on both machines at
  once.
- **Generation cost adds up.** Every "Generate Image" click is a paid
  OpenAI API call, and every past generation is kept (never deleted) so you
  can compare and pick — that's the point, but it means cost scales with how
  much you iterate.
