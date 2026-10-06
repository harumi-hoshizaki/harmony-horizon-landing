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

const TOTAL = 4;
/* 3つの選択肢は「正解」ではなく自己診断(HARU様 2026-10-06「日本語の三択は想像がつくので、
   聞き取れた？だけでいい」)。0 = すぐ分かった / 1 = 音だけ / 2 = まったく分からない。 */
const CHOICES = [
  '聞き取れた',
  '音だけ聞こえた',
  '分からない',
];
const REACTIONS = [
  '聞き取れましたね。\nこの音の決まりを知ると、もっと楽になります。',
  '音は聞こえても、意味が追いつかない。\nそれは、よくあることです。',
  '聞き取れなくて、当然です。\n理由は、この音にあります。',
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
const state = { answers: [], cues: {} };
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
    h('p', { class: 'muted-text', text: '全4問・約3分・無料\n登録なしで、結果が見られます。' }),
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
    // 意味のまとまりで差をつける: まとまりの中は12px、まとまりのあいだは32px(.screen-body と同じ)。
    //  ① 答えへの一言 + もう一度聞く(聞き直しはここだけ。上の▶は答えたら隠す)
    //  ② 決まりの名前 + 英文 + 和訳  ③ なぜ聞き取れない？
    reveal.appendChild(h('div', { class: 'reveal-block' }, [
      h('p', { class: 'body-text', text: REACTIONS[state.answers[i]] }),
      audioButton({
        label: 'もう一度聞く',
        onClick: (btn) => playOrPause(cue, { rate: playerState.rate, btn }),
      }),
    ]));
    reveal.appendChild(h('div', { class: 'reveal-block' }, [
      markedLead(`聞こえ方の決まりは、\n{{${q.primary}}}です。`, 'body-text'),
      h('p', { class: 'phrase-target', text: q.en }),
      h('p', { class: 'body-text', text: q.ja }),
    ]));
    const stack = tipAccordion({ listening: { heard: q.heard, why: q.why } }, ['listening']);
    reveal.appendChild(stack);
    const toggle = stack.querySelector('.tip-toggle');
    if (toggle) toggle.click(); // 説明がこのクイズの主役なので、開いたまま見せる
    // 画面が長くなりすぎないよう、理由は1つ目だけ見せ、残りは「ほかの理由」で開く。
    const items = [...stack.querySelectorAll('.tip-listen-item')];
    if (items.length > 1) {
      items.slice(1).forEach((li) => { li.hidden = true; });
      const more = h('button', { class: 'btn-link', type: 'button', text: 'ほかの理由も見る' });
      more.addEventListener('click', () => { items.forEach((li) => { li.hidden = false; }); more.remove(); });
      stack.querySelector('.tip-listen').appendChild(more);
    }
    topPlay.hidden = true; // ▶が2つ並ばないように、答えたら上の▶は隠す
  }
  if (answered) {
    mark(state.answers[i]);
    fillReveal();
  }
  body.appendChild(reveal);
  body.appendChild(nav);
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
  body.appendChild(h('h2', { class: 'screen-title', text: missed.length ? 'あなたの耳が、\n聞き逃した音。' : '4問とも、\nすぐ聞き取れました。' }));
  if (missed.length) {
    // 診断: 聞き逃した音のパターンを数える。同じ型が2回以上なら「特に」と言い切る。
    // 聞こえ方の文は各問でもう見ているので、結果では繰り返さない(型の名前と、どの問題かだけ)。
    const count = {};
    missed.forEach((q) => { count[q.primary] = (count[q.primary] || 0) + 1; });
    const top = Object.keys(count).sort((x, y) => count[y] - count[x])[0];
    body.appendChild(markedLead(
      count[top] >= 2
        ? `特に聞き逃しやすいのは、\n{{${top}}}です。`
        : `今回は{{${missed.length}つ}}の音を、\n聞き逃しました。`,
      'body-text'));
    const rows = h('ul', { class: 'tip-listen-list' });
    missedQ.forEach(([q, i]) => {
      rows.appendChild(h('li', { class: 'tip-listen-item' }, [
        h('p', { class: 'tip-listen-label', text: q.primary }),
        h('p', { class: 'tip-listen-text', text: `${i + 1}問目「${q.en}」` }),
      ]));
    });
    body.appendChild(h('div', { class: 'answer-group' }, [
      h('h3', { class: 'group-title', text: '聞こえなかった音は、これです' }),
      rows,
    ]));
  }
  if (caught.length) {
    body.appendChild(h('div', { class: 'answer-group' }, [
      h('h3', { class: 'group-title', text: '聞き取れた音' }),
      h('p', { class: 'body-text', text: caught.map((q) => q.primary).join('\n') }),
    ]));
  }

  body.appendChild(newsletterBlock(score, qs));
  body.appendChild(h('div', { class: 'note' }, [
    h('p', { text: '聞き取れないのは、\nあなたの耳のせいでは\nありません。' }),
    h('p', { text: `このコースでは、会話ごとに\nその理由を説明します。\n説明は、${Math.floor(st.explanations / 100) * 100}以上。` }),
  ]));
  body.appendChild(h('div', { class: 'btn-row' }, [
    h('a', { class: 'btn-link', href: '/speakup/', text: 'コースの内容を見る' }),
  ]));
  body.appendChild(navRow({
    onBack: () => show(TOTAL - 1),
    onNext: () => { state.answers = []; show(0); },
    nextLabel: 'もう一度やる',
    nextClass: 'btn-outline',
  }));
}

function newsletterBlock(score, qs) {
  const nl = DATA.newsletter || {};
  const missed = qs.filter((_, i) => state.answers[i] !== 0).map((q) => q.primary);
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
      fd.append('fields[quiz_score]', String(score));
      fd.append('fields[quiz_missed]', missed.join(','));
      if (source) fd.append('fields[quiz_source]', source);
      fd.append('ml-submit', '1');
      fd.append('anticsrf', 'true');
      await fetch(nl.endpoint, { method: 'POST', mode: 'no-cors', body: fd });
      clear(form);
      form.appendChild(h('div', { class: 'note' }, [h('p', { text: 'ありがとうございます。\n届いたメールをご確認ください。' })]));
    } catch (e) {
      submit.disabled = false;
      msg.hidden = false; msg.textContent = '送れませんでした。通信を確かめて、もう一度お試しください。';
    }
  }
  return h('div', { class: 'answer-group' }, [
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
