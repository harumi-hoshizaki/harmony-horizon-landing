// Speak Up 聞き取りクイズ(/speakup/quiz/)。
//
// ★新しい部品を1つも作っていない(HARU様の指示 2026-10-05「何も新しく作らない。
//   同じフォント・同じ余白・同じ全部。発音・つながる音のルールは自分のデータベースから」)。
//   見た目も部品も、本体(harmonyhorizon.foreigners/speakup)の ui.js / audio.js /
//   copy.js / main.css をそのまま写した lib/ から呼ぶだけ。
//   英文・和訳・「こう聞こえます」・「なぜ聞き取れない？」・数字は、quiz-data.json
//   (本体の data/scenarios/*.json から tools/build-speakup-quiz.py が機械で作った物)
//   から出す。このファイルに、解説の文は1行も書いていない。
import {
  h, clear, renderScreenHead, primaryButton, navRow, audioButton,
  collapsibleVoiceSpeedControls, radioMark, tipAccordion, markedLead, sceneImage,
} from './lib/js/ui.js';
import { AudioCue, playOrPause, playSe } from './lib/js/audio.js';
import { playerState } from './lib/js/playerState.js';
import { playCelebrate, stopCelebrate } from './lib/js/celebrate.js';

const TOTAL = 4;
/* 3つの選択肢は「正解」ではなく自己診断(HARU様 2026-10-06「日本語の三択は想像がつくので、
   聞き取れた？だけでいい」)。0 = すぐ分かった / 1 = 音だけ / 2 = まったく分からない。 */
const CHOICES = [
  '聞き取れた',
  '音だけ聞こえた',
  '分からない',
];
/* 答えへの返事。[見出し(大きく), 説明(本文)]。枠も背景もつけない(箱は注意書きの部品なので)。 */
const REACTIONS = [
  ['聞き取れましたね。', 'この音の決まりを知ると、\nもっと楽になります。'],
  ['音は聞こえても、\n意味が追いつかない。', 'それは、よくあることです。'],
  ['聞き取れなくて、当然です。', ''],
];

const app = document.getElementById('app');
const headEl = document.createElement('div');
headEl.className = 'topbar';
const host = document.createElement('main');
host.className = 'screen-host';
app.appendChild(headEl);
app.appendChild(host);

// 声は、まだ選んでいない人は女性から(男性の声は部屋の響きが気になる録音があるため)。
// 選んだ声は本体と同じ仕組みで覚える(playerState)。
try { if (!localStorage.getItem('etv.talk.voice')) playerState.voice = 'f'; } catch (_) { playerState.voice = 'f'; }

/* 場面の写真+場面の文(本体の .scene-block と同じ組み方: 写真と文は12pxの1つの塊)。 */
function sceneBlock(img, situation) {
  return h('div', { class: 'scene-block' }, [
    sceneImage({ src: img, situation }),
    h('p', { class: 'body-text situation-line', text: situation }),
  ]);
}

let DATA = null;
// 苦手な音の「例」。クイズの文の解説(データベース由来)から、その音の最初の引用を取る。
// 例: 【母音ドッキング】"Have you ever" は…「へぁvゅえvぁ」 → 「Have you ever → へぁvゅえvぁ」
// その解説の最後の(3文字以上の)「」が聞こえ方。無ければ引用だけ。新しく文を書かない。
function exampleOf(label) {
  for (const q of DATA.questions) {
    const m = q.why.match(new RegExp('【' + label.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '】([^【]*)'));
    if (!m) continue;
    const phrase = (m[1].match(/"([^"]+)"/) || [])[1];
    if (!phrase) continue;
    // 聞こえ方は3文字以上の「」(「い」「ら行」のような短い説明語は除く)
    const heards = [...m[1].matchAll(/「([^」]{3,})」/g)];
    const heard = heards.length ? heards[heards.length - 1][1] : '';
    return heard ? phrase + ' → ' + heard : phrase;
  }
  return '';
}

const state = { answers: [], cues: {}, weak: [] };
const source = new URLSearchParams(location.search).get('v') || '';

/* 声(男性/女性)は本体と同じ決め方: f → partner-f / m → partner。ゆっくりは
   audio.js が焼いた _slow.mp3 を探して等速で鳴らす(§A-2)。 */
function cueFor(q) {
  if (!state.cues[q.id]) {
    state.cues[q.id] = new AudioCue(() =>
      `audio/${playerState.voice === 'f' ? 'partner-f' : 'partner'}/${q.id}.mp3`);
  }
  return state.cues[q.id];
}

