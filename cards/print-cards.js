#!/usr/bin/env node
/*
 * print-cards.js — generate a printable, self-contained HTML sheet of the game's
 * STOCK cards, laid over the full-card design assets.
 *
 * Each industry (Steel / Oil / Rail / Bank) has ONE full-card background image
 * (border, scene, title and a cleared parchment footer). For special stocks we
 * drop the ability text into that footer box; blank stocks are pure art.
 *
 * The footer text box lives on the 696 x 1050 master canvas: y=759, h=238,
 * w=530 centered horizontally (x=83), Source Serif Pro Regular 36px. We express
 * it as percentages of the card so it lands identically at any render size and
 * the art is never stretched. Text is centered H and V and coloured per industry.
 *
 * Assets and font are embedded as base64 → the output HTML is one standalone file
 * you can open directly (file://) and print at true size.
 *
 * Usage:
 *   node cards/print-cards.js [--assets <dir>] [--out <file>]
 *     --assets  Folder with per-industry images steel/oil/rail/bank(/wild).png
 *               (.png/.jpg/.jpeg/.webp). Default: cards/assets
 *     --out     Output HTML path. Default: cards/print-cards.html
 *
 * A card whose industry image is missing is skipped and reported (this is how
 * Wild Shares drop out until wild.png exists). Industry mapping mirrors
 * online/frontend/src/game/theme.tsx.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Footer text box — authored on a 696 x 1050 master, stored as fractions.
// ---------------------------------------------------------------------------
const MASTER = { w: 696, h: 1050 };
const BOX = { y: 759, w: 530, h: 238 };        // master px; centered horizontally
BOX.x = (MASTER.w - BOX.w) / 2;                // = 83 (equal side margins)
const FONT_PX = 36;                            // master px

const PCT = {
  left:   (BOX.x / MASTER.w) * 100,
  top:    (BOX.y / MASTER.h) * 100,
  width:  (BOX.w / MASTER.w) * 100,
  height: (BOX.h / MASTER.h) * 100,
  font:   FONT_PX / MASTER.w, // fraction of CARD WIDTH
};

// ---------------------------------------------------------------------------
// Industry mapping (mirror of theme.tsx). `asset` = base filename; `text` =
// footer text colour for that industry.
// ---------------------------------------------------------------------------
const INDUSTRY = {
  Blue:   { label: 'Steel', asset: 'steel', text: '#192530' },
  Orange: { label: 'Oil',   asset: 'oil',   text: '#423316' },
  Yellow: { label: 'Rail',  asset: 'rail',  text: '#1e3a28' },
  Purple: { label: 'Bank',  asset: 'bank',  text: '#584826' },
  Wild:   { label: 'Wild Share', asset: 'wild', text: '#3a2f1c' },
};

const SPECIAL_NAMES = {
  extra_up: 'Boom',
  other_up: 'Tip-Off',
  peek_buy: 'Scout',
  peek_sell: 'Informant',
  wild: 'Wild Share',
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
  const map = {};
  for (const meta of Object.values(INDUSTRY)) {
    if (!(meta.asset in map)) map[meta.asset] = loadImageDataUri(assetsDir, meta.asset);
  }
  return map;
}

function loadFontFace(assetsDir) {
  const file = path.join(assetsDir, 'fonts', 'source-serif-pro-400.woff2');
  if (fs.existsSync(file)) {
    const b64 = fs.readFileSync(file).toString('base64');
    return `@font-face {
      font-family: 'Source Serif Pro';
      font-style: normal; font-weight: 400; font-display: swap;
      src: url(data:font/woff2;base64,${b64}) format('woff2');
    }`;
  }
  // Fallback: pull from Google Fonts (needs internet at view/print time).
  return `@import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400&display=swap');`;
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

function renderCard(card, assetMap) {
  const ind = INDUSTRY[card.color] || INDUSTRY.Wild;
  const dataUri = assetMap[ind.asset];
  if (!dataUri) return null; // skip cards with no art (e.g. Wild until wild.png)

  // Blank stocks: pure art. Specials & wild: ability text in the footer box.
  const ability = card.type === 'blank' ? '' : relabelColors(card.ability || '');
  const box = ability
    ? `<div class="box" style="color:${ind.text}">${escapeHtml(ability)}</div>`
    : '';

  return `    <div class="card">
      <img class="art" src="${dataUri}" alt="${escapeHtml(ind.label)} stock">
      ${box}
    </div>`;
}

function renderHtml(cardsHtml, count, meta) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Insider Trading — Printable Stock Cards</title>
<!-- Generated by cards/print-cards.js. Do not edit by hand; re-run the script.
     Assets: ${escapeHtml(meta.assetsDir)} · ${count} cards -->
<style>
  ${meta.fontFace}

  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    /* Cards print 3.5in tall; width follows the art's aspect (no distortion).
       width = 3.5in * ${MASTER.w}/${MASTER.h} = ${(3.5 * MASTER.w / MASTER.h).toFixed(3)}in */
    --card-h: 3.5in;
    --card-w: calc(var(--card-h) * ${MASTER.w} / ${MASTER.h});
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
  .toolbar .warn { font-size: 13px; color: #f0c674; }

  .sheet {
    display: flex; flex-wrap: wrap; gap: 0.16in;
    justify-content: center; max-width: 1100px; margin: 0 auto;
  }

  .card {
    width: var(--card-w);
    height: var(--card-h);
    position: relative;
    line-height: 0;                 /* kill img baseline gap */
    box-shadow: 0 4px 14px rgba(0,0,0,0.4);
  }
  .art { display: block; width: 100%; height: 100%; }

  /* Footer text box — percentages of the card (master 696x1050). */
  .box {
    position: absolute;
    left: ${PCT.left.toFixed(4)}%;
    top: ${PCT.top.toFixed(4)}%;
    width: ${PCT.width.toFixed(4)}%;
    height: ${PCT.height.toFixed(4)}%;
    display: flex; align-items: center; justify-content: center;
    text-align: center;
    line-height: 1.18;
    font-size: calc(var(--card-w) * ${PCT.font.toFixed(6)});
    font-weight: 400;
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
    <h1>Printable Stock Cards</h1>
    <span class="meta">${count} cards · true size · Cmd/Ctrl-P to print</span>
    ${meta.skipped.length
      ? `<span class="warn">Skipped (no art): ${escapeHtml(meta.skipped.join(', '))}</span>`
      : ''}
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
    console.log('Usage: node cards/print-cards.js [--assets <dir>] [--out <file>]');
    return;
  }

  const cardsDir = __dirname; // this script lives in cards/
  const assetsDir = path.resolve(args.assets || path.join(cardsDir, 'assets'));
  const outPath = path.resolve(args.out || path.join(cardsDir, 'print-cards.html'));

  const cards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'stock_cards.json'), 'utf8'));
  const assetMap = buildAssetMap(assetsDir);
  const fontFace = loadFontFace(assetsDir);

  const rendered = [];
  const skippedCounts = {};
  for (const card of cards) {
    const html = renderCard(card, assetMap);
    if (html) rendered.push(html);
    else {
      const label = (INDUSTRY[card.color] || INDUSTRY.Wild).label;
      skippedCounts[label] = (skippedCounts[label] || 0) + 1;
    }
  }
  const skipped = Object.entries(skippedCounts).map(([k, n]) => `${k}×${n}`);

  const html = renderHtml(rendered.join('\n'), rendered.length, { assetsDir, skipped, fontFace });
  fs.writeFileSync(outPath, html);

  console.log(`✓ Wrote ${rendered.length} stock cards → ${path.relative(process.cwd(), outPath)}`);
  console.log(`  assets: ${path.relative(process.cwd(), assetsDir)}`);
  console.log(`  font:   ${fontFace.startsWith('@font-face') ? 'Source Serif Pro embedded' : 'Google Fonts @import (no local woff2)'}`);
  if (skipped.length) console.log(`  ⚠ skipped (no art): ${skipped.join(', ')}`);
}

main();
