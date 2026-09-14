#!/usr/bin/env node
/*
 * print-goals.js — generate a printable, self-contained HTML sheet of the game's
 * GOAL cards, laid over the horizontal certificate background.
 *
 * Layout (authored on the 1536 x 1024 master = the background art) has 3 zones:
 *   1. TITLE   — the goal's name, set on a gentle arc inside the ribbon banner,
 *                filled with a smooth gradient across the four industry colours.
 *   2. ICONS   — one industry icon per required share, centered in the open field
 *                (e.g. "2 Rail + 2 Steel" → 4 icons: rail rail steel steel).
 *   3. REWARD  — the reward text in the band below the lower flourish divider.
 *
 * Every zone is stored as a fraction of the card so it lands identically at any
 * render size and the art is never stretched. Cards print 3.5in wide.
 *
 * Assets and font are embedded as base64 → the output HTML is one standalone file
 * you can open directly (file://) and print at true size.
 *
 * Usage:
 *   node cards/print-goals.js [--assets <dir>] [--out <file>]
 *     --assets  Folder with goal-bg.png + icon-steel/oil/rail/bank.png and
 *               fonts/source-serif-pro-400.woff2. Default: cards/assets
 *     --out     Output HTML path. Default: cards/print-goals.html
 *
 * Industry mapping mirrors online/frontend/src/game/theme.tsx.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Master canvas = background art (1536 x 1024). Zones in master px → fractions.
// ---------------------------------------------------------------------------
const MASTER = { w: 1536, h: 1024 };

// Ribbon-banner text baseline: a shallow arc that arches UP in the middle (∩)
// to follow the banner. Control point sits above the endpoints. Tune vs the art.
const TITLE_ARC = { x1: 430, y1: 250, cx: 768, cy: 188, x2: 1138, y2: 250 };
const TITLE_FONT = 104;        // master px (auto-fitted to TITLE_LEN below)
const TITLE_LEN  = 650;        // target text length along the arc (master px)
const TITLE_COLOR = '#111111'; // title ink

// Icon row band (centered between the upper and lower flourish dividers).
const ICONS = { top: 0.385, height: 0.255, side: 0.09, gap: 0.018 };

// Reward text band (below the lower flourish divider). Base font is 80 master
// px; long rewards auto-shrink (rewardFontPx) so they still fit two lines.
const REWARD = { top: 0.74, height: 0.20, side: 0.13, font: 76 };

function rewardFontPx(text) {
  const n = (text || '').length;
  if (n <= 54) return 76;   // short rewards (e.g. "Gain $4") → full size
  if (n <= 90) return 56;
  return 44;
}

// ---------------------------------------------------------------------------
// Industry mapping (mirror of theme.tsx). `asset` = icon base filename.
// ---------------------------------------------------------------------------
const INDUSTRY = {
  Blue:   { label: 'Steel', asset: 'icon-steel' },
  Orange: { label: 'Oil',   asset: 'icon-oil' },
  Yellow: { label: 'Rail',  asset: 'icon-rail' },
  Purple: { label: 'Bank',  asset: 'icon-bank' },
};

function relabelColors(text) {
  if (!text) return text;
  return text
    .replace(/\bBlue\b/g, INDUSTRY.Blue.label)
    .replace(/\bOrange\b/g, INDUSTRY.Orange.label)
    .replace(/\bYellow\b/g, INDUSTRY.Yellow.label)
    .replace(/\bPurple\b/g, INDUSTRY.Purple.label);
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { assets: null, out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--assets') args.assets = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Asset / font loading → base64 data URIs
// ---------------------------------------------------------------------------
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const EXT_ORDER = ['.png', '.jpg', '.jpeg', '.webp'];

function loadImageDataUri(assetsDir, base) {
  for (const ext of EXT_ORDER) {
    const file = path.join(assetsDir, base + ext);
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      return `data:${MIME[ext]};base64,${buf.toString('base64')}`;
    }
  }
  return null;
}

function buildAssetMap(assetsDir) {
  const map = { 'goal-bg': loadImageDataUri(assetsDir, 'goal-bg') };
  for (const meta of Object.values(INDUSTRY)) {
    if (!(meta.asset in map)) map[meta.asset] = loadImageDataUri(assetsDir, meta.asset);
  }
  return map;
}

function loadFontFace(assetsDir) {
  const file = path.join(assetsDir, 'fonts', 'source-serif-pro-400.woff2');
  let body = '';
  if (fs.existsSync(file)) {
    const b64 = fs.readFileSync(file).toString('base64');
    body = `@font-face {
      font-family: 'Source Serif Pro';
      font-style: normal; font-weight: 400; font-display: swap;
      src: url(data:font/woff2;base64,${b64}) format('woff2');
    }`;
  } else {
    body = `@import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400&display=swap');`;
  }
  // Display face for the arc title (degrades to Source Serif Pro offline).
  return `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap');\n${body}`;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Each unique image is embedded once as a background-image class (referenced by
// many cards) so the output stays small instead of inlining art per card.
function imageCss(assetMap) {
  let css = `  .g-art { background: url("${assetMap['goal-bg']}") center / 100% 100% no-repeat; }\n`;
  for (const meta of Object.values(INDUSTRY)) {
    css += `  .g-${meta.asset} { background: url("${assetMap[meta.asset]}") center / contain no-repeat; }\n`;
  }
  return css;
}

function iconRow(reqs) {
  let imgs = '';
  for (const [color, count] of Object.entries(reqs)) {
    const meta = INDUSTRY[color];
    if (!meta) continue;
    for (let i = 0; i < count; i++) {
      imgs += `<div class="ic g-${meta.asset}"></div>`;
    }
  }
  return imgs;
}

function titleSvg(id, title) {
  const a = TITLE_ARC;
  return `<svg class="title" viewBox="0 0 ${MASTER.w} ${MASTER.h}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <path id="goalarc${id}" d="M ${a.x1} ${a.y1} Q ${a.cx} ${a.cy} ${a.x2} ${a.y2}" fill="none"/>
        </defs>
        <text font-size="${TITLE_FONT}" textLength="${TITLE_LEN}" lengthAdjust="spacingAndGlyphs" fill="${TITLE_COLOR}">
          <textPath href="#goalarc${id}" startOffset="50%" text-anchor="middle">${escapeHtml(title)}</textPath>
        </text>
      </svg>`;
}

function renderCard(card, assetMap) {
  const reqs = card.goal?.parsed?.requirements || {};
  const title = card.title || relabelColors(card.goal?.text || '');
  const reward = relabelColors(card.reward?.text || '');
  return `    <div class="card">
      <div class="art g-art"></div>
      ${titleSvg(card.id, title)}
      <div class="icons">${iconRow(reqs)}</div>
      <div class="reward" style="font-size:calc(var(--card-w) * ${(rewardFontPx(reward) / MASTER.w).toFixed(6)})">${escapeHtml(reward)}</div>
    </div>`;
}

function renderHtml(cardsHtml, count, meta) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Insider Trading — Printable Goal Cards</title>
<!-- Generated by cards/print-goals.js. Do not edit by hand; re-run the script.
     Assets: ${escapeHtml(meta.assetsDir)} · ${count} cards -->
<style>
  ${meta.fontFace}

  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    /* Cards print 3.5in wide; height follows the art's aspect (no distortion).
       height = 3.5in * ${MASTER.h}/${MASTER.w} = ${(3.5 * MASTER.h / MASTER.w).toFixed(3)}in */
    --card-w: 3.5in;
    --card-h: calc(var(--card-w) * ${MASTER.h} / ${MASTER.w});
  }

  body {
    font-family: 'Source Serif Pro', Georgia, serif;
    background: #ffffff;
    color: #2c2c2c;
    padding: 24px;
  }

  .toolbar {
    max-width: 1100px; margin: 0 auto 20px;
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
  }
  .toolbar h1 { font-size: 20px; font-weight: 700; }
  .toolbar .meta { font-size: 13px; opacity: 0.75; }

  .sheet {
    display: flex; flex-wrap: wrap; gap: 0.16in;
    justify-content: center; max-width: 1100px; margin: 0 auto;
  }

  .card {
    width: var(--card-w);
    height: var(--card-h);
    position: relative;
    line-height: 0;
    box-shadow: 0 4px 14px rgba(0,0,0,0.4);
  }
  .art { display: block; width: 100%; height: 100%; }
