#!/usr/bin/env node
/*
 * print-tips.js — generate a printable, self-contained HTML sheet of the 16
 * INSIDER TIP cards, laid over the "newspaper" backgrounds with a headline
 * dropped into the empty space.
 *
 * Background per tip:
 *   - single-colour tips (crash / surge) → the matching industry card
 *     (tip-bg-rail/oil/bank/steel.png).
 *   - two-colour tips (slump) → the "Financial Times" card (tip-bg-multi.png).
 *
 * Headline (newspaper font) states the result, e.g.
 *   crash → "OIL STOCKS DROP BY HALF"
 *   surge → "RAIL STOCKS RAISE $4"
 *   slump → "OIL & BANK STOCKS DROP $2"
 *
 * Each card prints 3.5in tall (the long edge); the art's aspect sets the width.
 * Images embedded as base64 → output HTML is one standalone, true-size file.
 *
 * Usage:
 *   node cards/print-tips.js [--assets <dir>] [--out <file>]
 *     --assets  Folder with tip-bg-{rail,oil,bank,steel,multi}.png. Default: cards/assets
 *     --out     Output HTML path. Default: cards/print-tips.html
 *
 * Industry mapping mirrors online/frontend/src/game/theme.tsx.
 */

const fs = require('fs');
const path = require('path');

const LONG_EDGE_IN = 3.5;      // card height (portrait long edge)

// Headline box — fraction of the card, in the empty space below the masthead
// and above the illustration. The industry cards have a tall empty band; the
// "Financial Times" (multi) card has a shorter one, so it gets its own box.
// FONT_MAX is a ceiling fraction of card width; a view-time script shrinks each
// headline to fit its box so nothing overlaps the art.
const HEADLINE = {
  industry: { top: 0.225, height: 0.355, side: 0.09 },
  multi:    { top: 0.225, height: 0.265, side: 0.085 },
};
const FONT_MAX = 0.15; // fraction of card width

// Industry mapping (mirror of theme.tsx): data colour → label + bg asset.
const INDUSTRY = {
  Blue:   { label: 'Steel', asset: 'steel' },
  Orange: { label: 'Oil',   asset: 'oil' },
  Yellow: { label: 'Rail',  asset: 'rail' },
  Purple: { label: 'Bank',  asset: 'bank' },
};

function colorsOf(tip) {
  return tip.effect.color ? [tip.effect.color] : Object.keys(tip.effect.changes);
}

function bgAssetFor(tip) {
  if (tip.type === 'slump') return 'tip-bg-multi';
  return `tip-bg-${INDUSTRY[colorsOf(tip)[0]].asset}`;
}

