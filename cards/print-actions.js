#!/usr/bin/env node
/*
 * print-actions.js — generate a printable, self-contained HTML sheet of the
 * ACTION cards, laid over the shared action background art.
 *
 * Two zones authored on the 1060 x 1484 master (= the background art):
 *   1. TITLE — the card name, all-caps, on a gentle arch (∩) inside the purple
 *              ribbon banner. Ivory ink so it reads on the dark banner.
 *   2. TEXT  — the action description in the empty parchment box at the bottom,
 *              auto-shrunk to fit (descriptions vary a lot in length).
 *
 * Each card prints 3.5in tall (the long edge); the art's aspect sets the width.
 * Assets/font embedded as base64 → output HTML is one standalone, true-size file.
 *
 * Usage:
 *   node cards/print-actions.js [--assets <dir>] [--out <file>]
 *     --assets  Folder with action-bg.png + fonts/source-serif-pro-400.woff2.
 *               Default: cards/assets
 *     --out     Output HTML path. Default: cards/print-actions.html
 */

const fs = require('fs');
const path = require('path');

const MASTER = { w: 1060, h: 1484 };

// Banner title baseline: a shallow arch UP in the middle (∩), inside the ribbon.
const TITLE_ARC = { x1: 250, y1: 224, cx: 530, cy: 180, x2: 810, y2: 224 };
const TITLE_FONT = 88;         // master px (auto-fitted to TITLE_LEN)
const TITLE_LEN  = 510;        // target text length along the arc (master px)
const TITLE_COLOR = '#efe5d0'; // ivory ink for the dark purple banner

// Description box — the empty parchment panel at the bottom. FONT_MAX is a
// ceiling fraction of card width; a view-time script shrinks text to fit.
const TEXT = { top: 0.635, height: 0.245, side: 0.10 };
const FONT_MAX = 0.055;        // fraction of card width (text wraps up to ~5 lines)

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

function loadFontFace(assetsDir) {
  const file = path.join(assetsDir, 'fonts', 'source-serif-pro-400.woff2');
  let body;
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

function titleSvg(id, title) {
  const a = TITLE_ARC;
  return `<svg class="title" viewBox="0 0 ${MASTER.w} ${MASTER.h}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <path id="actarc${id}" d="M ${a.x1} ${a.y1} Q ${a.cx} ${a.cy} ${a.x2} ${a.y2}" fill="none"/>
        </defs>
        <text font-size="${TITLE_FONT}" textLength="${TITLE_LEN}" lengthAdjust="spacingAndGlyphs" fill="${TITLE_COLOR}">
          <textPath href="#actarc${id}" startOffset="50%" text-anchor="middle">${escapeHtml(title.toUpperCase())}</textPath>
        </text>
      </svg>`;
}

// Embed the shared background once as a class (not inlined per card).
function imageCss(bgUri) {
  return `  .a-art { background: url("${bgUri}") center / 100% 100% no-repeat; }\n`;
}

function renderCard(card) {
  return `    <div class="card">
      <div class="art a-art"></div>
      ${titleSvg(card.id, card.name || '')}
      <div class="text"><span class="tx">${escapeHtml(card.description || '')}</span></div>
    </div>`;
}

function renderHtml(cardsHtml, count, meta) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Insider Trading — Printable Action Cards</title>
<!-- Generated by cards/print-actions.js. Do not edit by hand; re-run the script.
     Assets: ${escapeHtml(meta.assetsDir)} · ${count} cards -->
<style>
  ${meta.fontFace}

  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    /* Cards print 3.5in tall; width follows the art's aspect (no distortion). */
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
  /* Title — full-card SVG overlay; arc lives in master coords. */
  .title {
    position: absolute; inset: 0; width: 100%; height: 100%;
    font-family: 'Cinzel', Georgia, serif; font-weight: 700; letter-spacing: 1px;
  }

  /* Description box — bottom parchment panel; .tx is shrunk to fit. */
  .text {
    position: absolute;
    left: ${(TEXT.side * 100).toFixed(3)}%;
    right: ${(TEXT.side * 100).toFixed(3)}%;
    top: ${(TEXT.top * 100).toFixed(3)}%;
    height: ${(TEXT.height * 100).toFixed(3)}%;
    display: flex; align-items: center; justify-content: center;
    text-align: center;
    line-height: 1.22;
    color: #2a2118;
    font-size: calc(var(--card-w) * ${FONT_MAX});
    overflow: hidden;
  }
  .text .tx { display: block; width: 100%; }

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
    <h1>Printable Action Cards</h1>
    <span class="meta">${count} cards · true size (3.5in tall) · Cmd/Ctrl-P to print</span>
  </div>
  <div class="sheet">
${cardsHtml}
  </div>
  <script>
    // Render at FONT_MAX and only shrink if the text overflows its box (this
    // lets descriptions wrap to as many lines as fit, up to ~5).
    function fitText(box) {
      var span = box.querySelector('.tx');
      var size = parseFloat(getComputedStyle(box).fontSize);
      span.style.fontSize = size + 'px';
      var guard = 0;
      while ((span.scrollHeight > box.clientHeight || span.scrollWidth > box.clientWidth)
             && size > 5 && guard < 400) {
        size -= 0.5; span.style.fontSize = size + 'px'; guard++;
      }
    }
    function fitAll() { document.querySelectorAll('.text').forEach(fitText); }
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
    console.log('Usage: node cards/print-actions.js [--assets <dir>] [--out <file>]');
    return;
  }

  const cardsDir = __dirname;
  const assetsDir = path.resolve(args.assets || path.join(cardsDir, 'assets'));
  const outPath = path.resolve(args.out || path.join(cardsDir, 'print-actions.html'));

  const cards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'action_cards.json'), 'utf8'));
  const bgUri = loadImageDataUri(assetsDir, 'action-bg');
  if (!bgUri) {
    console.error(`✗ Missing asset: action-bg.png in ${assetsDir}`);
    process.exit(1);
  }
  const fontFace = loadFontFace(assetsDir);

  const rendered = cards.map(c => renderCard(c));
  const html = renderHtml(rendered.join('\n'), rendered.length, { assetsDir, fontFace, imageRules: imageCss(bgUri) });
  fs.writeFileSync(outPath, html);

  console.log(`✓ Wrote ${rendered.length} action cards → ${path.relative(process.cwd(), outPath)}`);
}

