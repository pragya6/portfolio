#!/usr/bin/env node
/* ============================================================
   Static checks for the portfolio.

   Run from anywhere:  node tools/verify.js

   Reads index.html, css/styles.css and js/main.js as text and reports the
   mechanical mistakes that are easy to make and annoying to find later: a
   nav link pointing at a renamed id, a class with no rule behind it, a
   colour that fails contrast, an inline style slipping in.

   It never renders the page. Checking that the layout looks right is still
   a job for the browser.

   Exits 0 when everything passes, 1 otherwise.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HTML_FILE = path.join(ROOT, 'index.html');
const CSS_FILE = path.join(ROOT, 'css', 'styles.css');
const JS_FILE = path.join(ROOT, 'js', 'main.js');

/* ------------------------------------------------------------
   Colour pairs to check.

   Tokens are looked up in `scope` first, then in :root. A pair whose
   tokens do not exist is reported as skipped rather than failed, so this
   list can hold both the current design and the one being ported to
   without needing edits on the way through.

   `min` is the WCAG AA floor: 4.5 for body text, 3.0 for large text and
   UI edges.
   ------------------------------------------------------------ */
const PAIRS = [
  // Light band — :root holds the light values, so that is the scope.
  { label: 'light band — body text', scope: ':root', fg: '--color-ink', bg: '--color-paper', min: 4.5 },
  { label: 'light band — soft text', scope: ':root', fg: '--color-ink-soft', bg: '--color-paper', min: 4.5 },
  { label: 'light band — faint text', scope: ':root', fg: '--color-ink-faint', bg: '--color-paper', min: 4.5 },
  { label: 'light band — faint on card', scope: ':root', fg: '--color-ink-faint', bg: '--color-card', min: 4.5 },
  { label: 'light band — soft on raised card', scope: ':root', fg: '--color-ink-soft', bg: '--color-card-raised', min: 4.5 },
  { label: 'light band — accent', scope: ':root', fg: '--color-accent', bg: '--color-paper', min: 4.5 },
  { label: 'light band — accent on card', scope: ':root', fg: '--color-accent', bg: '--color-card', min: 4.5 },
  { label: 'light band — on accent', scope: ':root', fg: '--color-on-accent', bg: '--color-accent', min: 4.5 },
  { label: 'light band — accent-ink on tint', scope: ':root', fg: '--color-accent-ink', bg: '--color-accent-bg', min: 4.5 },

  // Dark band
  { label: 'dark band — body text', scope: '.prtflo-band--dark', fg: '--color-ink', bg: '--color-paper', min: 4.5 },
  { label: 'dark band — soft text', scope: '.prtflo-band--dark', fg: '--color-ink-soft', bg: '--color-paper', min: 4.5 },
  { label: 'dark band — faint text', scope: '.prtflo-band--dark', fg: '--color-ink-faint', bg: '--color-paper', min: 4.5 },
  { label: 'dark band — faint on card', scope: '.prtflo-band--dark', fg: '--color-ink-faint', bg: '--color-card', min: 4.5 },
  { label: 'dark band — soft on raised card', scope: '.prtflo-band--dark', fg: '--color-ink-soft', bg: '--color-card-raised', min: 4.5 },
  { label: 'dark band — accent', scope: '.prtflo-band--dark', fg: '--color-accent', bg: '--color-paper', min: 4.5 },
  { label: 'dark band — accent on card', scope: '.prtflo-band--dark', fg: '--color-accent', bg: '--color-card', min: 4.5 },
  { label: 'dark band — on accent', scope: '.prtflo-band--dark', fg: '--color-on-accent', bg: '--color-accent', min: 4.5 },
  { label: 'dark band — accent-ink on tint', scope: '.prtflo-band--dark', fg: '--color-accent-ink', bg: '--color-accent-bg', min: 4.5 },

  /* Imaged bands. --band-floor is the band's scrim composited over the worst
     pixel an image could hold — black under a light scrim, white under a dark
     one. Text on those bands sits on something between --color-paper and this
     floor, so clearing AA here clears it for any image that ever ships. These
     are the pairs that decide the scrim alpha. */
  { label: 'light band on image — body text', scope: '.prtflo-band--light', fg: '--color-ink', bg: '--band-floor', min: 4.5 },
  { label: 'light band on image — soft text', scope: '.prtflo-band--light', fg: '--color-ink-soft', bg: '--band-floor', min: 4.5 },
  { label: 'light band on image — faint text', scope: '.prtflo-band--light', fg: '--color-ink-faint', bg: '--band-floor', min: 4.5 },
  { label: 'light band on image — accent', scope: '.prtflo-band--light', fg: '--color-accent', bg: '--band-floor', min: 4.5 },
  { label: 'dark band on image — body text', scope: '.prtflo-band--dark', fg: '--color-ink', bg: '--band-floor', min: 4.5 },
  { label: 'dark band on image — soft text', scope: '.prtflo-band--dark', fg: '--color-ink-soft', bg: '--band-floor', min: 4.5 },
  { label: 'dark band on image — faint text', scope: '.prtflo-band--dark', fg: '--color-ink-faint', bg: '--band-floor', min: 4.5 },
  { label: 'dark band on image — accent', scope: '.prtflo-band--dark', fg: '--color-accent', bg: '--band-floor', min: 4.5 },

  /* The nav bar is dark on every band now, so its three inks are checked once
     against its own worst-case background rather than per band. */
  { label: 'nav — mark and links', scope: '.site-nav', fg: '--nav-ink', bg: '--nav-floor', min: 4.5 },
  { label: 'nav — soft text', scope: '.site-nav', fg: '--nav-ink-soft', bg: '--nav-floor', min: 4.5 },
  { label: 'nav — accent', scope: '.site-nav', fg: '--nav-accent', bg: '--nav-floor', min: 4.5 },
];