function headlineFor(tip) {
  const labels = colorsOf(tip).map(c => INDUSTRY[c].label.toUpperCase());
  if (tip.type === 'crash') return `${labels[0]} STOCKS DROP BY HALF`;
  if (tip.type === 'surge') {
    const amt = tip.effect.changes[colorsOf(tip)[0]];
    return `${labels[0]} STOCKS RAISE $${amt}`;
  }
  // slump: −2 to two colours
  const amt = Math.abs(tip.effect.changes[colorsOf(tip)[0]]);
  return `${labels.join(' & ')} STOCKS DROP $${amt}`;
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
// Asset loading → base64 data URI + intrinsic pixel size (PNG header)
// ---------------------------------------------------------------------------
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const EXT_ORDER = ['.png', '.jpg', '.jpeg', '.webp'];

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function loadAsset(assetsDir, base) {
  for (const ext of EXT_ORDER) {
    const file = path.join(assetsDir, base + ext);
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      const size = ext === '.png' ? pngSize(buf) : null;
      return { uri: `data:${MIME[ext]};base64,${buf.toString('base64')}`, size };
    }
  }
  return null;
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

// Embed each unique background once as a class (not inlined per card).
function imageCss(assetMap) {
  let css = '';
  for (const base of Object.keys(assetMap)) {
    const key = base.replace('tip-bg-', '');
    css += `  .t-${key} { background: url("${assetMap[base].uri}") center / 100% 100% no-repeat; }\n`;
  }
  return css;
}

function renderCard(tip, assetMap) {
  const asset = bgAssetFor(tip);
  const a = assetMap[asset];
  const cw = LONG_EDGE_IN * a.size.w / a.size.h; // portrait: height pinned, width follows
  const layout = tip.type === 'slump' ? 'multi' : 'industry';
  const headline = headlineFor(tip);
  return `    <div class="card ${layout}" style="--cw:${cw.toFixed(4)}in">
      <div class="art t-${asset.replace('tip-bg-', '')}"></div>
      <div class="headline"><span class="hl">${escapeHtml(headline)}</span></div>
    </div>`;
}

function renderHtml(cardsHtml, count, meta) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Insider Trading — Printable Insider Tip Cards</title>
<!-- Generated by cards/print-tips.js. Do not edit by hand; re-run the script.
     Assets: ${escapeHtml(meta.assetsDir)} · ${count} cards -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@800;900&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: Georgia, serif;
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
    width: var(--cw);
    height: ${LONG_EDGE_IN}in;
    position: relative;
    line-height: 0;
    box-shadow: 0 4px 14px rgba(0,0,0,0.4);
  }
  .art { display: block; width: 100%; height: 100%; }
${meta.imageRules}

  /* Newspaper headline in the empty space. Box geometry differs per layout;
     the .hl span is shrunk to fit by the script below. */
  .headline {
    position: absolute;
    display: flex; align-items: center; justify-content: center;
    text-align: center;
    font-family: 'Playfair Display', 'Times New Roman', Georgia, serif;
    font-weight: 900;
    text-transform: uppercase;
    line-height: 1.05;
    letter-spacing: 0.5px;
    color: #1a1a1a;
    font-size: calc(var(--cw) * ${FONT_MAX});
    overflow: hidden;
  }
  .headline .hl { display: block; width: 100%; }

  .card.industry .headline {
    left: ${(HEADLINE.industry.side * 100).toFixed(3)}%;
    right: ${(HEADLINE.industry.side * 100).toFixed(3)}%;
    top: ${(HEADLINE.industry.top * 100).toFixed(3)}%;
    height: ${(HEADLINE.industry.height * 100).toFixed(3)}%;
  }
  .card.multi .headline {
    left: ${(HEADLINE.multi.side * 100).toFixed(3)}%;
    right: ${(HEADLINE.multi.side * 100).toFixed(3)}%;
    top: ${(HEADLINE.multi.top * 100).toFixed(3)}%;
    height: ${(HEADLINE.multi.height * 100).toFixed(3)}%;
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
    <h1>Printable Insider Tip Cards</h1>
    <span class="meta">${count} cards · true size (3.5in tall) · Cmd/Ctrl-P to print</span>
  </div>
  <div class="sheet">
${cardsHtml}
  </div>
  <script>
    // Shrink each headline until it fits inside its box, then take 20% off.
    var FONT_SCALE = 0.8;
    function fitHeadline(box) {
      var span = box.querySelector('.hl');
      var size = parseFloat(getComputedStyle(box).fontSize);
      span.style.fontSize = size + 'px';
      var guard = 0;
      while ((span.scrollHeight > box.clientHeight || span.scrollWidth > box.clientWidth)
             && size > 6 && guard < 400) {
        size -= 0.5; span.style.fontSize = size + 'px'; guard++;
      }
      span.style.fontSize = (size * FONT_SCALE) + 'px';
    }
    function fitAll() { document.querySelectorAll('.headline').forEach(fitHeadline); }
    // Run after the webfont loads so measurements use the real metrics.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
    window.addEventListener('load', fitAll);
  </script>
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
    console.log('Usage: node cards/print-tips.js [--assets <dir>] [--out <file>]');
    return;
  }

  const cardsDir = __dirname;
  const assetsDir = path.resolve(args.assets || path.join(cardsDir, 'assets'));
  const outPath = path.resolve(args.out || path.join(cardsDir, 'print-tips.html'));

  const data = JSON.parse(fs.readFileSync(path.join(cardsDir, 'insider_tip_cards.json'), 'utf8'));

  // Load every background the deck references.
  const assetMap = {};
  for (const base of ['tip-bg-rail', 'tip-bg-oil', 'tip-bg-bank', 'tip-bg-steel', 'tip-bg-multi']) {
    const a = loadAsset(assetsDir, base);
    if (!a || !a.size) {
      console.error(`✗ Missing or non-PNG asset: ${base} in ${assetsDir}`);
      process.exit(1);
    }
    assetMap[base] = a;
  }

  const rendered = data.cards.map(t => renderCard(t, assetMap));
  const html = renderHtml(rendered.join('\n'), rendered.length, { assetsDir, imageRules: imageCss(assetMap) });
  fs.writeFileSync(outPath, html);

  console.log(`✓ Wrote ${rendered.length} insider tip cards → ${path.relative(process.cwd(), outPath)}`);
}

