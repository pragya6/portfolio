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

const cssClasses = new Set([...cssCode.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));

/* Classes the scripts add at runtime, so they are never in the markup.
   Looks in js/main.js and in any inline <script> in the page. */
const scriptSources = [fs.readFileSync(JS_FILE, 'utf8')].concat(
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
    if (fs.existsSync(path.join(ROOT, clean))) pass(clean);
    else fail(`${clean} is referenced but not on disk`);
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

/* ---------- 10. script parses ---------- */
heading('10. Script syntax');
try {
  execFileSync(process.execPath, ['--check', JS_FILE], { stdio: 'pipe' });
  pass('js/main.js parses');
} catch (error) {
  fail('js/main.js does not parse:\n' + String(error.stderr || error.message).trim());
}

/* ---------- summary ---------- */
console.log('\n' + '-'.repeat(52));
if (failures) {
  console.log(`${failures} failure${failures === 1 ? '' : 's'}` + (warnings ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''));
  process.exit(1);
}
console.log(warnings ? `Passed, with ${warnings} warning${warnings === 1 ? '' : 's'}.` : 'All checks passed.');
process.exit(0);
