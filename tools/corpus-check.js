#!/usr/bin/env node
/* ============================================================
   Drift checks for the assistant's grounding corpus.

   Run from anywhere:  node tools/corpus-check.js

   data/corpus.json is what the assistant will be given as context. Every
   string in an entry's `text` is meant to be page copy, word for word, so
   that a citation can be scrolled to and highlighted on screen. Edit the
   page and the corpus drifts; this reports the drift.

   It also enforces the two rules the corpus exists to keep:

     - ids the assistant may cite are real elements, and are not one of the
       moving or decorative ids on the deny list
     - no URL, file path, email address, phone number or key is in the file
       at all, so the assistant cannot leak one it was never shown

   It never renders the page, and it is deliberately standalone — no imports
   from verify.js, so the two can be edited without colliding.

   Exits 0 when everything passes, 1 otherwise.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML_FILE = path.join(ROOT, 'index.html');
const JS_FILE = path.join(ROOT, 'js', 'main.js');
const CORPUS_FILE = path.join(ROOT, 'data', 'corpus.json');

/* ---------- reporting (same shape as verify.js, so the output reads alike) ---------- */
let failures = 0;
let warnings = 0;

const heading = (text) => console.log('\n' + text);
const pass = (text) => console.log('  ok    ' + text);
const fail = (text) => { console.log('  FAIL  ' + text); failures++; };
const warn = (text) => { console.log('  warn  ' + text); warnings++; };
const skip = (text) => console.log('  --    ' + text);

/* ---------- read the sources ---------- */
const missing = [HTML_FILE, JS_FILE, CORPUS_FILE].filter((f) => !fs.existsSync(f));
if (missing.length) {
  missing.forEach((f) => console.log('Cannot find ' + path.relative(ROOT, f)));
  process.exit(1);
}

const html = fs.readFileSync(HTML_FILE, 'utf8');
const js = fs.readFileSync(JS_FILE, 'utf8');
const corpusRaw = fs.readFileSync(CORPUS_FILE, 'utf8');

let corpus;
try {
  corpus = JSON.parse(corpusRaw);
} catch (error) {
  console.log('data/corpus.json is not valid JSON: ' + error.message);
  process.exit(1);
}

/* ------------------------------------------------------------
   Text extraction.

   An element is found by its id, then its end is located by counting opens
   and closes of the same tag name. <svg> is dropped first: the CRM Agent
   diagram carries a lot of label text that is drawn, not read, and quoting
   it back would cite something no highlight could sit on.
   ------------------------------------------------------------ */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr']);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', middot: '·', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…' };

function unescapeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED, key) ? NAMED[key] : whole;
    });
}

/* Tags are dropped rather than replaced with a space. Most of them here are
   inline — <b> around a figure, <span class="project__figure"> around a
   number — so a space would turn "to 100%." into "to 100 %." and report
   drift that is not there. Block-level tags already have whitespace around
   them in the source, which the collapse below takes care of. */
const normalise = (text) => unescapeEntities(text.replace(/<[^>]*>/g, ''))
  .replace(/\s+/g, ' ')
  .trim();

const source = html.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');

function elementText(id) {
  const open = new RegExp('<([a-zA-Z0-9]+)(?=[^>]*\\sid="' + id + '")[^>]*>');
  const start = open.exec(source);
  if (!start) return null;

  const tag = start[1].toLowerCase();
  if (VOID.has(tag)) return '';

  const from = start.index + start[0].length;
  const tags = new RegExp('<(/?)' + tag + '(?=[\\s/>])[^>]*>', 'gi');
  tags.lastIndex = from;

  let depth = 1;
  let match;
  while ((match = tags.exec(source)) !== null) {
    if (match[0].endsWith('/>')) continue;
    depth += match[1] ? -1 : 1;
    if (depth === 0) return normalise(source.slice(from, match.index));
  }

  return null; /* unbalanced — check 9 in verify.js is the one that reports that */
}

/* The SWE copy lives in CONTENT.swe rather than in the markup, so the swe
   half of a two-variant entry is checked against the script instead. */