function screen(headOpts) {
  renderScreenHead(headEl, { onHomeClick: () => show('start'), ...headOpts });
  clear(host);
  const body = document.createElement('div');
  body.className = 'screen-body';
  host.appendChild(body);
  window.scrollTo(0, 0);
  stopCelebrate();
  return body;
}

/* ---------- はじめに(Welcome) ----------
   LP(/speakup/)のヒーローと同じ写真(京都の路地で、日本人の女性が外国人の男性と話している)。
   「やらなきゃ損」に変わる材料は、ここで全部見せる: ①自分ごと(知っている単語なのに)
   ②具体的な約束(何がわかるか) ③低い負担(4問・無料・メール登録なしで結果が見られる)。
   数字や実績は、データにないものは書かない。 */
function showStart() {
  const body = screen({ brandLockup: true });
  const photo = h('div', { class: 'scene-holder' }, [
    h('picture', {}, [
      h('source', { srcset: '/assets/site/scene-kyoto-street.webp', type: 'image/webp' }),
      h('img', { class: 'scene-image', src: '/assets/site/scene-kyoto-street.jpg',
        alt: '京都の路地で、日本人の女性が外国人の男性と話しています。' }),
    ]),
  ]);
  body.appendChild(photo);
  body.appendChild(h('h2', { class: 'screen-title', text: '知っている単語なのに、\n聞き取れない理由。' }));
  body.appendChild(markedLead('あなたの耳が{{聞き逃す音}}を、\n実際の音声で確かめます。', 'body-text'));
  // ボタンは最初の一画面に入れる(LP の決まり: 393×659 で下端が画面に収まる)。
  body.appendChild(h('div', { class: 'next-block' }, [
    primaryButton('クイズをはじめる', () => show(0)),
    h('p', { class: 'muted-text quiz-fine', text: '全4問・約3分・無料\n登録なしで、結果が見られます。' }),
  ]));
}

/* ---------- 1問 ---------- */
function showQuestion(i) {
  const q = DATA.questions[i];
  const body = screen({ eyebrow: '聞き取りクイズ', progress: { current: i + 1, total: TOTAL } });
  const answered = state.answers[i] !== undefined;
  const cue = cueFor(q);

  body.appendChild(sceneBlock(q.image, q.situation));
  body.appendChild(h('h2', { class: 'screen-title', text: '聞き取れた？' }));
  body.appendChild(h('p', { class: 'body-text', text: '音声を聞いて、\n近いものを選んでください。' }));
  // 声・速さは、最初に鳴る物(▶)のすぐ上(本体 CLAUDE.md「声・速さの置き場所は1つの決まりだけ」)。
  body.appendChild(collapsibleVoiceSpeedControls());
  const topPlay = audioButton({
    label: 'この音声を聞く',
    onClick: (btn) => playOrPause(cue, { rate: playerState.rate, btn }),
  });
  body.appendChild(topPlay);

  const reveal = h('div', { class: 'quiz-reveal', hidden: !answered });
  const nav = navRow({
    onBack: () => show(i === 0 ? 'start' : i - 1),
    onNext: () => show(i === TOTAL - 1 ? 'result' : i + 1),
    nextLabel: i === TOTAL - 1 ? '結果を見る ＞' : undefined,
    nextDisabled: !answered,
  });
  const nextBtn = nav.lastElementChild;

  const ul = h('ul', { class: 'options' });
  const buttons = CHOICES.map((label, k) => {
    const b = h('button', { class: 'option', type: 'button', 'aria-pressed': 'false' },
      [radioMark(), h('span', { class: 'option-label', text: label })]);
    ul.appendChild(h('li', {}, [b]));
    b.addEventListener('click', () => {
      if (state.answers[i] !== undefined) return;
      state.answers[i] = k;
      playSe('audio/se_tick.mp3', 0.35);
      mark(k);
      fillReveal();
      reveal.hidden = false;
      nextBtn.disabled = false;
    });
    return b;
  });
  body.appendChild(ul);

  function mark(chosen) {
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === chosen)));
  }
  function fillReveal() {
    clear(reveal);
    // 聞き直しの▶はここだけ(上の▶は答えたら隠す)。
    // 5つの塊は全部32px離す(一言 / もう一度聞く / 決まりの名前 / 英文+和訳 / 理由)。
    // 英文と和訳だけは、1つのフレーズなので12pxでくっつける。
    const [rHead, rSub] = REACTIONS[state.answers[i]];
    reveal.appendChild(h('div', { class: 'reveal-block' }, [
      h('h3', { class: 'group-title', text: rHead }),
      ...(rSub ? [h('p', { class: 'body-text', text: rSub })] : []),
    ]));
    // 聞き直す▶は、その音の英文のすぐ下(英文・和訳と1つの塊)。
    reveal.appendChild(h('div', { class: 'reveal-block' }, [
      h('p', { class: 'phrase-target', text: q.en }),
      h('p', { class: 'body-text', text: q.ja }),
      audioButton({
        label: 'もう一度聞く',
        onClick: (btn) => playOrPause(cue, { rate: playerState.rate, btn }),
      }),
    ]));
    // 決まりは、1つの問題に複数あることが多い。説明の【ラベル】を全部並べる(1つだけ言うと、ほかの原因を無視することになる)。
    const labels = labelsOf(q);
    reveal.appendChild(h('div', { class: 'reveal-block' }, [
      h('h3', { class: 'group-title', text: '聞き取れない理由' }),
      h('div', { class: 'quiz-labels' }, labels.map((l) => h('span', { class: 'tip-listen-label', text: l }))),
    ]));
    const stack = tipAccordion({ listening: { heard: q.heard, why: q.why } }, ['listening']);
    reveal.appendChild(stack);
    const toggle = stack.querySelector('.tip-toggle');
    if (toggle) toggle.click(); // 説明がこのクイズの主役なので、開いたまま見せる
    topPlay.hidden = true; // ▶が2つ並ばないように、答えたら上の▶は隠す
  }
  if (answered) {
    mark(state.answers[i]);
    fillReveal();
  }
  body.appendChild(reveal);
  body.appendChild(nav);
}

