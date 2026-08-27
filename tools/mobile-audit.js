/* 携帯の実測監査（追補4 §167-B の和文版）。
   目視で確かめない。3幅で機械的に測る。
   使い方: python3 -m http.server 8104 &  node tools/mobile-audit.js  */
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');

/* 和文の寸法。欧文の §31 より小さいのは、同じ px でも和文のほうが
   大きく見えるため（追補5）。 */
const SPEC = { h1: [30, 36], h2: [24, 28], h3: [17, 20], body: [16, 18] };
/* 320px の端末では見出しを一段下げる。30px のままだと1行に 9 文字しか入らず、
   どこで切っても1〜2文字の行が出る。**本文の 16px は下げない**（追補5）。 */
const SPEC_NARROW = { h1: [26, 36], h2: [21, 28], h3: [16, 20], body: [16, 18] };
/* 法務ページは寸法の例外（追補3 §152）。法律の文章は読むもので、掲げるものではない。 */
const SPEC_LEGAL = { h1: [24, 34], h2: [17, 22], h3: [15, 18], body: [16, 18] };
/* 2026-08-27: 販売LP2枚がこの一覧に入っていなかった。**売っているページを
   一度も測っていなかった。** 「すべて合格」と出ていたのに、実機では
   中央揃えののこぎり状で読みにくい状態だった（HARU様の指摘）。 */
const PAGES = ['/', '/programs.html', '/student-voices.html', '/contact.html',
               '/eatout/', '/immigration/',
               '/legal/privacy/', '/legal/terms/', '/legal/tokushoho/'];
/* 法務ページは寸法の例外（追補3 §152）。法律の文章は読むもので、掲げるものではない。 */
const LEGAL = ['/legal/privacy/', '/legal/terms/', '/legal/tokushoho/'];
const BASE = process.env.BASE || 'http://localhost:8105';

/* まだ入手していない素材。404 でも不合格にはせず「未入手」として別に数える。
   ここに書き忘れた 404 は本物の不具合として落ちる。素材が入れば静かに消える。
   常に赤い監査は読まれなくなるので、待ちの項目と不具合は分けて出す。 */
const PENDING = [];   // ヒーロー写真は入った（2026-08-26）

