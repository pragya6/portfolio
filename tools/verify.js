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

/* Inline script and style bodies are not markup, so they are emptied before
   anything counts or walks tags. */
function markupOnly(source) {
  return source
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2')
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2');
}

const counted = markupOnly(html);

let unbalanced = 0;
COUNTED.forEach((tag) => {
  const open = (counted.match(new RegExp('<' + tag + '(?=[\\s>])', 'g')) || []).length;
  const close = (counted.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  if (open !== close) {
    fail(`<${tag}>: ${open} opened, ${close} closed`);
    unbalanced++;
  }
});
if (!unbalanced) pass(COUNTED.length + ' element types balanced');

/* Two things are blanked before walking. Attribute values, because the favicon
   is a data: URI carrying literal <svg> markup. And the body of every inline
   <script>, because a comment or a string in one may mention a tag — a head
   script explaining that the document body is not parsed yet should not be
   read as opening one. */
const walkable = markupOnly(html).replace(/="[^"]*"/g, '=""');
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
   Two mechanisms, and each band must use exactly one.

   The seven project bands sit in .prtflo-work and take their tone from
   :nth-child, so the alternation survives being reordered. A tone class on one
   of those would override the rule and freeze it.

   Every other band is fixed in place and declares its tone outright.

   The fragile part is the wrapper's contents: :nth-child counts every element
   sibling, so a single stray element inside .prtflo-work shifts the parity of
   everything after it, with no error anywhere. That is what the last check
   here is for.
   ------------------------------------------------------------ */
heading('10. Band tone');

const bandTags = [...html.matchAll(/<section\b[^>]*class="[^"]*\bprtflo-band\b[^"]*"[^>]*>/g)]
  .map((m) => m[0]);

const workOpen = html.search(/<div\b[^>]*\bclass="[^"]*\bprtflo-work\b/);
const workBody = workOpen === -1 ? '' : (() => {
  /* Walk to the matching </div> so nested divs do not end the slice early. */
  let depth = 0;
  const from = html.indexOf('>', workOpen) + 1;
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1]) {
      if (depth === 0) return html.slice(from, m.index);
      depth--;
    } else depth++;
  }
  return '';
})();

const inWork = new Set(
  [...workBody.matchAll(/<section\b[^>]*\sdata-project="([^"]+)"/g)].map((m) => m[1])
);

if (workOpen === -1) {
  fail('no .prtflo-work wrapper — the project bands have nothing to alternate inside');
} else {
  let toneProblems = 0;

  bandTags.forEach((tag) => {
    const slug = (tag.match(/\sdata-project="([^"]+)"/) || [])[1];
    const name = slug || (tag.match(/\sid="([^"]+)"/) || [, '(unnamed)'])[1];
    const light = /\bprtflo-band--light\b/.test(tag);
    const dark = /\bprtflo-band--dark\b/.test(tag);

    if (slug && inWork.has(slug)) {
      if (light || dark) {
        fail(`project band "${name}" declares a tone class, which overrides its :nth-child tone`);
        toneProblems++;
      }
    } else if (light && dark) {
      fail(`band "${name}" carries both --light and --dark`);
      toneProblems++;
    } else if (!light && !dark) {
      fail(`band "${name}" declares no tone — add prtflo-band--light or --dark`);
      toneProblems++;
    }
  });

  if (!toneProblems) {
    pass(`${inWork.size} project bands toned by position, ${bandTags.length - inWork.size} by class`);
  }

  /* Element children of the wrapper that are not project bands. Comments are
     not elements, so they are not a problem and are not looked for. */
  const strays = [...workBody.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*>/g)]
    .filter((m) => {
      const before = workBody.slice(0, m.index);
      const open = (before.match(/<(?!\/)[a-zA-Z][\w-]*\b[^>]*>/g) || []).length;
      const close = (before.match(/<\/[a-zA-Z][\w-]*>/g) || []).length;
      return open === close;
    })
    .filter((m) => !/\sdata-project="/.test(m[0]));

  if (strays.length) {
    strays.forEach((m) =>
      fail(`<${m[1]}> sits directly in .prtflo-work and will shift every tone after it`)
    );
  } else {
    pass('.prtflo-work holds project bands and nothing else');
  }
}

