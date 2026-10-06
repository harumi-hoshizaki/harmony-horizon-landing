// EAR TO VOICE — Talk to a Visitor
// 「1つ終えた」瞬間のお祝い（Harumi指示 2026-09-01「まず、紙吹雪をPopの
// 実装をお願いします」）。
//
// ★いつ出すか — ここが一番大事な決めごと。
//   **2026-09-06 改訂: レッスン1本(＝練習を1回やり切るたび)。**
//   Harumi指示「レッスン1本ごとにして、**ここで1日の課題を終わらせる感じ**に
//   したほうがいい。**量が多すぎるのを避けるため**」。
//   紙吹雪は「よくできた・今日はここまででいい」の合図で、すぐ下に出る
//   「今日の分は、ここまでです。」(切れ目)と組で働く —— だから
//   **利用者が1回やり切った所すべて**で出す:
//     ・レッスンの完了画面(js/lesson.js)
//     ・聞き返すの完了画面(js/phraseBank.js)
//     ・相槌ドリルの完了画面(js/reactionDrill.js)
//   ※相槌②(「聞いて、言う」。3段の2段目)だけは出さない —— そこは
//     まだ区切りではないので、切れ目(stopToday)と同じ条件で揃えている。
//   旧: 2026-09-01「モジュールを1つ終えた時（レッスン1本ごとではなく。
//   毎回だと『またか』になります）」——1つの行に4〜8本あるため
//   **4〜8本に1回**しか出ず、1日の区切りとして働いていなかった。
//   上の指示で撤回済み。**モジュール単位に戻さないこと。**
//
// 演出は Home の「Welcome back!」(js/welcomeBack.js)と**同じ紙吹雪**を使う。
// 新しい色・新しい部品は足していない。効果音も既にある se_celebrate だけ。
// ★2026-09-06 例外: `grand`(全38レッスン完了の1回だけ)に限り、
// 左右下端からのクラッカーの束と、勝利のファンファーレ(se_victory.mp3)を
// 足した(Harumi指示「このページに限って」)。CLAUDE.mdの当該ルール参照——
// **この1画面だけの、意図して決めた例外**。他の完了画面(相槌ドリル等)へ
// 広げないこと。

import { h } from './ui.js';
import { playSe } from './audio.js';

const RAINBOW = ['#FF5A5F', '#FF9F45', '#FFD23F', '#5CD65C', '#3FA9F5', '#7B61FF', '#FF6FB5'];
// ★2026-09-06 Harumi報告「紙吹雪が最後まで落ちずに途中で急に消えます」。
// 真因: 落下の物理(tick)は**フレーム数**で進むのに、消すタイマーは
// **壁時計のミリ秒**(setTimeout)で動いていた。60fpsなら130フレーム≒2.17秒で
// 一致するが、端末が重い/バックグラウンドから戻った直後などで
// requestAnimationFrameが60fpsより遅く刻まれると、実際にはまだ130フレーム分
// 落ちきっていないのに壁時計の2.3秒が先に来てstopCelebrate()が呼ばれ、
// 途中で消えていた。
// → tickを実経過時間(performance.nowの差)で進める形に変え、**アニメーション
// 自身が終わった時にだけ**消す(固定のsetTimeoutで消さない)。フレームレートが
// 何であれ、実時間で同じ長さ落ちてから消える。`js/welcomeBack.js`の
// 紙吹雪も同じ作りだったので、こちらも同じ形に直した
// (「同じ仕事をする画面は、必ず一緒に直す」)。
const FRAME_MS = 1000 / 60; // 元の「1フレームあたり」の値をそのまま使うための基準
const SAFETY_MS = 6000; // 万一tickが終わらない時だけの保険(通常はこの前にonDoneが消す)

let playing = false;
let activeOverlay = null;
let activeTimer = null;
let activeStop = null;

// 画面が変わったら即座に消す（js/app.js から呼ぶ。position:fixed の
// オーバーレイはルーターの外にあるので、次の画面にも被って見えてしまう
// —— welcomeBack.js と同じ理由・同じ対処）。
export function stopCelebrate() {
  if (!playing) return;
  clearTimeout(activeTimer);
  if (activeStop) activeStop();
  if (activeOverlay) activeOverlay.remove();
  activeOverlay = null;
  activeStop = null;
  playing = false;
}