/* 1つの文にある理由(説明の【ラベル】)を、重複なしで全部返す。 */
function labelsOf(q) {
  return [...new Set([...q.why.matchAll(/【([^】]+)】/g)].map((m) => m[1]))];
}

/* ---------- 結果 ---------- */
function showResult() {
  const qs = DATA.questions;
  const idx = (list) => qs.map((q, i) => [q, i]).filter(([, i]) => list(state.answers[i]));
  const caughtQ = idx((a) => a === 0);
  const missedQ = idx((a) => a !== 0);
  const caught = caughtQ.map(([q]) => q);
  const missed = missedQ.map(([q]) => q);
  const score = caught.length;
  const st = DATA.stats;
  const body = screen({ eyebrow: '結果' });
  body.appendChild(h('h2', { class: 'screen-title', text: missed.length ? '聞き取れなかった文と、\n考えられる理由。' : '4問とも、\nすぐ聞き取れました。' }));
  if (missed.length) {
    // 診断は「文」単位。1つの文には理由が複数あり、どれが原因かは本人にしか分からないので、
    // 「特に多い理由」のような決めつけは書かない(事実だけ: 何問聞き取れなかったか)。
    body.appendChild(markedLead(`今回は{{${missed.length}つ}}の文が、\n聞き取れませんでした。`, 'body-text'));
    const rows = h('ul', { class: 'tip-listen-list' });
    missedQ.forEach(([q, i]) => {
      rows.appendChild(h('li', { class: 'tip-listen-item' }, [
        h('p', { class: 'tip-listen-text', text: `${i + 1}問目「${q.en}」` }),
        h('div', { class: 'quiz-labels' }, labelsOf(q).map((l) => h('span', { class: 'tip-listen-label', text: l }))),
      ]));
    });
    body.appendChild(h('div', { class: 'answer-group' }, [
      h('h3', { class: 'group-title', text: '聞き取れなかった文' }),
      rows,
    ]));
  }
  if (caught.length) {
    body.appendChild(h('div', { class: 'answer-group' }, [
      h('h3', { class: 'group-title', text: '聞き取れた文' }),
      h('p', { class: 'body-text', text: caughtQ.map(([q, i]) => `${i + 1}問目「${q.en}」`).join('\n') }),
    ]));
  }

  // どの音が苦手か、は本人に選んでもらう(自己診断は「文」までしか分からないので、決めつけない)。
  // 選んだ音は、メールの「あなたの苦手な音は〇〇でしたね」に使う。選ばなくても登録はできる。
  const choices = [...new Set(missed.flatMap(labelsOf))];
  state.weak = [];
  if (choices.length) {
    body.appendChild(h('p', { class: 'body-text', text: '聞き取れないのは、\nあなたの耳のせいでは\nありません。' }));
    const ul = h('ul', { class: 'options' });
    // 複数選べる(◯ではなく☐。本体の「いくつでも選ぶ」と同じ印)。
    const check = () => h('span', { class: 'option-checkbox', 'aria-hidden': 'true' }, [
      h('span', { class: 'option-checkbox-mark', text: '✓' }),
    ]);
    choices.forEach((label) => {
      const b = h('button', { class: 'option is-multi', type: 'button', 'aria-pressed': 'false' },
        [check(), h('span', { class: 'option-label', text: label })]);
      ul.appendChild(h('li', {}, [b]));
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        state.weak = on ? [...state.weak, label] : state.weak.filter((x) => x !== label);
        playSe('audio/se_tick.mp3', 0.35);
      });
    });
    body.appendChild(h('div', { class: 'answer-group' }, [
      h('h3', { class: 'group-title', text: '苦手だった音は、\nどれですか？\n(いくつでも)' }),
      ul,
    ]));
  }

  body.appendChild(newsletterBlock(score, qs));
  body.appendChild(navRow({
    onBack: () => show(TOTAL - 1),
    onNext: () => { state.answers = []; show(0); },
    nextLabel: 'もう一度やる',
    nextClass: 'btn-outline',
  }));
}