/* ---------- reporting ---------- */
let failures = 0;
let warnings = 0;

const heading = (text) => console.log('\n' + text);
const pass = (text) => console.log('  ok    ' + text);
const fail = (text) => { console.log('  FAIL  ' + text); failures++; };
const warn = (text) => { console.log('  warn  ' + text); warnings++; };
const skip = (text) => console.log('  --    ' + text);

/* ---------- read the sources ---------- */
const missing = [HTML_FILE, CSS_FILE, JS_FILE].filter((f) => !fs.existsSync(f));
if (missing.length) {
  missing.forEach((f) => console.log('Cannot find ' + path.relative(ROOT, f)));
  process.exit(1);
}

const html = fs.readFileSync(HTML_FILE, 'utf8');
const css = fs.readFileSync(CSS_FILE, 'utf8');
const js = fs.readFileSync(JS_FILE, 'utf8');

/* ------------------------------------------------------------
   Case-exact path check.

   fs.existsSync is case-insensitive on Windows and on macOS, so a reference
   to assets/backgrounds/ resolves locally even when the folder on disk is
   assets/Backgrounds/ — and then 404s on a Linux host. Walking the real
   directory entries compares the names as they are actually spelled, so the
   mismatch is caught on the machine the page is authored on.
   ------------------------------------------------------------ */
function existsExact(relative) {
  const parts = relative.split('/').filter((part) => part && part !== '.');
  let dir = ROOT;

  for (const part of parts) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch (error) {
      return false;
    }
    if (!entries.includes(part)) return false;
    dir = path.join(dir, part);
  }

  return true;
}

/* Strip comments so they never count as real usage. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');

/* ---------- 1. ids ---------- */
heading('1. Element ids');
const idList = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const ids = new Set(idList);
const seen = new Set();
const duplicates = new Set();
idList.forEach((id) => (seen.has(id) ? duplicates.add(id) : seen.add(id)));

if (duplicates.size) {
  duplicates.forEach((id) => fail(`id "${id}" is used more than once`));
} else {
  pass(`${ids.size} unique ids, no duplicates`);
}

/* ---------- 2. in-page links ---------- */
heading('2. In-page links');
const anchors = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))];
const brokenAnchors = anchors.filter((a) => !ids.has(a));
if (brokenAnchors.length) {
  brokenAnchors.forEach((a) => fail(`href="#${a}" has no matching id`));
} else {
  pass(`${anchors.length} anchors all resolve`);
}

/* ---------- 3. aria references ---------- */
heading('3. ARIA references');
const ariaRefs = [];
[...html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)].forEach((m) =>
  m[1].split(/\s+/).filter(Boolean).forEach((ref) => ariaRefs.push(ref))
);
const brokenAria = [...new Set(ariaRefs)].filter((ref) => !ids.has(ref));
if (brokenAria.length) {
  brokenAria.forEach((ref) => fail(`aria reference "${ref}" has no matching id`));
} else {
  pass(`${new Set(ariaRefs).size} references all resolve`);
}

