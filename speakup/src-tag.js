/* ══════════════════════════════════════════════════════════════
   どの投稿・どのSNSから来た人が買ったのかを、Stripeまで運ぶ(Speak Up 用)。
   2026-11-10

   ★中身は eatout/src-tag.js の写し。変えたのは5か所だけ:
       保存の名前  eatout_src            → speakup_src
       関数の名前  eatoutSrc / eatoutStampBuyLinks / eatoutCarrySrc
                   → speakupSrc / speakupStampBuyLinks / speakupCarrySrc
       サイト内リンクの頭  /eatout → /speakup
     直す時は eatout/src-tag.js を先に直して、ここへ写し直す。

   これが無かった時の困りごと:
     2026-10-12〜11-10 の投稿80本のうちリンク入りは14本で、全部が
     印なしの /speakup 。Stripe には全部 "speakup" と並ぶだけで、
     Instagram・YouTube・Threads のどれが売れたのかも分からなかった。

   やること: URLの ?v=〇〇 を Stripe の client_reference_id に足す。

     /speakup/?v=ig_bio  →  client_reference_id = speakup-ig_bio
     印が無い時          →  speakup （今までと1文字も同じ）

   外部サービス・トラッキングスクリプト・Cookieは使わない。
   保存するのは自分で決めた短い文字列(ig_bio など)だけで、個人に
   結びつく情報は一切持たない。

   印は localStorage に残す。投稿から来て、その日は買わず、
   翌日ブックマークから戻って買う —— という人を取りこぼさないため。
   新しい ?v= が来たら上書きする(最後に見た投稿の手柄にする)。
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'speakup_src';
  var MAX = 24;   /* Stripeのidは200字まで。印は短く保つ */

  /* 印に使えるのは英数字と _ - だけ。URLから来る文字をそのまま
     Stripeへ流さない(壊れたidを作らないための門番)。 */
  function clean(v) {
    return String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, MAX);
  }

  function readSrc() {
    var m = /[?&]v=([^&#]*)/.exec(location.search);
    var fromUrl = '';
    if (m) {
      try { fromUrl = clean(decodeURIComponent(m[1])); }
      catch (e) { fromUrl = clean(m[1]); }
    }
    if (fromUrl) {
      try { localStorage.setItem(KEY, fromUrl); } catch (e) { /* 保存できなくても続行 */ }
      return fromUrl;
    }
    try { return clean(localStorage.getItem(KEY)); } catch (e) { return ''; }
  }

  var SRC = readSrc();
  window.speakupSrc = SRC;

  /* client_reference_id の値の後ろに足す。パラメータの順番が変わっても
     壊れないように、名前で探して書き換える(末尾に足すだけの実装だと、
     あとで別のパラメータが増えた日に壊れる)。 */
  function withRef(href, tail) {
    return href.replace(/(client_reference_id=)([^&#]*)/,
                        function (_, k, v) { return k + v + tail; });
  }

  /* 購入リンクに印を付ける。
     extra は任意の追加(クイズの点数など)。
     元のhrefを data-base-href に覚えるので、何度呼んでも二重に付かない。 */
  window.speakupStampBuyLinks = function (extra) {
    /* 印が無い人には、何も足さない。extra(点数)も足さない。
       リールを始める前から動いている導線(検索・ブックマーク・既存のLP)が
       ここにぶら下がっているので、その人たちのidは1文字も変えない
       —— 変えると、これまでの売上と並べて見られなくなる。
       ★この行が最初 (SRC ? … : '') + (extra ? … : '') になっていて、
         印の無い人にも -s6 が付いていた。tests/ui/reeltag-test.js が
         捕まえた。 */
    var tail = SRC ? ('-' + SRC + (extra ? '-' + clean(extra) : '')) : '';
    var links = document.querySelectorAll('a[href*="buy.stripe.com"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var base = a.getAttribute('data-base-href');
      if (base === null) {
        base = a.getAttribute('href');
        a.setAttribute('data-base-href', base);
      }
      a.setAttribute('href', tail ? withRef(base, tail) : base);
    }
  };

  /* クイズ → LP のように、サイトの中を移動しても印を落とさない。
     ページの中の目印(#try など)や外部リンクには触らない。 */
  window.speakupCarrySrc = function () {
    if (!SRC) return;
    var links = document.querySelectorAll('a[href^="/speakup"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href');
      if (/[?&]v=/.test(href)) continue;
      a.setAttribute('href', href + (href.indexOf('?') >= 0 ? '&' : '?') + 'v=' + SRC);
    }
  };

  /* 読み込んだ時点で一度付けておく。クイズは結果画面で点数付きで
     もう一度呼ぶ(上書きされる)。 */
  function init() {
    window.speakupStampBuyLinks();
    window.speakupCarrySrc();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