// ---------------------------------------------------------------------------
// Scoped fragment for the combined print-all sheet (namespaced .cat-actions).
// ---------------------------------------------------------------------------
function fragmentCss() {
  const T = TEXT, pct = n => (n * 100).toFixed(3);
  return `
  .cat-actions .card { --card-h:3.5in; --card-w:calc(var(--card-h) * ${MASTER.w} / ${MASTER.h}); width:var(--card-w); height:var(--card-h); }
  .cat-actions .title { position:absolute; inset:0; width:100%; height:100%; font-family:'Cinzel',Georgia,serif; font-weight:700; letter-spacing:1px; }
  .cat-actions .text { position:absolute; left:${pct(T.side)}%; right:${pct(T.side)}%; top:${pct(T.top)}%; height:${pct(T.height)}%; display:flex; align-items:center; justify-content:center; text-align:center; line-height:1.22; color:#2a2118; font-size:calc(var(--card-w) * ${FONT_MAX}); overflow:hidden; }
  .cat-actions .text .tx { display:block; width:100%; }`;
}

const ACTIONS_FIT_SCRIPT = `(function(){
  function fit(box){ var s=box.querySelector('.tx'); var n=parseFloat(getComputedStyle(box).fontSize); s.style.fontSize=n+'px'; var g=0; while((s.scrollHeight>box.clientHeight||s.scrollWidth>box.clientWidth)&&n>5&&g<400){n-=0.5;s.style.fontSize=n+'px';g++;} }
  function all(){ document.querySelectorAll('.cat-actions .text').forEach(fit); }
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(all);
  window.addEventListener('load',all);
})();`;

function buildFragment(assetsDir) {
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'action_cards.json'), 'utf8'));
  const bgUri = loadImageDataUri(assetsDir, 'action-bg');
  if (!bgUri) throw new Error('Missing action asset: action-bg.png');
  const rendered = cards.map(c => renderCard(c)).join('\n');
  return {
    css: imageCss(bgUri) + fragmentCss(),
    body: `  <section class="cat cat-actions">\n    <h2>Action Cards (${cards.length})</h2>\n    <div class="sheet">\n${rendered}\n    </div>\n  </section>`,
    script: ACTIONS_FIT_SCRIPT,
  };
}

module.exports = { buildFragment };

if (require.main === module) main();
