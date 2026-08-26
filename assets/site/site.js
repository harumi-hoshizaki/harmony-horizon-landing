/* Harmony Horizon — トップページ。依存なし、第三者への通信なし。 */
(function () {
  'use strict';

  /* 抽斗メニュー */
  var burger = document.querySelector('.burger');
  var drawer = document.getElementById('drawer');
  if (burger && drawer) {
    var header = document.querySelector('.hdr');
    /* 測る、推測しない。ヘッダーの上に帯が入れば位置は変わる（追補4 §167-B）。 */
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

  /* 年号は生成時の値を焼き込まない */
  var yr = document.querySelector('.yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* 要確認マーカーの表示切替。見せる相手によって切る（追補3 §150）。 */
  var toggle = document.querySelector('.revtoggle');
  if (toggle) {
    var KEY = 'hh-review';
    var apply = function (on) {
      document.body.classList.toggle('review-off', !on);
      toggle.setAttribute('aria-pressed', String(on));
      toggle.querySelector('span').textContent = toggle.getAttribute(on ? 'data-on' : 'data-off');
    };
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    apply(saved !== 'off');
    toggle.addEventListener('click', function () {
      var on = toggle.getAttribute('aria-pressed') !== 'true';
      apply(on);
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    });
  }

  /* 出現アニメーション */
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