const CONTENT_SWE = (() => {
  const at = js.indexOf('swe: {');
  if (at === -1) return '';
  return normalise(js.slice(at, js.indexOf('\n  };', at)));
})();

const entries = Array.isArray(corpus.entries) ? corpus.entries : [];
const denied = new Set(corpus.deny_ids || []);
const declaredKeys = new Set(corpus.link_keys || []);
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const target = (entry) => entry.anchor || entry.id;
const spansOf = (entry, profile) => {
  const text = entry.text;
  if (Array.isArray(text)) return text;
  if (text && typeof text === 'object') return text[profile] || [];
  return [];
};

/* ---------- 1. corpus shape ---------- */
heading('1. Corpus shape');
if (!entries.length) {
  fail('no entries');
} else {
  const seen = new Set();
  let shapeOk = true;
  entries.forEach((entry) => {
    if (!entry.id) { fail('an entry has no id'); shapeOk = false; return; }
    if (seen.has(entry.id)) { fail(`entry "${entry.id}" appears more than once`); shapeOk = false; }
    seen.add(entry.id);
    if (!entry.section) { fail(`${entry.id}: no section`); shapeOk = false; }
    if (!spansOf(entry, 'genai').length) { fail(`${entry.id}: no text spans`); shapeOk = false; }
  });
  if (shapeOk) pass(`${entries.length} entries, each with an id, a section and text`);
}

/* ---------- 2. cited ids resolve ---------- */
heading('2. Cited ids');
let unresolved = 0;
entries.forEach((entry) => {
  if (!htmlIds.has(target(entry))) {
    fail(`${entry.id}: no element with id "${target(entry)}"`);
    unresolved++;
  }
});
if (!unresolved) pass(`${entries.length} citable ids all resolve`);

/* ---------- 3. deny list ---------- */
heading('3. Deny list');
let denyHits = 0;
entries.forEach((entry) => {
  [...new Set([entry.id, entry.anchor].filter(Boolean))].forEach((id) => {
    if (denied.has(id)) {
      fail(`${entry.id}: "${id}" is on the deny list and must not be citable`);
      denyHits++;
    }
  });
});
if (!denyHits) pass(`${denied.size} denied ids, none reachable as a citation`);

/* ---------- 4. text is verbatim page copy ---------- */
heading('4. Text drift');
let drift = 0;
let checkedSpans = 0;
(corpus.profiles || ['genai']).forEach((profile) => {
  entries.forEach((entry) => {
    const onPage = elementText(target(entry));
    if (onPage === null) {
      fail(`${entry.id}: could not read the text of "${target(entry)}"`);
      drift++;
      return;
    }
    /* Static copy sits in the markup on both profiles; profile-specific copy
       only exists in CONTENT, so either source counts as being on the page. */
    const haystack = onPage + ' \u0000 ' + CONTENT_SWE;
    spansOf(entry, profile).forEach((span) => {
      checkedSpans++;
      if (!span) {
        fail(`${entry.id} (${profile}): an empty span`);
        drift++;
        return;
      }
      if (!haystack.includes(normalise(span))) {
        fail(`${entry.id} (${profile}): not on the page — "${normalise(span).slice(0, 72)}…"`);
        drift++;
      }
    });
  });
});
if (!drift) pass(`${checkedSpans} spans all appear verbatim on the page`);

/* ---------- 5. metrics ---------- */
heading('5. Metrics');
const metricEntries = entries.filter((entry) => entry.metrics);
if (!metricEntries.length) {
  skip('no entry carries metrics');
} else {
  let bad = 0;
  let count = 0;
  metricEntries.forEach((entry) => {
    const onPage = elementText(target(entry)) || '';
    Object.keys(entry.metrics).forEach((profile) => {
      const haystack = profile === 'swe' ? CONTENT_SWE : onPage;
      entry.metrics[profile].forEach((metric) => {
        count++;
        if (!metric.value || !haystack.includes(normalise(metric.value))) {
          fail(`${entry.id} (${profile}): metric "${metric.value}" is not in the source`);
          bad++;
        }
      });
    });
  });
  if (!bad) pass(`${count} metric values all match their source`);
}

