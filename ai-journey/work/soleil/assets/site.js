/* Soleil Renovation — no dependencies, no third-party requests, no cookies. */
(function () {
  'use strict';

  /* Mobile drawer */
  var burger = document.querySelector('.burger');
  var drawer = document.getElementById('drawer');
  if (burger && drawer) {
    var header = document.querySelector('.hdr');
    /* Mesurer, ne pas deviner : l'en-tête peut être décalé par un bandeau. */
    var placeBelowHeader = function () {
      if (!header) return;
      drawer.style.top = Math.max(0, Math.round(header.getBoundingClientRect().bottom)) + 'px';
    };
    var setOpen = function (open) {
      if (open) placeBelowHeader();
      burger.setAttribute('aria-expanded', String(open));
      drawer.setAttribute('data-open', String(open));
      document.documentElement.style.overflow = open ? 'hidden' : '';
      if (open) { var first = drawer.querySelector('a'); if (first) first.focus(); }
    };
    window.addEventListener('resize', function () {
      if (drawer.getAttribute('data-open') === 'true') placeBelowHeader();
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        if (drawer.getAttribute('data-open') === 'true') placeBelowHeader();
      }, 150);
    });
    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });
    drawer.addEventListener('click', function (e) { if (e.target.tagName === 'A') setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setOpen(false); burger.focus(); }
    });
  }

  /* Formulaire de maquette : utilisable, mais rien ne part. */
  var demoForm = document.querySelector('form[data-demo]');
  if (demoForm) {
    demoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = demoForm.querySelector('.form-note');
      if (note) { note.hidden = false; note.focus && note.focus(); }
    });
  }

  /* Mode révision : masquer/afficher les marqueurs de maquette */
  var rev = document.querySelector('.revtoggle');
  if (rev) {
    var KEY = 'mp-review';
    var apply = function (on) {
      document.documentElement.classList.toggle('review-off', !on);
      rev.setAttribute('aria-pressed', String(on));
      rev.lastElementChild.textContent = rev.dataset[on ? 'on' : 'off'];
    };
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    apply(saved !== 'off');
    rev.addEventListener('click', function () {
      var on = rev.getAttribute('aria-pressed') !== 'true';
      apply(on);
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    });
  }

  /* Hauteur réelle de la barre fixe : le libellé peut se replier sur deux
     lignes selon la largeur et la langue. On mesure au lieu de supposer,
     sinon la dernière ligne du pied de page passe sous la barre. */
  var sticky = document.querySelector('.sticky');
  if (sticky) {
    var setStickyH = function () {
      var h = Math.round(sticky.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--sticky-h', (h + 8) + 'px');
    };
    setStickyH();
    window.addEventListener('resize', setStickyH);
    window.addEventListener('orientationchange', setStickyH);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(setStickyH);
  }

  /* Reveal on scroll */
  var items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(items, function (el) { el.classList.add('is-in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
  Array.prototype.forEach.call(items, function (el) { io.observe(el); });
})();
