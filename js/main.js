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
  initReveal();
  initCounters();
  initNav();
})();
