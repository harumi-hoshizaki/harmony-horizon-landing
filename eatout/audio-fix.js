/* ══════════════════════════════════════════════════════════════
   iPhoneで音が受話口（耳に当てる小さい方）から出るのを防ぐ。
   2026-08-21

   Harumi実機報告: 「携帯で見るとクイズの音が通話口から出る方がいます。
   iPhone chromeです。」

   ── なぜ起きるか ──────────────────────────────────
   iOSは、音を鳴らす前に「これは再生用です」と宣言しないと、音声
   セッションを通話向けの扱いのままにすることがある。その状態で
   HTMLAudioを鳴らすと、スピーカーではなく受話口へ回る。

   どちらに回るかは端末の直前の状態で決まる（直前の通話、Bluetooth
   の抜き差し、別タブでのマイク使用、iOSの版）。だから「出る人と
   出ない人がいる」という報告になる。

   ── なぜこのファイルがあるか ────────────────────────
   この手当ては3つのアプリ本体には入っていた。入っていなかったのは
   広告用に新しく作ったこの2ページ（クイズとLP）だけ。

   docs/audio-solutions.md には、同じ抜けが過去に2回起きたと書いてある。

     2026-08-11 self-expression だけ抜けていた
       →「新しいアプリを足す時は、この文書の項目を1つずつ突き合わせること」
     2026-08-12 今度は飲食店アプリに丸ごと無かった
       →「上の一文を書いた翌日に、その一文が言っていた通りのことが起きている」

   そして2026-08-21、その警告の次に作ったページで3回目が起きた。
   だから今度は文書ではなくファイルにする。新しいページを作る人は、
   このファイルを1行読み込むだけでよく、中身を知らなくても抜けない。

     <script src="../audio-fix.js"></script>
     ...
     eatoutPlay(new Audio(src));

   中身の理屈は harmony-horizon/docs/audio-solutions.md の §A-1b / §A-1c。
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── §A-1b iOSに「これは再生です」と宣言する ──────────────
     鳴らすたびに呼ぶ。1回だけでは、間に他の音が入ると戻ってしまう。 */
  function ensurePlayback() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* 対応していないブラウザでは何もしない */ }
  }
  window.eatoutEnsurePlayback = ensurePlayback;

  /* ── §A-1c それでも回る端末向け: 一度鳴らして、鳴らし直す ──
     宣言だけでは直らないiOSの版がある（navigator.audioSession が
     効くのは新しいiOSだけ）。出力先が決まるのは play() を呼んだ瞬間
     なので、巻き戻すだけでは駄目で、いったん止めて play() をもう一度
     呼ぶ必要がある。

     40msという数字はHarumiの実機報告で決まっている。最初160msにして
     いたら「G, Good と2度聞こえる」と報告があった。人が音の始まりを
     音節として聞き分けるのは40〜60msからなので、160msは語頭の子音が
     まるごと通る長さだった。0にはしない — セッションが動き出す前に
     止めると、2回目がまた「1回目」扱いになって受話口へ戻る恐れがある。 */
  var KICK_MS = 40;

  /* 「そのセッションで最初の1音」を鳴らし直す。最初から立てておくのが
     肝心。入国審査アプリでは、この印をガイドの開始/終了時にしか立てて
     いなかったため、ガイドを見終わった2回目以降の訪問では印が一度も
     立たず、最初の1音が受話口の経路のまま確定していた。 */
  var kickNext = true;
  window.eatoutMarkRouteKick = function () { kickNext = true; };

  /* 速さを変えた時も鳴らし直す。playbackRate をいじると出力先が決め直
     されるので、何音目であっても回る可能性がある（本体の
     `if (lastPlayPath === 'web' || rate !== 1)` と同じ判断）。 */
  window.eatoutPlay = function (audio, opts) {
    opts = opts || {};
    ensurePlayback();

    if (opts.rate && opts.rate !== 1) {
      try { audio.preservesPitch = true; audio.webkitPreservesPitch = true; } catch (e) {}
      try { audio.playbackRate = opts.rate; } catch (e) {}
      kickNext = true;
    }

    var kick = kickNext;
    kickNext = false;

    var p;
    try { p = audio.play(); } catch (e) { if (opts.onFail) opts.onFail(); return; }

    /* 成功側と失敗側は必ず1つの then() にまとめる。then(f) と catch(g) を
       別々に繋ぐと、then(f) が返す2つ目のPromiseに受け手がいないまま
       残り、再生が失敗した時に「未処理のPromise拒否」がコンソールに出る。 */
    if (p && p.then) {
      p.then(function () {
        if (!kick) return;
        setTimeout(function () {
          /* もう聞き終わっている / 別の音に切り替わっている時は何もしない */
          if (audio.ended || audio.paused) return;
          if (opts.isCurrent && !opts.isCurrent()) return;
          try {
            audio.pause();
            audio.currentTime = 0;
            var again = audio.play();
            if (again && again['catch']) again['catch'](function () {});
          } catch (e) {}
        }, KICK_MS);
      }, function () {
        if (opts.onFail) opts.onFail();
      });
    }
  };

  /* ページに戻ってきた時は、間に何があったか分からないので鳴らし直す
     ことにする（別アプリで通話していた、など）。 */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { ensurePlayback(); kickNext = true; }
  });

  ensurePlayback();
})();