${meta.imageRules}
  /* Title — full-card SVG overlay; arc + gradient live in master coords. */
  .title {
    position: absolute; inset: 0; width: 100%; height: 100%;
    font-family: 'Cinzel', 'Source Serif Pro', Georgia, serif;
    font-weight: 700; letter-spacing: 1px;
  }

  /* Icon row — centered in the open field. */
  .icons {
    position: absolute;
    left: ${(ICONS.side * 100).toFixed(3)}%;
    right: ${(ICONS.side * 100).toFixed(3)}%;
    top: ${(ICONS.top * 100).toFixed(3)}%;
    height: ${(ICONS.height * 100).toFixed(3)}%;
    display: flex; align-items: center; justify-content: center;
    gap: ${(ICONS.gap * 100).toFixed(3)}%;
  }
  /* clip each icon to its stamp circle so the square parchment-tile corners
     are removed and the card's own parchment shows through around the stamp. */
  .icons .ic { height: 100%; aspect-ratio: 1 / 1; clip-path: circle(49% at 50% 50%); }

  /* Reward text — band below the lower flourish divider. */
  .reward {
    position: absolute;
    left: ${(REWARD.side * 100).toFixed(3)}%;
    right: ${(REWARD.side * 100).toFixed(3)}%;
    top: ${(REWARD.top * 100).toFixed(3)}%;
    height: ${(REWARD.height * 100).toFixed(3)}%;
    display: flex; align-items: center; justify-content: center;
    text-align: center;
    line-height: 1.2;
    font-size: calc(var(--card-w) * ${(REWARD.font / MASTER.w).toFixed(6)});
    color: #3a2f1c;
    overflow: hidden;
  }

  @media print {
    @page { size: letter portrait; margin: 0.2in; }
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .sheet { gap: 0; max-width: none; justify-content: flex-start; }
    .card {
      box-shadow: none;
      page-break-inside: avoid; break-inside: avoid;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <h1>Printable Goal Cards</h1>
    <span class="meta">${count} cards · true size (3.5in wide) · Cmd/Ctrl-P to print</span>
  </div>
  <div class="sheet">
${cardsHtml}
  </div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (args.help) {
    console.log('Usage: node cards/print-goals.js [--assets <dir>] [--out <file>]');
    return;
  }

  const cardsDir = __dirname;
  const assetsDir = path.resolve(args.assets || path.join(cardsDir, 'assets'));
  const outPath = path.resolve(args.out || path.join(cardsDir, 'print-goals.html'));

  const data = JSON.parse(fs.readFileSync(path.join(cardsDir, 'goal_cards.json'), 'utf8'));
  const assetMap = buildAssetMap(assetsDir);
  const fontFace = loadFontFace(assetsDir);

  const missing = Object.entries(assetMap).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`✗ Missing assets in ${assetsDir}: ${missing.join(', ')}`);
    process.exit(1);
  }

  const rendered = data.cards.map(c => renderCard(c, assetMap));
  const html = renderHtml(rendered.join('\n'), rendered.length, { assetsDir, fontFace, imageRules: imageCss(assetMap) });
  fs.writeFileSync(outPath, html);

  console.log(`✓ Wrote ${rendered.length} goal cards → ${path.relative(process.cwd(), outPath)}`);
  console.log(`  assets: ${path.relative(process.cwd(), assetsDir)}`);
}

