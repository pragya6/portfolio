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

  /* ---------- theme toggle ---------- */
  function initTheme() {
    var toggle = document.getElementById('theme-toggle');
    if (!toggle) {
      return;
    }

    var systemDark = window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : { matches: false };

    function currentTheme() {
      return root.getAttribute('data-theme') || (systemDark.matches ? 'dark' : 'light');
    }

    function sync() {
      toggle.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
    }

    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem('theme', next);
      } catch (e) {
        /* storage blocked — the choice simply will not persist */
      }
      sync();
    });

    /* Follow the OS while the visitor has not made an explicit choice. */
    if (typeof systemDark.addEventListener === 'function') {
      systemDark.addEventListener('change', function () {
        if (!root.hasAttribute('data-theme')) {
          sync();
        }
      });
    }

    sync();
  }

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

  function initProfile() {
    var profile = currentProfile();

    /* On the root so CSS, and anything reading the page, can see the profile. */
    root.setAttribute('data-profile', profile);

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

    /* The second link exists for visitors who arrived without `r`, where the
       audience is unknown and offering one resume could hand them the wrong
       one. Once the URL names a profile, that guesswork is gone. */
    var alt = document.getElementById('resume-alt');
    if (alt && requestedProfile() !== null) {
      alt.setAttribute('hidden', 'hidden');
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

  /* ---------- nav: stuck state and current section ---------- */
  function initNav() {
    var nav = document.getElementById('site-nav');
    var links = document.querySelectorAll('.site-nav__link');

    if (!supportsObserver) {
      return;
    }

    /* A zero-height sentinel at the top of the page tells us when the
       nav has left the document flow — cheaper than a scroll handler. */
    if (nav) {
      var sentinel = document.createElement('div');
      sentinel.setAttribute('aria-hidden', 'true');
      sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;';
      document.body.prepend(sentinel);

      new IntersectionObserver(function (entries) {
        nav.setAttribute('data-stuck', String(!entries[0].isIntersecting));
      }).observe(sentinel);
    }

    if (!links.length) {
      return;
    }

    var byId = {};
    var sections = [];

    links.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      var section = document.getElementById(id);
      if (section) {
        byId[id] = link;
        sections.push(section);
      }
    });

    if (!sections.length) {
      return;
    }

    var visible = {};

    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible[entry.target.id] = entry.isIntersecting;
      });

      /* Highlight the first section currently in the viewport band. */
      var active = null;
      for (var i = 0; i < sections.length; i++) {
        if (visible[sections[i].id]) {
          active = sections[i].id;
          break;
        }
      }

      Object.keys(byId).forEach(function (id) {
        if (id === active) {
          byId[id].setAttribute('aria-current', 'true');
        } else {
          byId[id].removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-64px 0px -55% 0px' });

    sections.forEach(function (section) {
      sectionObserver.observe(section);
    });
  }

  initTheme();
  /* Before initReveal, so any unhidden cards get observed with the rest. */
  initProfile();
  initReveal();
  initCounters();
  initNav();
})();