// onDone: 全パーツが寿命(maxLife)に達し、これ以上描く物が無くなった
// **実際の瞬間**に呼ばれる(呼び出し側が別に用意した固定タイマーではなく、
// アニメーション自身が「終わった」と申告する)。
// ★2026-09-06 grand: 全38レッスンを終えた、その1回だけの盛大な演出
// (Harumi指示「もっと盛大に祝って」)。新しい色・部品は足さない ——
// 同じ紙吹雪の**粒の数と落ちている時間**を増やすだけ。
// ★2026-09-06 追記: 同じ`grand`に、左下・右下から上がる「クラッカー」の
// 束を足した(Harumi指示「このページに限って、左下と右下からクラッカーが
// 上がる演出を」)。**このページ(全レッスン完了)専用の演出**であることは
// 既存の`grand`フラグ1つでそのまま担保される(見た目の文法冒頭「一度きりの
// 例外」参照)——新しいフラグ・新しい関数は作らず、同じ`particles`配列に
// 出どころの違う粒を混ぜるだけ。色・形(角丸の小さな長方形)はRAINBOW/
// 描画コードをそのまま使い回す。
function runConfetti(canvas, onDone, grand) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const COUNT = grand ? 140 : 52;
  const MAX_LIFE = grand ? 190 : 130;
  const particles = [];
  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 1.2,
      vy: 1.4 + Math.random() * 1.6,
      g: 0.05,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      size: 5 + Math.random() * 5,
      color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)],
      life: 0,
      maxLife: MAX_LIFE,
    });
  }

  // クラッカー(左下・右下から上へ弾ける束)。grand の時だけ、上から降る
  // 粒に**足して**出す(置き換えない)。重力(g)は既存の粒より少し強く
  // して、勢いよく上がってから弧を描いて落ちる「ポン」の形にする。
  if (grand) {
    const CORNER_COUNT = 45;
    const CORNER_MAX_LIFE = 150;
    [
      { x: -10, sign: 1 }, // 左下 → 右上向きに弾ける
      { x: canvas.width + 10, sign: -1 }, // 右下 → 左上向きに弾ける
    ].forEach(({ x, sign }) => {
      for (let i = 0; i < CORNER_COUNT; i++) {
        const spread = Math.random() * 0.9 + 0.15; // 弾ける角度のばらつき
        particles.push({
          x,
          y: canvas.height + 10,
          vx: sign * (2.2 + Math.random() * 2.6),
          vy: -(6.5 + Math.random() * 3.5) * spread - 1.5,
          g: 0.09,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.35,
          size: 5 + Math.random() * 5,
          color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)],
          life: 0,
          maxLife: CORNER_MAX_LIFE,
        });
      }
    });
  }

  let rafId;
  let lastNow = null;
  function tick(now) {
    if (lastNow === null) lastNow = now;
    let dtMs = now - lastNow;
    lastNow = now;
    // タブがバックグラウンドから戻った直後などの巨大な差は頭打ちにする
    // (でないと一気に進みすぎたり、物理が破綻したりする)。
    if (dtMs > 100) dtMs = 100;
    // 実経過時間を「60fps換算の何フレーム分か」に変換する。フレームレートが
    // 60より低くても高くても、life は常に実時間で同じ速さで進む。
    const frames = dtMs / FRAME_MS;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach((p) => {
      if (p.life >= p.maxLife) return;
      alive = true;
      p.life += frames;
      p.vy += p.g * frames;
      p.x += p.vx * frames;
      p.y += p.vy * frames;
      p.rot += p.vr * frames;
      const fadeStart = p.maxLife * 0.75;
      const alpha = p.life > fadeStart ? Math.max(0, 1 - (p.life - fadeStart) / (p.maxLife - fadeStart)) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3.4, p.size, p.size / 1.7);
      ctx.restore();
    });
    if (alive) {
      rafId = requestAnimationFrame(tick);
    } else if (onDone) {
      onDone();
    }
  }
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

// 文言は Eatout と同じ「Congratulations!」に揃える(Harumi「EATOUT参照」)。
// Home の「Welcome back!」も英語なので、この種のオーバーレイは英語で統一。
// grand: 全38レッスンを終えた1回だけの盛大な演出(js/lesson.js参照)。
// 文言・色・音は変えない —— 粒の数と落ちている時間だけを増やす。
/* text … 画面いっぱいに出す言葉。既定は完了画面の「Congratulations!」。
   ★2026-09-25 `null` を渡すと**文字を出さず、紙吹雪だけ**にする
   (はじめの案内の⑥「さぁ、始めよう！」。あの画面は完了のお祝いでは
   なく、見出しが既にその役目を持っているので、同じ言葉を2つ並べない)。
   紙吹雪・効果音・寿命の仕組みは1つも変えていない。 */
export function playCelebrate({ grand = false, text = 'Congratulations!' } = {}) {
  if (playing) return;
  playing = true;

  const canvas = h('canvas', { class: 'wb-canvas' });
  const scrim = h('div', { class: text ? 'wb-scrim' : 'wb-scrim is-clear' }, text ? [h('div', { class: 'wb-text celebrate-text', text })] : []);
  const overlay = h('div', { class: 'wb-overlay', 'aria-hidden': 'true' }, [canvas, scrim]);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  // 効果音は既にある「できた」の音だけ。新しい音は足さない
  // (CLAUDE.md「効果音は…音は増やさない」)。
  playSe('audio/se_celebrate.mp3');
  // ★2026-09-06 grand の時だけ、勝利のファンファーレを**重ねて**鳴らす
  // (Harumi指示「トランペットの音でビクトリーを思い浮かぶ効果音を」)。
  // 実機のトランペット録音は用意できない(ElevenLabsは音声合成のみで、
  // このアプリに音楽・効果音を作る道具は無い)ので、短い上昇音形
  // (ド→ミ→ソ→高いド、倍音を重ねたシンセ音)で代用してある——
  // 「勝利のファンファーレ」を思わせる近似で、本物のトランペットの
  // 録音ではないことを申し送る。既存の playSe をそのまま使うので、
  // 新しいAudioContext・新しい再生経路は1つも足していない
  // (audio.jsの寿命管理には触れない)。
  if (grand) playSe('audio/se_victory.mp3');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    scrim.classList.add('is-static');
    activeTimer = setTimeout(stopCelebrate, 900);
    return;
  }

  scrim.classList.add('is-playing');
  // 消すのは**アニメーションが実際に終わった時**(onDone = stopCelebrate)。
  // SAFETY_MSは、何らかの理由でtickが終わらなかった時だけの保険
  // (通常はonDoneの方が先に呼ばれ、この保険には届かない)。
  activeStop = runConfetti(canvas, stopCelebrate, grand);
  activeTimer = setTimeout(stopCelebrate, SAFETY_MS);
}