function newsletterBlock(score, qs) {
  const nl = DATA.newsletter || {};
    const input = h('input', { class: 'text-input', type: 'email', id: 'quizEmail', name: 'email', autocomplete: 'email', inputmode: 'email', required: 'required' });
  const msg = h('p', { class: 'muted-text', hidden: true });
  const submit = primaryButton('コツをメールで受け取る', onSubmit);
  const form = h('div', { class: 'next-block' }, [
    h('label', { class: 'text-input-label', for: 'quizEmail', text: 'メールアドレス' }),
    input,
    submit,
    msg,
  ]);
  async function onSubmit() {
    const email = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      msg.hidden = false; msg.textContent = 'メールアドレスを確かめてください。'; return;
    }
    if (!nl.endpoint) { msg.hidden = false; msg.textContent = '登録の準備中です。'; return; }
    submit.disabled = true;
    try {
      const fd = new FormData();
      fd.append('fields[email]', email);
      // 苦手な音は、本人が選んだ時だけ送る(複数は「、」でつなぐ)(選ばなかった人に「苦手でしたね」と言わないため)。
      // 苦手な音は、メールの中で繰り返せないので、1つずつ別の欄(quiz_w1〜quiz_w6)に入れる。
      // 「・」は値の頭に付ける。空の欄はメール側で何も出ない(箱が空にならないよう、
      // 何も選ばなかった人の1行目には一文を入れる)。quiz_weak は読点つなぎで残す(絞り込み用)。
      if (state.weak.length) fd.append('fields[quiz_weak]', state.weak.join('、'));
      const weakItems = state.weak.length ? state.weak : ['まだ決まっていません。レッスンの中で、一緒に見つけましょう'];
      weakItems.slice(0, 6).forEach((w, i) => {
        fd.append('fields[quiz_w' + (i + 1) + ']', '・' + w);
        const ex = state.weak.length ? exampleOf(w) : '';
        if (ex) fd.append('fields[quiz_e' + (i + 1) + ']', ex);
      });
      fd.append('ml-submit', '1');
      fd.append('anticsrf', 'true');
      await fetch(nl.endpoint, { method: 'POST', mode: 'no-cors', body: fd });
      // 登録できたら、メール登録の欄(見出し・説明・入力・ボタン・注意書き)を丸ごと入れ替える。
      // 「登録した人の画面」と「まだの人の画面」を、はっきり別物にする(結果メールの箱と同じ淡い金の丸い箱)。
      const group = form.closest('.quiz-signup') || form;
      clear(group);
      group.appendChild(h('div', { class: 'quiz-done' }, [
        h('span', { class: 'quiz-done-mark', 'aria-hidden': 'true', text: '✓' }),
        h('h3', { class: 'group-title', text: '登録ありがとうございます！' }),
        markedLead('{{メール}}を送りました。\n届いたメールを、ご確認ください。', 'body-text'),
      ]));
      playCelebrate({ text: null });
    } catch (e) {
      submit.disabled = false;
      msg.hidden = false; msg.textContent = '送れませんでした。通信を確かめて、もう一度お試しください。';
    }
  }
  return h('div', { class: 'answer-group quiz-signup' }, [
    h('h3', { class: 'group-title', text: '聞き取りのコツを、メールで' }),
    h('p', { class: 'body-text', text: '音のパターンを1つずつ、\n聞き取りのコツといっしょに\n週1回ほどお届けします。' }),
    form,
    h('p', { class: 'muted-text quiz-fine' }, [
      'いつでも配信を止められます。送信すると、',
      h('a', { class: 'btn-link', href: '/legal/privacy/', text: 'プライバシーポリシー' }),
      'に同意したことになります。',
    ]),
  ]);
}

function show(stage) {
  if (stage === 'start') return showStart();
  if (stage === 'result') return showResult();
  return showQuestion(stage);
}

fetch('quiz-data.json').then((r) => r.json()).then((d) => { DATA = d; show('start'); });