// ---------------------------------------------------------------------------
// Scoped fragment for the combined print-all sheet (namespaced .cat-tips).
// ---------------------------------------------------------------------------
function fragmentCss() {
  const pct = n => (n * 100).toFixed(3);
  const box = (layout) => {
    const b = HEADLINE[layout];
    return `.cat-tips .card.${layout} .headline { left:${pct(b.side)}%; right:${pct(b.side)}%; top:${pct(b.top)}%; height:${pct(b.height)}%; }`;
  };
  return `
  .cat-tips .card { width:var(--cw); height:${LONG_EDGE_IN}in; }
  .cat-tips .headline { position:absolute; display:flex; align-items:center; justify-content:center; text-align:center; font-family:'Playfair Display','Times New Roman',Georgia,serif; font-weight:900; text-transform:uppercase; line-height:1.05; letter-spacing:0.5px; color:#1a1a1a; font-size:calc(var(--cw) * ${FONT_MAX}); overflow:hidden; }
  .cat-tips .headline .hl { display:block; width:100%; }
  ${box('industry')}
  ${box('multi')}`;
}

const TIPS_FIT_SCRIPT = `(function(){
  var SCALE=0.8;
  function fit(box){ var s=box.querySelector('.hl'); var n=parseFloat(getComputedStyle(box).fontSize); s.style.fontSize=n+'px'; var g=0; while((s.scrollHeight>box.clientHeight||s.scrollWidth>box.clientWidth)&&n>6&&g<400){n-=0.5;s.style.fontSize=n+'px';g++;} s.style.fontSize=(n*SCALE)+'px'; }
  function all(){ document.querySelectorAll('.cat-tips .headline').forEach(fit); }
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(all);
  window.addEventListener('load',all);
})();`;

function buildFragment(assetsDir) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'insider_tip_cards.json'), 'utf8'));
  const assetMap = {};
  for (const base of ['tip-bg-rail', 'tip-bg-oil', 'tip-bg-bank', 'tip-bg-steel', 'tip-bg-multi']) {
    const a = loadAsset(assetsDir, base);
    if (!a || !a.size) throw new Error(`Missing insider-tip asset: ${base}`);
    assetMap[base] = a;
  }
  const cards = data.cards.map(t => renderCard(t, assetMap)).join('\n');
  return {
    css: imageCss(assetMap) + fragmentCss(),
    body: `  <section class="cat cat-tips">\n    <h2>Insider Tip Cards (${data.cards.length})</h2>\n    <div class="sheet">\n${cards}\n    </div>\n  </section>`,
    script: TIPS_FIT_SCRIPT,
  };
}

module.exports = { buildFragment };

if (require.main === module) main();