/* ---------- 11. project order ----------
   ORDER moved into the head script, so it can run before first paint. It names
   bands by their data-project slug; a renamed slug on either side is silent —
   the band simply keeps its markup position and the profile looks like it never
   reordered.
   ------------------------------------------------------------ */
heading('11. Project order');

const projectSlugs = [...html.matchAll(/\sdata-project="([^"]+)"/g)].map((m) => m[1]);

const ORDER_BLOCK = (html.match(/window\.PORTFOLIO_ORDER\s*=\s*\{([\s\S]*?)\n\s*\};/) || [, ''])[1];
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
  fail('could not read window.PORTFOLIO_ORDER from index.html');
} else {
  const markup = new Set(projectSlugs);
  let orderProblems = 0;

  [...new Set(projectSlugs.filter((v, i) => projectSlugs.indexOf(v) !== i))].forEach((slug) => {
    fail(`data-project="${slug}" is used on more than one band`);
    orderProblems++;
  });

  Object.keys(orders).forEach((profile) => {
    const list = orders[profile];
    list.filter((slug) => !markup.has(slug)).forEach((slug) => {
      fail(`ORDER.${profile} names "${slug}", which no band carries`);
      orderProblems++;
    });
    [...markup].filter((slug) => list.indexOf(slug) === -1).forEach((slug) => {
      fail(`band "${slug}" is missing from ORDER.${profile}`);
      orderProblems++;
    });
    list.filter((slug, i) => list.indexOf(slug) !== i).forEach((slug) => {
      fail(`ORDER.${profile} lists "${slug}" twice`);
      orderProblems++;
    });
  });

  if (!orderProblems) pass(`${projectSlugs.length} bands, both profiles order all of them`);
}

/* ---------- 11b. band alternation ----------
   The seam rules are gone, because with the run alternating and the bands
   either side of it fixed, no two bands of the same tone ever meet. That is a
   claim about the whole page, not just the run — the band before the wrapper
   has to be dark so the first project (odd, light) follows it, and the band
   after has to be the opposite of the last project. Add an eighth project and
   the tail flips. Nothing in the CSS can notice; this can.
   ------------------------------------------------------------ */
heading('11b. Band alternation');

function toneOfTag(tag) {
  return /\bprtflo-band--dark\b/.test(tag) ? 'dark' : 'light';
}

if (workOpen === -1 || !orders.genai) {
  skip('cannot build the band sequence');
} else {
  const before = bandTags.filter((t) => html.indexOf(t) < workOpen);
  const after = bandTags.filter((t) => html.indexOf(t) > workOpen && !/\sdata-project=/.test(t));
  let broken = 0;

  Object.keys(orders).forEach((profile) => {
    /* Position in the run decides tone: 1st, 3rd, 5th… light, the rest dark. */
    const run = orders[profile].map((slug, i) => ({
      key: slug,
      tone: i % 2 === 0 ? 'light' : 'dark',
    }));

    const seq = [
      ...before.map((t) => ({ key: 'fixed', tone: toneOfTag(t) })),
      ...run,
      ...after.map((t) => ({ key: 'fixed', tone: toneOfTag(t) })),
    ];

    const clashes = seq.filter((b, i) => i > 0 && seq[i - 1].tone === b.tone);
    const strip = seq.map((b) => (b.tone === 'dark' ? 'D' : 'L')).join(' ');

    if (clashes.length) {
      fail(`${profile}: ${strip} — ${clashes.length} same-tone join(s)`);
      broken++;
    } else {
      pass(`${profile.padEnd(5)} ${strip}`);
    }
  });

  if (!broken) pass('every band is the opposite tone to the one before it');
}

/* ---------- 12. script parses ---------- */
heading('12. Script syntax');
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
heading('13. Assistant corpus');
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