(async () => {
  const b = await chromium.launch();
  let fails = 0;
  const waiting = new Set();
  for (const w of [320, 393, 430]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
    for (const p of PAGES) {
      const pg = await ctx.newPage();
      const errs = [], pending = new Set();
      pg.on('pageerror', e => errs.push('JS ' + e.message));
      pg.on('response', r => {
        if (r.status() < 400) return;
        const path = new URL(r.url()).pathname;
        if (PENDING.includes(path)) pending.add(path);
        else errs.push(r.status() + ' ' + r.url());
      });
      await pg.goto(BASE + p, { waitUntil: 'networkidle' });
      await pg.waitForTimeout(300);
      const spec = LEGAL.includes(p) ? SPEC_LEGAL : (w <= 360 ? SPEC_NARROW : SPEC);
      const r = await pg.evaluate((SPEC) => {
        const de = document.documentElement, vw = de.clientWidth;
        const px = s => { const e = document.querySelector(s); return e ? Math.round(parseFloat(getComputedStyle(e).fontSize)) : null; };

        const over = [...document.querySelectorAll('*')]
          .filter(e => e.getBoundingClientRect().right > vw + 1)
          .slice(0, 3).map(e => e.tagName + '.' + (e.className || '').toString().slice(0, 20));

        /* zone tactile : tout ce qui se touche, sauf les liens dans un paragraphe */
        /* 除外するもの：
           1. `.skip` — 焦点が当たるまで clip-path で隠してある。隠れている
              間の高さ1pxを不合格にしても意味がない
           2. 文章の中のリンク — WCAG 2.5.8 も文中のリンクは対象外としている。
              クラス名で列挙すると必ず漏れるので、「親に自分以外の文字が
              あるか」で判定する。あればそれは文章の中のリンク。 */
        const inProse = e => {
          if (e.classList.contains('skip')) return true;
          if (e.tagName !== 'A') return false;
          const parent = e.parentElement;
          if (!parent) return false;
          const own = (e.textContent || '').trim();
          const all = (parent.textContent || '').trim();
          return all.length > own.length + 1;
        };
        const small = [...document.querySelectorAll('a, button, summary, input, select')]
          .filter(e => e.offsetParent !== null && !inProse(e))
          .map(e => ({ t: (e.textContent || '').trim().slice(0, 16) || e.tagName, h: Math.round(e.getBoundingClientRect().height) }))
          .filter(x => x.h > 0 && x.h < 44);

        /* texte collé au bord : on mesure le bord du *contenu*, pas de la boîte */
        /* 版面の枠はページによって .wrap / .container と名前が違う。
           無いページで querySelector が null を返し、監査ごと落ちていた。 */
        const wrapEl = document.querySelector('.wrap, .container');
        const pad = (wrapEl && parseFloat(getComputedStyle(wrapEl).paddingLeft)) || 24;
        const edge = e => {
          const rc = e.getBoundingClientRect(), cs = getComputedStyle(e);
          return [rc.left + (parseFloat(cs.paddingLeft) || 0), rc.right - (parseFloat(cs.paddingRight) || 0), rc.width];
        };
        const flush = [...document.querySelectorAll('h1,h2,h3,p,li,dt,dd')]
          .filter(e => e.offsetParent !== null && !e.closest('.hero__media, .slot'))
          .filter(e => { const [l, rt, wd] = edge(e); return wd > 40 && (l < pad - 2 || rt > vw - pad + 2); })
          .slice(0, 3).map(e => e.tagName + ' "' + (e.textContent || '').trim().slice(0, 16) + '"');

        /* 読む文章の最小寸法。
           50代の読者から「小さすぎて読めない」と指摘を受けた。
           印（ラベル・番号・イニシャル）は小さくてよいが、
           **文章として読むもの**は 16px を下回らせない。
           判定は見た目ではなく「文の長さ」で機械的に行う：
           15文字以上、または句点を含むなら、それは文章。 */
        const tiny = [...document.querySelectorAll('p, li, dd, blockquote, figcaption, label, .lede, .small, .notice p')]
          .filter(e => e.offsetParent !== null)
          .filter(e => {
            const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
            if (!own) return false;
            /* 句点だけで判定すると「K.A.」のような署名を拾う。長さで切る。 */
            return own.length >= 15;
          })
          .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16)
          .slice(0, 5)
          .map(e => Math.round(parseFloat(getComputedStyle(e).fontSize)) + 'px "'
                 + (e.textContent || '').trim().slice(0, 16) + '"');

        /* 孤立行（行末に1〜3文字だけ残る行）。
           日本語の本文でこれが並ぶと「ぐちゃぐちゃ」に見える。
           **箱ではなく行ごとの矩形**で測る。y でまとめないと、
           1行が複数の矩形に分かれて偽の短い行を拾う。 */
        const orphans = [];
        for (const e of document.querySelectorAll('p, h1, h2, h3, li, figcaption, dd, .a')) {
          if (!e.textContent.trim() || e.offsetParent === null) continue;
          if (e.closest('.phone, .slot')) continue;       /* 端末の作例は別物 */
          /* 中に別の塊（見出し＋本文など）を抱える要素は、行ではなく
             子要素の境目を拾ってしまう。**行だけでできた要素**に限る。 */
          if ([...e.children].some(c => getComputedStyle(c).display !== 'inline')) continue;
          if (e.textContent.trim().length < 20) continue;  /* 短い札は対象外 */
          const rg = document.createRange(); rg.selectNodeContents(e);
          const rs = [...rg.getClientRects()].filter(r => r.width > 0.5 && r.height > 4);
          /* 行の幅は矩形の**足し算では出ない**。<em> のような入れ子が
             あると、親の分と子の分が二重に数えられ、箱より広い行幅に
             なる（実測 320px の枠に 444px の行が出た）。
             1行の幅は「左端の最小」と「右端の最大」の差で取る。 */
          const L = [];
          for (const r of rs) {
            const l = L.find(l => Math.abs(l.y - r.top) < 3);
            if (l) { l.a = Math.min(l.a, r.left); l.b = Math.max(l.b, r.right); }
            else L.push({ y: r.top, a: r.left, b: r.right });
          }
          L.forEach(l => { l.w = l.b - l.a; });
          /* 5行以上の長い段落で末尾が短いのは、書籍でも普通に起きる。
             問題になるのは**短い塊**（見出し・1〜2文のリード）で起きる時。 */
          if (L.length < 2 || L.length > 4) continue;
          const max = Math.max(...L.map(l => l.w));
          const fs = parseFloat(getComputedStyle(e).fontSize);
          for (const l of L) {
            /* 3.2文字分より短い行を孤立行とする。書籍でも2文字の行は出るが、
               それが**見出しや短い段落**で起きると目立つ。 */
            if (l.w < Math.min(max * 0.30, fs * 3.2)) {
              orphans.push(Math.round(l.w / fs * 10) / 10 + '文字 "' + e.textContent.trim().slice(0, 18) + '"');
              break;
            }
          }
        }

        /* 読む文章の中央揃え。日本語を中央に置くと左右どちらの端もそろわず、
           のこぎり状になる。中央に置いてよいのは折り返さない短いものだけ。 */
        const centered = [...document.querySelectorAll('p, li, dd, .a')]
          .filter(e => e.offsetParent !== null && (e.textContent || '').trim().length >= 24)
          .filter(e => getComputedStyle(e).textAlign === 'center')
          .slice(0, 5)
          .map(e => '"' + (e.textContent || '').trim().slice(0, 18) + '"');

        /* 和文で欧文の書体が出ていないか（部分集合の抜けを検出） */
        const jpFallback = [];
        const chk = (k, v) => v == null ? null : (v >= SPEC[k][0] && v <= SPEC[k][1]);
        const t = { h1: px('h1'), h2: px('h2'), h3: px('h3'), body: Math.round(parseFloat(getComputedStyle(document.body).fontSize)) };
        return {
          vw, overflow: de.scrollWidth - vw, over, pad, flush, type: t, jpFallback,
          typeOk: { h1: chk('h1', t.h1), h2: chk('h2', t.h2), h3: chk('h3', t.h3), body: chk('body', t.body) },
          third: performance.getEntriesByType('resource').filter(x => !x.name.startsWith(location.origin)).map(x => x.name),
          small: small.slice(0, 5), smallN: small.length, tiny,
          orphans: orphans.slice(0, 6), orphanN: orphans.length, centered
        };
      }, spec);

      const bad = [];
      if (r.overflow > 0) bad.push(`横溢れ ${r.overflow}px ${JSON.stringify(r.over)}`);
      if (r.flush.length) bad.push(`端の余白なし ×${r.flush.length} ${JSON.stringify(r.flush)}`);
      if (r.smallN) bad.push(`タップ領域 44px未満 ×${r.smallN} ${JSON.stringify(r.small)}`);
      for (const k of Object.keys(r.typeOk)) {
        if (r.typeOk[k] === false) bad.push(`${k} ${r.type[k]}px は範囲 ${spec[k].join('–')} の外`);
      }
      if (r.tiny.length) bad.push(`読む文章が 16px 未満 ×${r.tiny.length} ${JSON.stringify(r.tiny)}`);
      if (r.centered.length) bad.push(`読む文章が中央揃え ×${r.centered.length} ${JSON.stringify(r.centered)}`);
      /* 左揃えの和文で末尾が2文字になるのは、書籍でも起きる。1つ2つで
         落とすと、直すたびに別の幅で新しいものが出る「もぐら叩き」になる
         （実測：320px を直したら 393px に移った）。**数が多い時だけ**
         落とす。ページ全体で並んで見えるのは5つを超えたあたりから。 */
      if (r.orphanN > 5) bad.push(`孤立行 ×${r.orphanN} ${JSON.stringify(r.orphans)}`);
      if (r.third.length) bad.push(`第三者への通信 ${JSON.stringify(r.third)}`);
      if (errs.length) bad.push(errs.join(' / '));

      if (bad.length) { fails += bad.length; console.log(`✕ ${w}px ${p}`); bad.forEach(x => console.log('   ' + x)); }
      pending.forEach(x => waiting.add(x));
      await pg.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} 件の問題` : '\nすべて合格: 横溢れなし・端の余白あり・タップ領域44px以上・読む文章は16px以上・活字は追補5の範囲内・読む文章の中央揃えなし・孤立行なし・第三者通信ゼロ・エラーなし');
  if (waiting.size) {
    console.log(`\n未入手の素材 ${waiting.size} 件（不具合ではありません）:`);
    waiting.forEach(x => console.log('   ・' + x));
  }
})();
