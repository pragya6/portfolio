/* ============================================================
   Pragya Singhal — portfolio
   No dependencies. Every observer disconnects once its work is
   done, and nothing listens to scroll, so the page stays idle
   while the visitor reads.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  var supportsObserver = 'IntersectionObserver' in window;

  /* ---------- profile: genai (default) or swe ---------- */
  /* One page, two readings. The client/PHP cards are always in the document —
     they are collapsed for genai and expanded for swe, never removed. That
     matters for the assistant: it can cite one of these projects on either
     profile and still have a real element to open, scroll to and highlight,
     instead of a citation pointing at nothing.

     The URL selects the profile: ?r=swe. No `r`, or a value the list below
     does not know, falls back to genai. */
  var PROFILE_PARAM = 'r';
  var PROFILES = ['genai', 'swe'];
  var DEFAULT_PROFILE = 'genai';

  /* ---------- project order ----------
     Each project sits alone in its own band, so ordering them means moving the
     band elements. The values are `data-project` slugs, in the order the bands
     should read top to bottom.

     `genai` is document order, so the default page needs no work. `swe` leads
     with the production client work instead.

     Moving the elements rather than setting CSS `order` is deliberate: `order`
     changes visual order only, leaving tab order and the reading order given to
     a screen reader following the markup. Moving the nodes keeps all three
     together. It is also what makes band tone safe to reorder, now that tone is
     declared on the band rather than derived from its position. */
  var ORDER = {
    genai: [
      'crm-agent',
      'myhive-assistant',
      'homoeo-quiz',
      'storylines',
      'trestle-reso',
      'ims-techable',
      'vanshbel'
    ],
    swe: [
      'storylines',
      'trestle-reso',
      'ims-techable',
      'vanshbel',
      'myhive-assistant',
      'crm-agent',
      'homoeo-quiz'
    ]
  };

  /* The nav's "Work" link points at #work, so the id has to travel with
     whichever band ends up first rather than staying on the one the markup
     happens to list first. */
  var WORK_ANCHOR = 'work';

  function readParam(name) {
    var query = window.location.search;
    if (!query) {
      return null;
    }

    if (window.URLSearchParams) {
      return new URLSearchParams(query).get(name);
    }

    /* No URLSearchParams: read the pair by hand. */
    var pairs = query.replace(/^\?/, '').split('&');
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].split('=');
      if (decodeURIComponent(pair[0]) === name) {
        return decodeURIComponent((pair[1] || '').replace(/\+/g, ' '));
      }
    }

    return null;
  }

  /* The profile the URL actually asked for, or null when it named none or named
     one we do not publish. Null is the "audience unknown" case, which the hero
     answers by offering both resumes rather than guessing at one. */
  function requestedProfile() {
    var requested = readParam(PROFILE_PARAM);
    if (requested === null) {
      return null;
    }

    requested = requested.trim().toLowerCase();
    return PROFILES.indexOf(requested) === -1 ? null : requested;
  }

  function currentProfile() {
    return requestedProfile() || DEFAULT_PROFILE;
  }

  /* Open the disclosure a target sits in, so anything that points at a
     collapsed card — a #hash link, the assistant, a keyboard user — lands on
     open content rather than on a closed summary. */
  function expand(el) {
    /* The id usually sits on the <article>, with its <details> inside, so
       look down as well as up. */
    var inner = el.tagName === 'DETAILS' ? el : el.querySelector('details');
    if (inner) {
      inner.open = true;
    }

    var node = el;
    while (node && node !== document.body) {
      if (node.tagName === 'DETAILS') {
        node.open = true;
      }
      if (node.hasAttribute && node.hasAttribute('hidden')) {
        node.removeAttribute('hidden');
      }
      node = node.parentNode;
    }
  }

  function revealProject(id) {
    var el = document.getElementById(id);
    if (!el) {
      return false;
    }

    expand(el);
    el.scrollIntoView({
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
      block: 'start'
    });
    return true;
  }

  /* The SWE reading of the page. Only what differs from the markup is listed:
     the markup itself holds the genai copy, so the page is complete before any
     script runs and stays complete if none does. The `availability` string is
     kept out of the dot <span>, which is why it is written back as a text node
     rather than as innerHTML. */
  var CONTENT = {
    swe: {
      title: 'Pragya Singhal — Software Engineer',
      description: 'Software engineer with ~4 years shipping production systems — backend, REST APIs, enterprise integrations — now building GenAI systems end to end: agents, grounded RAG, and the evaluation harnesses behind them.',
      tagline: 'Four years of production systems. Now shipping the AI that runs on them.',
      summary: 'Around four years building production systems — backend services, REST APIs, enterprise integrations and event-driven workflows. Recently, on top of those fundamentals, I have been building GenAI systems end to end: agents with tool calling and human-in-the-loop controls, grounded RAG, and the evaluation harnesses that show they hold up.',
      availability: 'Open to Software Engineer roles — backend, platform, and hands-on GenAI',

      /* Headline-figures section (#results). The genai heading credits an eval
         harness, which none of the SWE figures came from. */
      resultsEyebrow: 'Built and shipped',
      resultsHeading: 'Four years of systems that had to keep running.',

      /* `count` is optional: with it the figure animates up like the genai
         ones, without it the value is written as static text. A range has no
         single number to count to, so the first item simply does not animate. */
      metrics: [
        {
          value: '~75–80%',
          label: 'Manual effort reduced',
          note: 'CRM, payment and notification workflows'
        },
        {
          value: '2',
          count: 2,
          label: 'Framework migrations',
          note: 'zero regression, large codebases'
        },
        {
          value: '~4',
          count: 4,
          prefix: '~',
          label: 'Years in production',
          note: 'backend, APIs, integrations'
        },
        {
          value: '~40K',
          count: 40,
          prefix: '~',
          suffix: 'K',
          label: 'Users on the platform',
          note: 'served by workflows I built'
        }
      ]
    }
  };

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el && value) {
      el.textContent = value;
    }
  }

  function setMeta(selector, value) {
    var el = document.querySelector(selector);
    if (el && value) {
      el.setAttribute('content', value);
    }
  }

  /* Rewrites the headline figures in place. The markup stays the genai set and
     the single source of the item's structure — a missing item is cloned from
     the first one, so this keeps working if the section is restyled, as long as
     the class names hold. Runs before initCounters, which reads the data-count
     attributes written here. */
  function applyMetrics(metrics) {
    var group = document.querySelector('.prtflo-results');
    if (!group || !metrics) {
      return;
    }

    var items = group.querySelectorAll('.prtflo-results__item');
    if (!items.length) {
      return;
    }

    var template = items[0];

    for (var i = 0; i < metrics.length; i++) {
      var metric = metrics[i];
      var item = items[i];

      if (!item) {
        item = template.cloneNode(true);
        group.appendChild(item);
      }

      var value = item.querySelector('.prtflo-results__value');
      var label = item.querySelector('.prtflo-results__label');
      var note = item.querySelector('.prtflo-results__note');

      if (value) {
        value.textContent = metric.value;

        /* Clear the genai counter settings before writing this metric's own. */
        value.removeAttribute('data-count');
        value.removeAttribute('data-decimals');
        value.removeAttribute('data-prefix');
        value.removeAttribute('data-suffix');

        if (typeof metric.count === 'number') {
          value.setAttribute('data-count', String(metric.count));
          if (metric.decimals) {
            value.setAttribute('data-decimals', String(metric.decimals));
          }
          if (metric.prefix) {
            value.setAttribute('data-prefix', metric.prefix);
          }
          if (metric.suffix) {
            value.setAttribute('data-suffix', metric.suffix);
          }
        }
      }

      if (label) {
        label.textContent = metric.label;
      }
      if (note) {
        note.textContent = metric.note;
      }
    }

    /* Drop any figure the new set does not use. */
    for (var j = metrics.length; j < items.length; j++) {
      group.removeChild(items[j]);
    }
  }

  function applyContent(profile) {
    var copy = CONTENT[profile];
    if (!copy) {
      return; /* genai: the markup already says it */
    }

    if (copy.title) {
      document.title = copy.title;
      setMeta('meta[property="og:title"]', copy.title);
    }
    setMeta('meta[name="description"]', copy.description);
    setMeta('meta[property="og:description"]', copy.description);

    setText('hero-tagline', copy.tagline);
    setText('hero-summary', copy.summary);
    setText('hero-availability', copy.availability);
    setText('results-eyebrow', copy.resultsEyebrow);
    setText('results-title', copy.resultsHeading);
    applyMetrics(copy.metrics);
  }

  /* Re-stack the project bands into the order this profile asks for.

     Appending an element that is already in the document moves it instead of
     copying it, so listeners, focus and any open <details> survive. The bands
     are collected into a fragment first and reinserted in one go, which keeps
     it to a single reflow and leaves whatever follows them in <main> — the
     experience, skills and contact bands — untouched. */
  function applyOrder(profile) {
    var order = ORDER[profile];
    if (!order) {
      return;
    }

    var bands = {};
    var first = null;
    [].forEach.call(document.querySelectorAll('[data-project]'), function (band) {
      bands[band.getAttribute('data-project')] = band;
      if (!first) {
        first = band;
      }
    });

    if (!first || !first.parentNode) {
      return;
    }

    /* Anything the markup has that ORDER does not name keeps its place at the
       end, so adding a band to the page can never make it disappear. */
    var slugs = order.filter(function (slug) {
      return bands[slug];
    });
    Object.keys(bands).forEach(function (slug) {
      if (slugs.indexOf(slug) === -1) {
        slugs.push(slug);
      }
    });

    var parent = first.parentNode;
    var marker = document.createComment('project bands');
    parent.insertBefore(marker, first);

    var fragment = document.createDocumentFragment();
    slugs.forEach(function (slug) {
      fragment.appendChild(bands[slug]);
    });
    parent.insertBefore(fragment, marker);
    parent.removeChild(marker);

    /* Hand #work to the band that is now on top. */
    var lead = bands[slugs[0]];
    if (lead && lead.id !== WORK_ANCHOR) {
      var previous = document.getElementById(WORK_ANCHOR);
      if (previous) {
        previous.removeAttribute('id');
      }
      lead.id = WORK_ANCHOR;
    }
  }

  function initProfile() {
    var profile = currentProfile();

    /* On the root so CSS, and anything reading the page, can see the profile. */
    root.setAttribute('data-profile', profile);

    applyContent(profile);

    /* Before the deep-link handling below, so a #hash lands on a band that is
       already in its final position. */
    applyOrder(profile);

    var swe = profile === 'swe';
    var disclosures = document.querySelectorAll('[data-gated] .project__disclosure');
    for (var i = 0; i < disclosures.length; i++) {
      disclosures[i].open = swe;
    }

    /* The resume button follows the profile. Both paths live on the element, so
       the markup stays the single place a file name is written down. */
    var resume = document.getElementById('resume-primary');
    if (resume) {
      var href = resume.getAttribute('data-resume-' + profile);
      if (href) {
        resume.setAttribute('href', href);
      }
    }

    /* Deep link straight to a project, e.g. /#project-vanshbel. */
    if (window.location.hash.length > 1) {
      revealProject(window.location.hash.slice(1));
    }

    window.addEventListener('hashchange', function () {
      if (window.location.hash.length > 1) {
        revealProject(window.location.hash.slice(1));
      }
    });

    /* The assistant's one hook into the page. */
    window.portfolio = window.portfolio || {};
    window.portfolio.profile = profile;
    window.portfolio.revealProject = revealProject;
  }

  /* ---------- reveal on scroll ---------- */
  function initReveal() {
    var targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) {
      return;
    }

    /* Reduced motion, or no observer support: show everything at once. */
    if (reduceMotion.matches || !supportsObserver) {
      for (var i = 0; i < targets.length; i++) {
        targets[i].classList.add('is-revealed');
      }
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ---------- counting figures ---------- */
  function format(value, decimals, prefix, suffix) {
    return prefix + value.toFixed(decimals) + suffix;
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';

    if (isNaN(target)) {
      return;
    }

    var duration = 900;
    var startTime = null;

    function step(timestamp) {
      if (startTime === null) {
        startTime = timestamp;
      }
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = format(target * eased, decimals, prefix, suffix);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = format(target, decimals, prefix, suffix);
      }
    }

    requestAnimationFrame(step);
  }

  function initCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length || reduceMotion.matches || !supportsObserver) {
      return; /* the markup already carries the final value */
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          countUp(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    counters.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ---------- nav: current section ---------- */
  function initNav() {
    var nav = document.getElementById('site-nav');
    var bands = [].slice.call(document.querySelectorAll('.prtflo-band'));
    var links = [].slice.call(document.querySelectorAll('.site-nav__link'));

    if (!supportsObserver || !nav || !bands.length) {
      return;
    }

    var byId = {};
    links.forEach(function (link) {
      byId[link.getAttribute('href').slice(1)] = link;
    });

    var active = [];

    /* The strip sits just below the bar. A band intersecting it is a band
       the bar is currently over; the first in document order is the one
       directly beneath. Cheaper and steadier than a scroll handler. */
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var i = active.indexOf(entry.target);
        if (entry.isIntersecting && i === -1) {
          active.push(entry.target);
        } else if (!entry.isIntersecting && i > -1) {
          active.splice(i, 1);
        }
      });

      var current = null;
      for (var i = 0; i < bands.length; i++) {
        if (active.indexOf(bands[i]) > -1) {
          current = bands[i];
          break;
        }
      }
      if (!current) {
        return;
      }

      /* The bar no longer inverts against the band beneath it — it is dark on
         every band, separated by a hairline and a shadow — so nothing here
         needs to know the band's tone. All that is left is the current link. */
      var id = current.getAttribute('data-nav') || current.id;
      Object.keys(byId).forEach(function (key) {
        if (key === id) {
          byId[key].setAttribute('aria-current', 'true');
        } else {
          byId[key].removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-61px 0px -72% 0px', threshold: 0 });

    bands.forEach(function (band) {
      observer.observe(band);
    });
  }

  /* Before initReveal, so any unhidden cards get observed with the rest. */
  initProfile();
  initReveal();
  initCounters();
  initNav();
})();