/* ---------- 4. classes ---------- */
heading('4. Classes');
const htmlClasses = new Set();
[...html.matchAll(/\sclass="([^"]+)"/g)].forEach((m) =>
  m[1].split(/\s+/).filter(Boolean).forEach((c) => htmlClasses.add(c))
);

/* url() contents are blanked first: a file extension inside a path — the .webp
   in url(../assets/backgrounds/crm-agent-bg.webp) — otherwise reads as a class
   selector and gets reported as a rule nothing uses. */
const cssClasses = new Set(
  [...cssCode.replace(/url\([^)]*\)/g, 'url()').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)]
    .map((m) => m[1])
);

/* Classes the scripts add at runtime, so they are never in the markup.
   Looks in js/main.js and in any inline <script> in the page. */
const scriptSources = [js].concat(
  [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
);

const jsAdded = new Set();
scriptSources.forEach((source) => {
  [...source.matchAll(/classList\.(?:add|remove|toggle)\(\s*['"]([^'"]+)['"]/g)].forEach((m) =>
    jsAdded.add(m[1])
  );
});

const undefinedClasses = [...htmlClasses].filter((c) => !cssClasses.has(c));
if (undefinedClasses.length) {
  undefinedClasses.forEach((c) => fail(`.${c} is used in the markup but has no rule`));
} else {
  pass(`${htmlClasses.size} classes all have rules`);
}

const unusedClasses = [...cssClasses].filter((c) => !htmlClasses.has(c) && !jsAdded.has(c));
if (unusedClasses.length) {
  unusedClasses.forEach((c) => warn(`.${c} has a rule but is never used`));
} else {
  pass('no dead rules');
}

/* ---------- 5. inline styles ---------- */
heading('5. Inline styles');
const inline = [...html.matchAll(/<(\w+)[^>]*\sstyle="([^"]*)"/g)];
if (inline.length) {
  inline.forEach((m) => fail(`<${m[1]}> carries style="${m[2].slice(0, 60)}" — move it to a class`));
} else {
  pass('none');
}

/* ---------- 6. external links ---------- */
heading('6. External links');
const blankLinks = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
const unsafe = blankLinks.filter((a) => !/rel="[^"]*noopener/.test(a));
if (unsafe.length) {
  unsafe.forEach((a) => fail(`target="_blank" without rel="noopener": ${a.slice(0, 80)}`));
} else {
  pass(`${blankLinks.length} new-tab links all carry rel="noopener"`);
}

/* ---------- 7. local files referenced ---------- */
heading('7. Local file references');
const localRefs = [...new Set(
  [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((v) => !/^(?:https?:|mailto:|tel:|sms:|data:|#|\/\/)/.test(v))
)];

if (!localRefs.length) {
  skip('no local references');
} else {
  localRefs.forEach((ref) => {
    const clean = ref.split(/[?#]/)[0];
    if (existsExact(clean)) pass(clean);
    else if (fs.existsSync(path.join(ROOT, clean))) {
      fail(`${clean} resolves here but its spelling on disk differs — it will 404 on a case-sensitive host`);
    } else fail(`${clean} is referenced but not on disk`);
  });
}

/* ---------- 8. colour contrast ---------- */
heading('8. Colour contrast');

/* Pull `--token: value;` declarations out of the first block whose selector
   list contains this selector. Matching the whole list matters: a selector
   sharing a block with others (`.a, main > .b:nth-child(even) { … }`) would
   otherwise go unfound, and the pair would silently fall back to :root and
   report the wrong palette as passing. */
function tokensFor(selector) {
  const out = {};
  for (const rule of cssCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    const declarations = [...rule[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
    if (!declarations.length) continue;
    declarations.forEach((m) => {
      out[m[1]] = m[2].trim();
    });
    return out;
  }
  return out;
}

const scopeCache = {};
function resolve(spec, scope) {
  if (/^#[0-9a-fA-F]{3,8}$/.test(spec)) return spec;
  if (!scopeCache[scope]) scopeCache[scope] = tokensFor(scope);
  if (!scopeCache[':root']) scopeCache[':root'] = tokensFor(':root');
  const value = scopeCache[scope][spec] || scopeCache[':root'][spec];
  if (!value) return null;
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null;
}

function luminance(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(c.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let checked = 0;
PAIRS.forEach((pair) => {
  const fg = resolve(pair.fg, pair.scope);
  const bg = resolve(pair.bg, pair.scope);
  if (!fg || !bg) {
    skip(`${pair.label} (tokens not present)`);
    return;
  }
  checked++;
  const ratio = contrast(fg, bg);
  const text = `${ratio.toFixed(2)}:1  ${pair.label}  (${fg} on ${bg}, needs ${pair.min})`;
  if (ratio >= pair.min) pass(text);
  else fail(text);
});
if (!checked) skip('no token pairs resolved — check the PAIRS list matches the CSS');

/* ---------- 9. tag balance and nesting ----------
   Restructuring work is where a stray or missing wrapper slips in. Counts
   alone miss wrong nesting order, so the whole document is walked too. */
heading('9. Tag balance and nesting');

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const COUNTED = ['div', 'section', 'main', 'footer', 'header', 'nav',
  'article', 'details', 'ul', 'ol', 'dl', 'figure'];

let unbalanced = 0;
COUNTED.forEach((tag) => {
  const open = (html.match(new RegExp('<' + tag + '(?=[\\s>])', 'g')) || []).length;
  const close = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  if (open !== close) {
    fail(`<${tag}>: ${open} opened, ${close} closed`);
    unbalanced++;
  }
});
if (!unbalanced) pass(COUNTED.length + ' element types balanced');

/* Attribute values are blanked first: the favicon is a data: URI carrying
   literal <svg> markup that would otherwise read as real tags. */
const walkable = html.replace(/="[^"]*"/g, '=""');
const stack = [];
let nesting = null;

for (const m of walkable.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
  const [, slash, name, , selfClose] = m;
  const tag = name.toLowerCase();
  if (VOID_TAGS.has(tag) || selfClose === '/' || tag === '!doctype') continue;
  if (!slash) {
    stack.push(tag);
  } else {
    const last = stack.pop();
    if (last !== tag && !nesting) nesting = `expected </${last}> but found </${tag}>`;
  }
}

if (nesting) fail('nesting: ' + nesting);
else if (stack.length) fail('nesting: never closed -> ' + stack.join(' > '));
else pass('every tag closes in order');

/* ---------- 10. band tone ----------
   Tone used to come from each band's position under <main>, so it could not
   be forgotten. It is declared per band now, which is what lets the SWE
   profile reorder them — and which means a new band can ship with no tone at
   all and silently fall back to the :root light palette. */
heading('10. Band tone');

const bandTags = [...html.matchAll(/<section\b[^>]*class="[^"]*\bprtflo-band\b[^"]*"[^>]*>/g)]
  .map((m) => m[0]);

if (!bandTags.length) {
  skip('no bands found');
} else {
  let untoned = 0;
  bandTags.forEach((tag) => {
    const light = /\bprtflo-band--light\b/.test(tag);
    const dark = /\bprtflo-band--dark\b/.test(tag);
    const name = (tag.match(/\s(?:id|data-project)="([^"]+)"/) || [, '(unnamed)'])[1];

    if (light && dark) {
      fail(`band "${name}" carries both --light and --dark`);
      untoned++;
    } else if (!light && !dark) {
      fail(`band "${name}" declares no tone — add prtflo-band--light or --dark`);
      untoned++;
    }
  });
  if (!untoned) pass(`${bandTags.length} bands each declare exactly one tone`);
}

/* ---------- 11. project order ----------
   ORDER in js/main.js names bands by their data-project slug. A renamed slug
   on either side is silent: the band simply keeps its markup position and the
   profile looks like it never reordered. */
heading('11. Project order');

const projectSlugs = [...html.matchAll(/\sdata-project="([^"]+)"/g)].map((m) => m[1]);

/* The arrays are read out of the ORDER literal as text, so this script stays
   dependency-free and can check a browser script it never executes. */
const ORDER_BLOCK = (js.match(/\bvar\s+ORDER\s*=\s*\{([\s\S]*?)\n  \};/) || [, ''])[1];

const ORDER_PATTERNS = {
  genai: /\bgenai\s*:\s*\[([^\]]*)\]/,
  swe: /\bswe\s*:\s*\[([^\]]*)\]/,
};

function orderFor(profile) {
  const block = ORDER_BLOCK.match(ORDER_PATTERNS[profile]);
  if (!block) return null;
  return [...block[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] || m[2]);
}

const orders = { genai: orderFor('genai'), swe: orderFor('swe') };

if (!projectSlugs.length) {
  skip('no data-project bands in the markup');
} else if (!orders.genai || !orders.swe) {
  fail('could not read ORDER from js/main.js — check the genai / swe arrays');
} else {
  const inMarkup = new Set(projectSlugs);
  let orderProblems = 0;

  const dupes = projectSlugs.filter((slug, i) => projectSlugs.indexOf(slug) !== i);
  [...new Set(dupes)].forEach((slug) => {
    fail(`data-project="${slug}" is used on more than one band`);
    orderProblems++;
  });

  Object.keys(orders).forEach((profile) => {
    const list = orders[profile];

    list.filter((slug) => !inMarkup.has(slug)).forEach((slug) => {
      fail(`ORDER.${profile} names "${slug}", which no band carries`);
      orderProblems++;
    });

    [...inMarkup].filter((slug) => list.indexOf(slug) === -1).forEach((slug) => {
      fail(`band "${slug}" is missing from ORDER.${profile}`);
      orderProblems++;
    });

    list.filter((slug, i) => list.indexOf(slug) !== i).forEach((slug) => {
      fail(`ORDER.${profile} lists "${slug}" twice`);
      orderProblems++;
    });
  });

  if (!orderProblems) {
    pass(`${projectSlugs.length} bands, both profiles order all of them`);
  }
}

/* ---------- 11b. band seams ----------
   Bands no longer alternate: a project band's tone follows its background
   image. Where two of the same tone meet, a seam line is what keeps them from
   reading as one section, so the sequence is printed here — the runs are a
   design choice now and worth being able to see — and a tone that has a
   same-tone join with no rule behind it is a failure.
   ------------------------------------------------------------ */
heading('11b. Band seams');

const bandInfo = bandTags.map((tag) => ({
  key: (tag.match(/\sdata-project="([^"]+)"/) || tag.match(/\sid="([^"]+)"/) || [, '?'])[1],
  slug: (tag.match(/\sdata-project="([^"]+)"/) || [])[1],
  tone: /\bprtflo-band--dark\b/.test(tag) ? 'dark' : 'light',
}));

/* applyOrder moves only the data-project bands, and they are contiguous, so
   the reordered page is the same list with those slots refilled. */
function sequenceFor(profile) {
  const order = orders[profile];
  if (!order) return bandInfo;
  const slots = bandInfo.map((b, i) => (b.slug ? i : -1)).filter((i) => i >= 0);
  const bySlug = {};
  bandInfo.forEach((b) => { if (b.slug) bySlug[b.slug] = b; });
  const picked = order.filter((slug) => bySlug[slug]).map((slug) => bySlug[slug]);
  const out = bandInfo.slice();
  slots.forEach((slot, i) => { if (picked[i]) out[slot] = picked[i]; });
  return out;
}

const seamRules = {
  light: /\.prtflo-band--light\s*\+\s*\.prtflo-band--light/.test(cssCode),
  dark: /\.prtflo-band--dark\s*\+\s*\.prtflo-band--dark/.test(cssCode),
};
const crossMainRule = /\+\s*main\s*>\s*\.prtflo-band--(?:light|dark):first-child/.test(cssCode);

if (!bandInfo.length || !orders.genai) {
  skip('cannot build the band sequence');
} else {
  const needed = new Set();
  let crossMainNeeded = false;

  Object.keys(orders).forEach((profile) => {
    const seq = sequenceFor(profile);
    const parts = [];
    seq.forEach((band, i) => {
      const prev = seq[i - 1];
      const seam = prev && prev.tone === band.tone;
      if (seam) needed.add(band.tone);
      parts.push((seam ? ' | ' : '   ') + (band.tone === 'dark' ? 'D' : 'L'));
    });
    pass(`${profile.padEnd(5)} ${parts.join('').trim()}   (| = seam needed)`);
  });

  /* #results is outside <main>, so the first band inside it has no previous
     sibling and the plain + rule cannot reach that join. */
  const results = bandInfo.find((b) => b.key === 'results');
  const firstInMain = sequenceFor('genai').find((b) => b.slug);
  if (results && firstInMain) {
    Object.keys(orders).forEach((profile) => {
      const lead = sequenceFor(profile).find((b) => b.slug);
      if (lead && lead.tone === results.tone) crossMainNeeded = true;
    });
  }

  let gaps = 0;
  [...needed].forEach((tone) => {
    if (!seamRules[tone]) {
      fail(`${tone} bands sit next to each other but there is no ${tone} + ${tone} seam rule`);
      gaps++;
    }
  });
  if (crossMainNeeded && !crossMainRule) {
    fail('the first band in <main> matches #results in tone, but no rule covers that seam');
    gaps++;
  }

  if (!gaps) {
    pass(`seam rules cover every same-tone join${crossMainNeeded ? ', including the one across <main>' : ''}`);
  }
}

/* The seam adds air by overriding --band-seam-air, which only reaches the box
   while .prtflo-band's padding still reads it. Hardcode padding-block back and
   the line survives while the space silently vanishes — and the collapsed
   project bands, which need the space most, are the ones that would lose it. */
const bandRule = (cssCode.match(/(?:^|\})\s*\.prtflo-band\s*\{([^}]*)\}/) || [, ''])[1];
const seamRuleBody = (cssCode.match(/\.prtflo-band--dark\s*\+\s*\.prtflo-band--dark[^{]*\{([^}]*)\}/) || [, ''])[1];

if (!bandRule) {
  skip('no .prtflo-band rule found');
} else if (/--band-seam-air/.test(seamRuleBody) && /padding-block:[^;]*--band-seam-air/.test(bandRule)) {
  pass('seam air flows through --band-seam-air into the band padding');
} else if (!/--band-seam-air/.test(seamRuleBody)) {
  skip('the seam rule adds no air, only a line');
} else {
  fail('.prtflo-band padding no longer reads --band-seam-air, so the seam air is dead');
}

/* ---------- 12. background images ----------
   Three things, none of which any earlier check covers.

   Check 7 reads href and src out of the markup, so a url() in the stylesheet
   was never looked at — and all eight band images are referenced from there.
   Worse, an unresolved var(--band-image) does not fail loudly: the background
   shorthand becomes invalid at computed-value time and the band quietly loses
   its scrim along with its image, which is the one failure that would let
   unreadable text ship.
   ------------------------------------------------------------ */
heading('12. Background images');

const BG_DIR = 'assets/backgrounds';

/* url(...) in a stylesheet resolves against the stylesheet, not the page. */
const CSS_DIR = path.posix.join('css', '..');
function fromStylesheet(ref) {
  return path.posix.normalize(path.posix.join('css', ref));
}

const cssUrls = [...new Set(
  [...cssCode.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)]
    .map((m) => m[1].trim())
    .filter((ref) => !/^(?:https?:|data:|\/\/|#)/.test(ref))
)];

if (!cssUrls.length) {
  skip('no local url() references in the stylesheet');
} else {
  cssUrls.forEach((ref) => {
    const resolved = fromStylesheet(ref.split(/[?#]/)[0]);
    if (existsExact(resolved)) pass(`url(${ref}) -> ${resolved}`);
    else if (fs.existsSync(path.join(ROOT, resolved))) {
      fail(`url(${ref}) resolves here but its spelling on disk differs — it will 404 on a case-sensitive host`);
    } else fail(`url(${ref}) is referenced but not on disk`);
  });
}

/* Every band tagged as imaged needs a --band-image mapping, keyed by its
   data-project slug or, for the bands that have no slug, by its id. */
const imagedBands = bandTags.filter((tag) => /\bprtflo-band--image\b/.test(tag));

if (!imagedBands.length) {
  skip('no imaged bands');
} else {
  let unmapped = 0;
  imagedBands.forEach((tag) => {
    const slug = (tag.match(/\sdata-project="([^"]+)"/) || [])[1];
    const id = (tag.match(/\sid="([^"]+)"/) || [])[1];
    const key = slug || id;

    if (!key) {
      fail('an imaged band has neither data-project nor id, so no rule can target it');
      unmapped++;
      return;
    }

    const selector = slug ? `[data-project="${slug}"]` : `#${id}`;
    const mapped = [...cssCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some((rule) =>
      rule[1].includes(selector) && /--band-image\s*:/.test(rule[2])
    );

    if (mapped) pass(`${key} has a --band-image rule`);
    else {
      fail(`imaged band "${key}" has no --band-image rule — it would lose its scrim too`);
      unmapped++;
    }
  });

  /* The other direction: a token that no band can pick up. */
  [...cssCode.matchAll(/([^{}]+)\{([^{}]*--band-image\s*:[^{}]*)\}/g)].forEach((rule) => {
    const selector = rule[1].trim();
    const slug = (selector.match(/\[data-project="([^"]+)"\]/) || [])[1];
    const id = (selector.match(/^#([\w-]+)$/) || [])[1];
    const key = slug || id;
    if (!key) return;

    const claimed = imagedBands.some((tag) =>
      slug ? tag.includes(`data-project="${slug}"`) : tag.includes(`id="${id}"`)
    );
    if (!claimed) {
      warn(`--band-image is set for "${key}", but no band carries prtflo-band--image for it`);
    }
  });

  if (!unmapped) pass(`${imagedBands.length} imaged bands all mapped`);
}

let bgEntries = null;
try {
  bgEntries = fs.readdirSync(path.join(ROOT, BG_DIR));
} catch (error) {
  bgEntries = null;
}

/* Weight and dimensions. The images went from 7.1MB to 87KB across this
   redesign; without a floor under that, one re-export at the wrong settings
   puts it back silently. Dimensions are read straight out of the WebP header,
   so this needs no decoder and no dependency. */
const BG_MAX_KB = 40;
const BG_MAX_WIDTH = 900;

function webpSize(file) {
  let head;
  try {
    const fd = fs.openSync(file, 'r');
    head = Buffer.alloc(32);
    fs.readSync(fd, head, 0, 32, 0);
    fs.closeSync(fd);
  } catch (error) {
    return null;
  }

  if (head.slice(0, 4).toString('latin1') !== 'RIFF') return null;
  if (head.slice(8, 12).toString('latin1') !== 'WEBP') return null;

  const chunk = head.slice(12, 16).toString('latin1');
  if (chunk === 'VP8 ') {
    return { w: head.readUInt16LE(26) & 0x3fff, h: head.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = head.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return {
      w: (head[24] | (head[25] << 8) | (head[26] << 16)) + 1,
      h: (head[27] | (head[28] << 8) | (head[29] << 16)) + 1,
    };
  }
  return null;
}

if (bgEntries === null) {
  skip('cannot read the backgrounds folder');
} else {
  let total = 0;
  let overBudget = 0;

  bgEntries.forEach((file) => {
    const full = path.join(ROOT, BG_DIR, file);
    const kb = fs.statSync(full).size / 1024;
    total += kb;

    const dims = webpSize(full);
    const label = `${file} — ${kb.toFixed(1)} KB` + (dims ? `, ${dims.w}x${dims.h}` : '');

    if (kb > BG_MAX_KB) {
      fail(`${label} — over the ${BG_MAX_KB} KB budget`);
      overBudget++;
    } else if (dims && dims.w > BG_MAX_WIDTH) {
      fail(`${label} — wider than ${BG_MAX_WIDTH}px; it is blurred, so it gains nothing`);
      overBudget++;
    } else if (!dims && /\.webp$/i.test(file)) {
      warn(`${label} — could not read its WebP header`);
    } else {
      pass(label);
    }
  });

  if (!overBudget) pass(`${total.toFixed(0)} KB of imagery in total`);
}

/* Files in the folder that nothing points at. */
if (bgEntries === null) {
  warn(`${BG_DIR}/ is not on disk`);
} else {
  const referenced = new Set(cssUrls.map((ref) => path.posix.basename(ref.split(/[?#]/)[0])));
  bgEntries
    .filter((file) => !referenced.has(file))
    .forEach((file) => warn(`${BG_DIR}/${file} is on disk but nothing references it`));
}

/* ---------- 13. scrim geometry ----------
   The scrim is a gradient: full strength across the text column, falling away
   to --band-scrim-edge in the gutters. That is only safe while the full-strength
   zone is at least as wide as the column, so both are driven from --page-max.
   Hardcode a width back into either one and the guaranteed region quietly stops
   matching the region that holds text — with no visible symptom until someone
   reads a caption over a bright patch.
   ------------------------------------------------------------ */
heading('13. Scrim geometry');

/* Anchored to the start of a rule, so this does not match the descendant
   selector `.prtflo-band--image > .prtflo-page`. */
const pageRule = (cssCode.match(/(?:^|\})\s*\.prtflo-page\s*\{([^}]*)\}/) || [, ''])[1];
const pageMax = /max-width:\s*var\(\s*--page-max\s*\)/.test(pageRule);
const beforeRule = (cssCode.match(/\.prtflo-band--image::before\s*\{([^}]*)\}/) || [, ''])[1];
const gradientUsesToken = /--page-max/.test(beforeRule);

if (!pageRule) {
  skip('no .prtflo-page rule found');
} else if (pageMax && gradientUsesToken) {
  pass('column width and scrim stops both read --page-max');
} else {
  if (!pageMax) fail('.prtflo-page max-width does not read var(--page-max)');
  if (!gradientUsesToken) fail('the scrim gradient does not reference --page-max');
}

/* The gutter scrim has no contrast duty, but it must be the lighter of the two
   or the gradient is working against itself. */
function alphaOf(selector, token) {
  const rule = tokensFor(selector)[token];
  if (!rule) return null;
  const m = rule.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : 1;
}

[['.prtflo-band--light', 'light'], ['.prtflo-band--dark', 'dark']].forEach(([selector, label]) => {
  const full = alphaOf(selector, '--band-scrim');
  const edge = alphaOf(selector, '--band-scrim-edge');

  if (full === null || edge === null) {
    fail(`${label} band is missing --band-scrim or --band-scrim-edge`);
  } else if (edge >= full) {
    fail(`${label} gutter scrim (${edge}) is not lighter than its column scrim (${full})`);
  } else {
    pass(`${label} band: column ${full}, gutter ${edge}`);
  }
});

/* ---------- 14. script parses ---------- */
heading('14. Script syntax');
try {
  execFileSync(process.execPath, ['--check', JS_FILE], { stdio: 'pipe' });
  pass('js/main.js parses');
} catch (error) {
  fail('js/main.js does not parse:\n' + String(error.stderr || error.message).trim());
}

/* ------------------------------------------------------------
   14. Assistant corpus.

   data/corpus.json is the grounding text for the assistant, and its own
   checks live in tools/corpus-check.js. It runs as a child process rather
   than being required, so the two scripts stay independent and either can
   be run on its own. Only the verdict is reported here; the child's own
   output is printed when it fails, so a failure never needs a second run.

   The corpus is optional — the page works without it — so a missing file
   is a skip rather than a failure.
   ------------------------------------------------------------ */
heading('15. Assistant corpus');
const CORPUS_CHECK = path.join(__dirname, 'corpus-check.js');
const CORPUS_FILE = path.join(ROOT, 'data', 'corpus.json');

if (!fs.existsSync(CORPUS_FILE)) {
  skip('data/corpus.json is not on disk');
} else if (!fs.existsSync(CORPUS_CHECK)) {
  warn('tools/corpus-check.js is missing, so the corpus is unchecked');
} else {
  try {
    const out = execFileSync(process.execPath, [CORPUS_CHECK], { stdio: 'pipe' }).toString();
    const counts = [...out.matchAll(/^ {2}ok {4}(\d+)/gm)].map((m) => Number(m[1]));
    const spans = /(\d+) spans all appear verbatim/.exec(out);
    pass('data/corpus.json' + (spans ? ` — ${spans[1]} spans verbatim` : '') +
      (counts.length ? `, ${counts[0]} entries` : ''));
  } catch (error) {
    const out = String(error.stdout || '') + String(error.stderr || '');
    fail('data/corpus.json has problems — node tools/corpus-check.js\n' +
      out.split('\n').filter((line) => /FAIL|warn/.test(line)).join('\n').trimEnd());
  }
}

/* ---------- summary ---------- */
console.log('\n' + '-'.repeat(52));
if (failures) {
  console.log(`${failures} failure${failures === 1 ? '' : 's'}` + (warnings ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''));
  process.exit(1);
}
console.log(warnings ? `Passed, with ${warnings} warning${warnings === 1 ? '' : 's'}.` : 'All checks passed.');
process.exit(0);