// ---------------------------------------------------------------------------
// Scoped fragment for the combined print-all sheet. Returns CSS (namespaced
// under .cat-goals), the section body, and any script (none here).
// ---------------------------------------------------------------------------
function fragmentCss() {
  const I = ICONS, R = REWARD;
  const pct = n => (n * 100).toFixed(3);
  return `
  .cat-goals .card { --card-w:3.5in; --card-h:calc(var(--card-w) * ${MASTER.h} / ${MASTER.w}); width:var(--card-w); height:var(--card-h); }
  .cat-goals .title { position:absolute; inset:0; width:100%; height:100%; font-family:'Cinzel',Georgia,serif; font-weight:700; letter-spacing:1px; }
  .cat-goals .icons { position:absolute; left:${pct(I.side)}%; right:${pct(I.side)}%; top:${pct(I.top)}%; height:${pct(I.height)}%; display:flex; align-items:center; justify-content:center; gap:${pct(I.gap)}%; }
  .cat-goals .icons .ic { height:100%; aspect-ratio:1 / 1; clip-path:circle(49% at 50% 50%); }
  .cat-goals .reward { position:absolute; left:${pct(R.side)}%; right:${pct(R.side)}%; top:${pct(R.top)}%; height:${pct(R.height)}%; display:flex; align-items:center; justify-content:center; text-align:center; line-height:1.2; color:#3a2f1c; overflow:hidden; }`;
}

function buildFragment(assetsDir) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'goal_cards.json'), 'utf8'));
  const assetMap = buildAssetMap(assetsDir);
  const missing = Object.entries(assetMap).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing goal assets: ${missing.join(', ')}`);
  const cards = data.cards.map(c => renderCard(c, assetMap)).join('\n');
  return {
    css: imageCss(assetMap) + fragmentCss(),
    body: `  <section class="cat cat-goals">\n    <h2>Goal Cards (${data.cards.length})</h2>\n    <div class="sheet">\n${cards}\n    </div>\n  </section>`,
    script: '',
  };
}

module.exports = { buildFragment };

if (require.main === module) main();