/* ---------- 6. track agrees with the markup ---------- */
heading('6. Project tracks');
const bandSlugs = [...html.matchAll(/\sdata-project="([^"]+)"/g)].map((m) => m[1]);
const articleTracks = {};
[...html.matchAll(/<article class="project[^"]*" id="(project-[^"]+)"([^>]*)>/g)]
  .forEach((m) => {
    const track = /data-track="([^"]+)"/.exec(m[2]);
    articleTracks[m[1]] = track ? track[1] : null;
  });

let trackProblems = 0;
bandSlugs.forEach((slug) => {
  const id = 'project-' + slug;
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    fail(`band "${slug}" has no corpus entry — the assistant cannot see this project`);
    trackProblems++;
    return;
  }
  if (entry.track !== articleTracks[id]) {
    fail(`${id}: corpus says track "${entry.track}", markup says "${articleTracks[id]}"`);
    trackProblems++;
  }
});
entries
  .filter((entry) => entry.id.startsWith('project-'))
  .forEach((entry) => {
    if (!bandSlugs.includes(entry.id.replace(/^project-/, ''))) {
      warn(`${entry.id} is in the corpus but has no band on the page`);
    }
  });
if (!trackProblems) pass(`${bandSlugs.length} project bands all covered, tracks agree`);

/* ---------- 7. link keys ---------- */
heading('7. Link keys');
let keyProblems = 0;
entries.forEach((entry) => {
  (entry.link_keys || []).forEach((key) => {
    if (!declaredKeys.has(key)) {
      fail(`${entry.id}: link_key "${key}" is not in the declared list`);
      keyProblems++;
    }
  });
  if (entry.has_page_link === false && (entry.link_keys || []).length) {
    warn(`${entry.id}: has_page_link is false but link_keys is not empty`);
  }
});
if (!keyProblems) pass(`${declaredKeys.size} declared keys, every reference known`);

/* ------------------------------------------------------------
   8. Nothing the assistant must not hold.

   The corpus is the assistant's whole view of the page, so a URL or an
   address in here is one it can repeat. `hit@k` is a metric name rather
   than an address, so the email rule matches a full address instead of a
   bare @.
   ------------------------------------------------------------ */
heading('8. Secrets and links');
const FORBIDDEN = [
  { label: 'a URL', re: /\bhttps?:\/\/\S+/i },
  { label: 'a protocol-relative URL', re: /(^|[\s"'(])\/\/[a-z0-9-]+\.[a-z]{2,}/i },
  { label: 'an email address', re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
  { label: 'a mailto: or tel: link', re: /\b(?:mailto|tel):/i },
  { label: 'a phone number', re: /(?:\+\d[\d\s().-]{7,}|\b\d{10}\b)/ },
  { label: 'a local file path', re: /\b(?:assets|css|js|data|tools)\/[\w.-]+/ },
  { label: 'a document file name', re: /\b[\w.-]+\.(?:pdf|docx?|webp|png|jpe?g|svg|html|json)\b/i },
  { label: 'an API-key-shaped string', re: /\b(?:AIza[\w-]{10,}|sk-[A-Za-z0-9]{16,}|eyJ[\w-]{10,})\b/ },
  { label: 'a key-ish field name', re: /"(?:api_?key|secret|token|password|bearer)"\s*:/i },
];

let leaks = 0;
FORBIDDEN.forEach((rule) => {
  const hit = rule.re.exec(corpusRaw);
  if (hit) {
    fail(`${rule.label} is in the corpus: "${hit[0].slice(0, 60)}"`);
    leaks++;
  }
});
if (!leaks) pass(`${FORBIDDEN.length} patterns checked, the corpus holds none of them`);

/* ---------- summary ---------- */
console.log('\n' + '-'.repeat(52));
if (failures) {
  console.log(`${failures} failure${failures === 1 ? '' : 's'}` +
    (warnings ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''));
  process.exit(1);
}
console.log(warnings ? `Passed, with ${warnings} warning${warnings === 1 ? '' : 's'}.` : 'All checks passed.');
process.exit(0);
