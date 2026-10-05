// EAR TO VOICE — Talk to a Visitor
// Small DOM helpers shared by every screen. No framework, no build step —
// plain DOM construction (not innerHTML) so scenario content (HARU's
// text) and recognized speech text can never be interpreted as markup.

import { copy, fmt, IS_DRAFT } from './copy.js';
import { playerState, setVoice, setRate } from './playerState.js';
import { replayLastCue, micWasUsed, recoverFromEarpiece, hasLastCue, onCuePlayed, assetUrl } from './audio.js';
import { hasSeenBridge, markBridgeSeen, forgetBridgeSeen } from './storage.js';
import { Parser as BudouxParser } from './vendor/budoux/parser.js';
import { model as budouxJa } from './vendor/budoux/ja.js';

// ★2026-09-29 日本語は「文節」で改行する(CLAUDE.md「日本語は文節で改行する」)。
// body は word-break: keep-all(語の途中で折らない)なので、句読点の無い長い
// ひと続きは折れる場所が無く、はみ出しそうになると、ブラウザが非常用の
// 折り返しで「。」「、」だけを次の行へ押し出していた(非常用の折り返しは
// 行頭禁則を守らない)。2段で防ぐ:
//  ① BudouX で文節の切れ目にだけゼロ幅スペースを入れる → 折れる場所が
//     文節ごとにでき、句読点は前の文節にくっついたまま動く。
//  ② それでも1つの文節が行より長い時(狭いカードの「言ってくださいますか？」)
//     のために、4文字以上の文節は最後の2文字(＋後ろの句読点)を nowrap の span で
//     包む → 非常用の折り返しでも「すか？」「した」が一緒に動く
//     (WJ U+2060 は効かない。実測)。
// 日本語を含む文字列にだけかける。英文・数字だけの文字列は1文字も変えない。
const ZWSP = '\u200B';
const HAS_JA = /[\u3040-\u30ff\u3400-\u9fff\uff01-\uff5e]/;
// 文節の最後の2文字(＋後ろの句読点)。1文字だと「た」「か？」だけが次の行に
// 落ちるので2文字にする(340px の実測。「聞き取れませんで|した」)。
const TAIL = /[^\s。、，．！？!?）」』】…]{2}[。、，．！？!?）」』】…]*$/;
const budoux = new BudouxParser(budouxJa);
const phraseCache = new Map();
/* ★2026-09-29 BudouX の区切りを3つだけ手直しする(Harumi指示「1〜8も全部直して」)。
   実測で見つかった、文節の区切りが不自然だった所:
   ① かぎかっこの中で割れる  「いつもの|相槌」が → 「いつもの相槌」が
   ② 「に|ついて」で割れる    出身地に|ついての → 出身地についての
   ③ 読点のすぐ後の2文字が行末に残る  行列で、前に|外国人旅行者が → 前に外国人旅行者が
   ④ 1語が行より長い時に語の途中で割れる  言ってくださいま|すか？
      → 「言って|くださいますか？」の所に区切りを足す(9文字以上の時だけ)
   つなげた結果が12文字を超える時はつながない —— 長すぎる塊は、今度は
   非常用の折り返し(語の途中)を招く。
   ③を「読点の直後」に限るのは、文の途中の2文字(外国人の|前に|見た)を
   つなぐと意味の切れ目を越えるため(実測で「前に見た」になった)。 */
const PHRASE_END = /[、。，．！？!?」』）】…]$/;
const COMPOUND = /^(について|ついて|とって|よって|対して|関して|おいて|向けて)/;
const MERGE_MAX = 12;
const TAIL_MAX = 14;
function tidyPhrases(ps) {
  const a = [];
  for (const p of ps) {
    const m = p.length >= 9 && p.match(/^(.{2,}?て)(くださ.+)$/);
    // ★2026-09-29 同じく、行より長い文末(360pxのカード・一覧で実測)を
    // 「聞き取れません|でした」「泊まっている|んですか？」の所で割れるようにする。
    const m2 = !m && p.length >= 8 && p.match(/^(.{3,}?)(んです[かよね]?[？！。]?|でした[。！]?)$/);
    if (m) a.push(m[1], m[2]); else if (m2) a.push(m2[1], m2[2]); else a.push(p);
  }
  const open = (x) => (x.match(/[「『]/g) || []).length - (x.match(/[」』]/g) || []).length;
  const out = [];
  for (let i = 0; i < a.length; i++) {
    let cur = a[i];
    for (;;) {
      const next = a[i + 1];
      if (next === undefined) break;
      const core = cur.replace(/[「」『』、。，．！？!?…]/g, '');
      const afterComma = out.length === 0 || PHRASE_END.test(out[out.length - 1]);
      const want = open(cur) > 0 || COMPOUND.test(next)
        || (core.length <= 2 && !PHRASE_END.test(cur) && afterComma);
      if (!want || (cur + next).length > MERGE_MAX) break;
      cur += next;
      i++;
    }
    out.push(cur);
  }
  // ⑤ 最後の文節が2文字(＋句読点)だけなら、1つ前とつなぐ —— 「使いそうな
  //    フレーズを|選ぶ」「…を|ため。」のように、行末の1語だけが次の行に
  //    落ちないようにする。こちらは少し長めの塊まで許す(TAIL_MAX)。
  const last = out[out.length - 1];
  if (out.length >= 2 && last.replace(/[「」『』、。，．！？!?…]/g, '').length <= 2
      && (out[out.length - 2] + last).length <= TAIL_MAX) {
    out.splice(out.length - 2, 2, out[out.length - 2] + last);
  }
  return out;
}
function phrasesOf(text) {
  let out = phraseCache.get(text);
  if (out === undefined) {
    // 改行(\n)をまたいで文節を探さない —— 手で決めた改行はそのまま残す。
    out = text.split('\n').map((line) => tidyPhrases(budoux.parse(line.replaceAll(ZWSP, ''))));
    phraseCache.set(text, out);
  }
  return out;
}
// DOM に置く所用(① ＋ ②)。日本語が無ければただのテキストノード。
const NB_WHOLE_MAX = 6;
export function jaText(text) {
  const str = text === null || text === undefined ? '' : String(text);
  if (!HAS_JA.test(str)) return document.createTextNode(str);
  const frag = document.createDocumentFragment();
  let buf = '';
  const flush = () => { if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; } };
  phrasesOf(str).forEach((ps, li) => {
    if (li > 0) buf += '\n';
    ps.forEach((ph, pi) => {
      if (pi > 0) buf += ZWSP;
      /* ★2026-09-29 実機(iPhone Safari)で「みんなス/キーを」と、1つの文節の途中で
         折れていた(Chromium では起きない)。Safari の keep-all はカタカナの途中の
         折り返しを止めきれない。**6文字までの文節は、丸ごと折れない塊にする。**(8にすると360pxの狭い欄で「から始まります。」がはみ出した・実測)
         長い文節だけ、今までどおり最後の2文字を塊にする(1行より長い文節を
         丸ごと塊にすると、はみ出すため)。 */
      if (ph.length >= 2 && ph.length <= NB_WHOLE_MAX) {
        flush();
        const whole = document.createElement('span');
        whole.className = 'nb';
        whole.textContent = ph;
        frag.appendChild(whole);
        return;
      }
      const m = ph.length >= 4 ? ph.match(TAIL) : null;
      if (!m) { buf += ph; return; }
      const cut = ph.length - m[0].length;
      buf += ph.slice(0, cut);
      flush();
      const nb = document.createElement('span');
      nb.className = 'nb';
      nb.textContent = ph.slice(cut);
      frag.appendChild(nb);
    });
  });
  flush();
  // span.nb を1つでも作ったら、全体を1つの span で包む。ボタンや行のように
  // 入れ物が flex の所では、テキストと span がばらばらの flex アイテムになり、
  // 折り返さずに横へ並んでしまう(「選んでくだ さい」。実測)。
  if (frag.childNodes.length > 1) {
    const wrap = document.createElement('span');
    wrap.appendChild(frag);
    return wrap;
  }
  return frag;
}
// textContent の代わり(中身を丸ごと置き換える)。
export function setJaText(el, text) {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(jaText(text));
}

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') setJaText(el, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      // Only ever used with our own static markup (e.g. inline icons),
      // never with scenario content or recognized speech.
      el.innerHTML = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === 'string' ? jaText(child) : child);
  }
  return el;
}

/* ★2026-09-29 会話の締め「Well done!」(Harumi決定)。会話の練習(branches.js)と
   間を取る練習(pausePractice.js)の両方がこれ1つを使う(同じ仕事をする画面は一緒に
   直す)。形とクラス名は LP(harmony-horizon-landing speakup/index.html #tryDone)と同じ。
   LPの「今すぐ始める」(購入ボタン)はLPだけの物なので入れない。 */
export function chatDoneBlock() {
  const b = copy.branches;
  // LPと同じく、370px以下だけ「最後まで／会話できました。」で折る(。だけが落ちないように)。
  const title = b.chatBranchDone.split('まで').flatMap((t, i, a) =>
    i < a.length - 1 ? [t + 'まで', h('br', { class: 'try-done-br' })] : [t]);
  return h('div', { class: 'try-done' }, [
    h('p', { class: 'try-done-en', text: b.chatBranchDoneEn }),
    h('p', { class: 'try-done-title' }, title),
    h('p', { class: 'try-done-sub pre-line', text: b.chatBranchDoneSub }),
  ]);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// document.createElement('svg') creates a plain HTML-namespace element,
// not a real SVGSVGElement — setting innerHTML on it parses <circle> etc.
// as unknown HTML tags, which silently mis-nest instead of rendering
// (found via smoke testing). The HTML parser only enters SVG foreign-
// content mode when the literal `<svg>` tag appears inside a real HTML
// element's innerHTML, so icons must be built that way: a wrapper span
// whose innerHTML is the *entire* `<svg>...</svg>` string, never an
// h('svg', ...) node with only its children as html.
export function svgIcon(svgMarkup, className) {
  return h('span', { class: className, 'aria-hidden': 'true', html: svgMarkup });
}

/* ★2026-09-10 ヘッダーの札のアイコン(SKILL_ICONS: 吹き出し・耳・マイク)を
   **定義ごと削除した**(Eat Out と同じ決定)。この札が答えるのは
   「いま何の力を鍛えているか」の1点だけで、その答えは2語
   (リスニング / スピーキング。js/copy.js の skillKind)で足りる ——
   2語に絵を添えても、絵の分だけ読む物が増えるだけだった。
   **使われない絵をコードに残さない** —— 残すと次に触る人が
   「せっかくあるから」と別の場所へ戻す(CLAUDE.md「やめた機能は、
   コードから消えるまで やめたことにならない」)。**復活させないこと。** */

// Design System監査(2026-08-20)で見つかった重複アイコン。再生▶(3箇所)・
// マイク(3箇所、うちbranches.jsだけpath構造が別物)・炎(2箇所)が個別に
// コピペされていたのを、ここ1箇所に集約した。使う側は svgIcon(PLAY_ICON,
// className) / svgIcon(MIC_ICON, className) の形で呼ぶ（widthやheightは
// CSS側のクラスで決める。既存の見た目・サイズは変えていない）。
export const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
/* ★2026-09-26 PERSON_ICON: 会話帳(chat-thread)の吹き出しに添える人の印。
   Harumi指摘「LINEとかテキストのチャットみたいに人のアイコンを入れて
   会話帳にするんじゃなかったんですか」——bubbleRow()の中でだけ使う
   (下記chatAvatar参照)。単色シルエット1本のpathで、SKILL_ICONSのような
   「文字が既に言っていることをなぞるだけの飾り」ではない —— 誰の番かを
   一瞬で見分ける、LINE/WhatsApp型チャットの実用的な部品。新しい色は
   足さず、既存トークン(--ink/--surface/--muted/--line)だけで塗り分ける
   (下のCSS参照)。 */
/* ★2026-09-29 Harumi指摘「一流プロは、人のアイコンもっと人を大きくしない？」。
   前の絵(Material の person)は枠の中に余白を持った小さな人で、28pxの丸の中では
   頭が数pxしか無かった。**丸いっぱいに人を描き、肩は丸の下端で切る**
   (連絡先・チャットの定番の形)。丸と同じ 40×40 の座標で描く。 */
export const PERSON_ICON =
  '<svg viewBox="0 0 40 40" fill="currentColor"><circle cx="20" cy="15.5" r="7.5"/><path d="M4.5 40c0-8.6 6.9-14.8 15.5-14.8S35.5 31.4 35.5 40z"/></svg>';
/* ★2026-09-24 MIC_ICON(マイクの絵)を削除した。Harumi指示
   「発音チェックは、やめようと思います」で、このアプリでマイクの絵を出す
   ボタンが1つも無くなったため(AI英会話の入口は文字だけ)。
   **復活させないこと** —— 使われない絵をコードに残すと、次に触る人が
   「せっかくあるから」と別の場所へ戻す(FLAME_ICON と同じ判断)。 */
/* ★2026-09-23 FLAME_ICON(炎=連続練習日数)を削除した。
   Harumi指示「連続何日は削除」で Home の連続日数ごと無くなり、
   使う所が0になったため。**復活させないこと**(使われない絵を
   コードに残すと、次に触る人が別の場所へ戻す)。 */

// Design System Phase 3後半(2026-08-20): 「音声を聞く」ボタンを2段階
// (大=そのページの主役／小=補助的な聞き直し)で共通関数化した。ハルミ
// 指示の「音声を聞くことが主役なら大きく、補助的なら小さく」という
// 意図的な使い分けはそのまま残し、見た目の構築コード自体を1箇所に。
// onPlay は再生中の自分のボタン要素(btn)を受け取れる — 呼び出し側が
// AudioCue.play({btn}) や再生後のテキスト表示などに使うため。
// ※大きい方(bigPlayButton / .play-big)は2026-08-30に削除した。文字ボタン
// (actionButton)に置き換わって呼び出し元が無くなったため。アイコンだけの
// 大きな丸ボタンは「見た目の文法7」で禁じた形でもあるので、復活させない。
/* ★2026-09-24 actionButton(番号＋アイコン＋文字の行動ボタン)を削除した。
   使っていたのは「聞いて、言う」の ①お手本を聞く / ②マイクで言ってみる の
   2つだけで、Harumi指示「発音チェックは、やめようと思います」で②が無くなり、
   ①は丸い再生ボタン(下の audioButton)になったので、呼び出し元が0になった。
   **復活させないこと。** 番号(①②)は**対で意味を持つ**ので、戻すなら必ず
   両方いっしょに(2026-09-06/2026-09-08 の経緯)。 */

/* ★2026-09-24 丸い再生ボタン(Order Up の audioBtn をそのまま移植)。
   Harumi承認「4,5,6,7」の⑦。

   **2026-08-30に消した .play-big とは別物。** あちらは**円の中にアイコン
   だけ**で「これは何？」の解読が要り、見た目の文法7に当たっていた。
   こちらは Order Up と同じ **円＋その横に必ず文字**(「お手本を聞く」)なので、
   押す物の名前は文字が言い、円は「押すと音が鳴る」だけを語る。
   **文字を省いて円だけにしないこと** —— 省いた瞬間に .play-big に戻る。

   使う場所は「その画面で一番大事な"聞く"が1つだけ」の時
   (size:'lg' = 80px)。①②が対で並ぶ発音チェックには**使わない** ——
   Order Up も、①②が並ぶ Pronunciation Check だけは丸ボタンをやめて
   番号付きの平らな帯(.band)にしてある。番号は対で意味を持つので、
   片方だけ丸くすると対に見えなくなる(2026-09-06/2026-09-08 の経緯)。 */
export function audioButton({ label, size = 'lg', onClick }) {
  // ★2026-09-24 Harumi指示「丸い再生ボタンは、真ん中センターにあるべきです。
  // 丸い再生ボタンに文字はありません。センター寄せです。」——**文字を横に
  // 添えない・画面の中央に置く**。Order Up も、▶の横に言葉を置くと
  // 「a word beside ▶ pushed it off-centre」として**ラベルの無い▶**にして
  // ある(あちらの `audioBtn('', 'say-play')` のコメント)。
  //
  // 2026-09-24の初版は `audioBtn('お手本を聞く', 'say-play audio-lg')` の方を
  // 写して**文字つき・左寄せ**にしていた —— 同じ部品でも呼び方が2通りあり、
  // **центしたい方**がHarumi様の選んだ形だった。文字つき・左寄せに戻さないこと。
  //
  // 見た目の文法7「アイコンだけのボタンを作らない」に当たらない理由:
  // あの決まりが禁じているのは**意味の解読が要るアイコン**で、▶(再生)は
  // 唯一の例外として既に認めてある(2026-08-30 Harumi確認)。ここは画面で
  // ただ1つの「聞く」なので、何を聞くかは上の練習する文が語っている。
  // 名前は aria-label で読み上げに残す(目が使えない人にも意味は届く)。
  const cls = 'audio-btn' + (size === 'lg' ? ' audio-lg' : '');
  const btn = h('button', { class: cls, type: 'button' }, [svgIcon(PLAY_ICON, 'audio-btn-circle')]);
  btn.setAttribute('aria-label', label || copy.listenAria);
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

// 行内の小さな「聞く」。★2026-08-31 Harumi提案「統一して再生▶️アイコンを
// 加えるように統一しませんか？」——「押すと音が鳴る」場所には、どこでも
// 同じ▶を出す。文字は消さない(見た目の文法7「アイコンだけのボタンを
// 作らない」)ので、▶＋文字。新しいボタン様式は作らず、既存の.btn-smallに
// アイコンを1つ足しただけ。
// 声のメッセージの波形(2026-08-31 Harumi指摘「相手の言葉がゆとりがない
// 四角になってるので、テキストみたいにもっと長方形でもいいのでは？
// 再生ボタンも窮屈そう。プロの設計でもこうしますか？」)。
//
// 何が起きていたか: 相手の吹き出しは**英文を見せない**(耳優先)ので、中身が
// 「小さなボタン2つ」だけになり、**文の入っていない小さな箱**になっていた。
// メッセージに見えないのは当然で、プロならこうしない。
//
// プロの答えは**声のメッセージ(voice message)の形にする**こと ——
// LINE・WhatsApp・Messengerが全部同じ形で、▶と波形が横いっぱいに伸びた
// 帯になっている。見た瞬間に「これは音、押すと鳴る」と分かり、幅が出るので
// 文字の吹き出しと同じリズムで並ぶ。
//
// 波形の高さは audio_id から決める(同じ文はいつも同じ形・違う文は違う形)。
// 飾りではなく「1本ごとに違う声の塊」に見せるための、最小限の変化。
// 「押すと鳴る」1行(▶＋文字＋波形)。**相手の吹き出しでも自分の吹き出しでも
// まったく同じ形**にするための部品(2026-08-31 Harumi指摘「相手も私のテキスト
// 風表示は統一したのがいいのでは？プロならどうする？」)。
// 枠も地も持たない —— 吹き出しの中に「もう1つの箱」を作らないため。
// 置き場所も両側で揃える: **文の下、吹き出しの一番下**。
/* ★2026-09-29 ことばのメモ(content/translations.py WORD_NOTE_JA)。
   中学の教科書に出てこない言い方に添える小さな1行。語 = 小さな金の見出し、
   説明 = 一段小さい本文、英文とは細い罫線1本で分ける(「言うときのコツ」と同じ形)。
   会話の練習(言い出し・返し)と「聞いて、言う」が、この1つを使う —— 2か所で組み立てない。 */
/* ★2026-09-30 Harumi指摘「ここでは『one』は『コンビニ』を指します、とか加えないと
   初級の人は？？？？になる」。見出しの行に**この場面での答え**を「＝」で並べる
   (one ＝ コンビニ)。一目で答えが分かり、説明はその理由だけを短く言えばよい。
   ＝意味は inline-block —— 入りきらない時は「＝ コンビニ」ごと次の行へ移り、
   「＝」だけが行末に残らない。 */
/* ★2026-09-29 相手のセリフにも付けた(content/translations.py PARTNER_NOTE_JA)。
   ・note_must: 見出しの上に金の塗りの札「MUST」(Harumi「案3」)。札は「おすすめ」と
     同じ .chip —— 新しい色・形は足さない(塗り＝これを覚えればいい)。見出しの
     横に置くと長い表現ほど次の行へ落ち、印の位置が表現ごとにずれた(360px実測)。
   ・note_ja が空の表現は見出しだけ(Harumi「これ以上書かなくてもOK」)。 */
export function wordNote(phrase, { hidden = false } = {}) {
  return h('div', { class: 'chat-word-note', hidden }, [
    phrase.note_must ? h('p', { class: 'chat-word-note-must' }, [h('span', { class: 'chip', text: 'MUST' })]) : null,
    phrase.note_word
      ? h('p', { class: 'chat-word-note-word' }, [
          h('span', { class: 'chat-word-note-en', text: phrase.note_word }),
          phrase.note_mean ? h('span', { class: 'chat-word-note-mean', text: '＝ ' + phrase.note_mean }) : null,
        ])
      : null,
    phrase.note_ja ? h('p', { class: 'chat-word-note-text', text: phrase.note_ja }) : null,
  ]);
}

/* 相手のセリフのメモ(1つの文に2つまで)。partner.notes = [{word, mean, text, must}]。
   会話の練習(branches.js)と止まって練習(pausePractice.js)の2か所が使う。 */
export function partnerNotes(notes, { hidden = false } = {}) {
  return (notes || []).map((n) =>
    wordNote({ note_word: n.word, note_mean: n.mean, note_ja: n.text, note_must: n.must }, { hidden })
  );
}

export function voiceRow({ label, seed, onPlay }) {
  const btn = h('button', { class: 'chat-voice', type: 'button' }, [
    h('span', { class: 'chat-voice-label' }, [svgIcon(PLAY_ICON, 'action-icon'), label]),
    waveBars(seed),
  ]);
  btn.addEventListener('click', () => onPlay(btn));
  return btn;
}

/* 人の印(丸い小さなアイコン)。★2026-09-26 新設 → ★2026-09-27 名前と
   同じ行(chat-head)に移した(下のbubbleRow参照)。誰の言葉かは既に
   .chat-sender(「あなた」/「相手」の文字)と左右の寄せが言っているので、
   これは**二重に説明するアイコン**にしない —— aria-hidden で読み上げから
   外す(文字ラベルの方がスクリーンリーダーには正しい)。
   相手=白地+細い枠(--surface/--line/--muted、吹き出し.is-partnerと同じ
   静かな調子) / あなた=濃色の塗り(--ink/--surface、吹き出し.is-youの
   グレージュより一段はっきりさせて「自分の番」を強める)。
   新しい色は1つも足していない。丸(999px)は「選ぶボタン」ではなく
   人の印なので、見た目の文法3(ピル形は押して選ぶ物に使わない)には
   当たらない —— 既存の.option-radio(選択の丸い印)と同じ扱い。 */
function chatAvatar(who) {
  return h('div', { class: `chat-avatar is-${who}`, 'aria-hidden': 'true' }, [
    svgIcon(PERSON_ICON, 'chat-avatar-icon'),
  ]);
}

// 吹き出し1行(誰の言葉か + 中身 + 吹き出しの下の添え物)。
// ★2026-09-01 js/branches.js の中にあったものをここへ移した ——
// 相槌ドリル(js/reactionDrill.js)も同じ会話の形になり、2箇所で別々に
// 組み立てると必ず食い違うため(CLAUDE.md「同じ仕事をする画面は、必ず
// 一緒に直す」)。添え物(under)は吹き出しの**下**に出す —— 中に入れると
// 「箱の中の箱」になる。
//
// ★2026-09-27 作り直した(Harumi指摘「人のアイコンが変なのでやり直して。
// 『あなた』とアイコンがalignするべきなのに、できてないし、同じ人が
// 話すときは名前を出し続けない」)。
//   (a) アイコンを固定px(margin-top:20px)で名前の下へ寄せる形は、文字の
//       サイズ・行間が変わるたびに(この回でも)必ずずれる。→ **アイコンと
//       名前を同じ行(chat-head)にflexで横並びにし、align-items:centerで
//       自動的に揃える**(固定pxを1つも使わない)。
//   (b) 名前は「直前の.chat-rowと話者が違う時」だけ出す。判定は渡された
//       thread の**実際の最後の.chat-row**を見て決める —— 呼び出し側に
//       「前は誰だったか」を別に覚えさせない(1箇所にまとめることで、
//       branches.js/reactionDrill.jsの両方に自動で同じ形が効く。
//       reactionDrill.jsが手動でやっていた`line.lead_ja ? null : ...`の
//       ような場当たりの判定は、この1箇所に置き換えて削除した)。
//   同じ話者が続く2行目以降は chat-head を出さず、.chat-col に
//   アイコン分の余白(36px=28px+8pxgap)だけ残す(is-followup) ——
//   LINE等と同じ、列は揃ったまま名前だけ省かれる形。
//   thread を渡さない呼び出し(将来の見落とし対策)は、直前が分からない
//   ので常に名前を出す(元の動きのまま安全側に倒す)。
export function bubbleRow(who, senderLabel, children, { bubble: given = null, under = null, thread = null } = {}) {
  const bubble = given || h('div', { class: `chat-bubble is-${who}` }, children);
  const prevRow = thread
    ? [...thread.children].reverse().find((el) => el.classList && el.classList.contains('chat-row'))
    : null;
  const sameAsPrev = !!(prevRow && prevRow.classList.contains(`is-${who}`));
  const head = !sameAsPrev && senderLabel
    ? h('div', { class: 'chat-head' }, [chatAvatar(who), h('p', { class: 'chat-sender', text: senderLabel })])
    : null;
  const col = h('div', { class: `chat-col${sameAsPrev ? ' is-followup' : ''}` }, [
    head,
    bubble,
    /* under は複数でもよい(配列で渡す)。吹き出しの**下**に並べる場所
       —— 「意味と英文を見る」と「なぜ聞き取れない？」がここに入る
       (CLAUDE.md「吹き出しの中にもう1つ箱を作らない」)。 */
    ...(Array.isArray(under) ? under : [under]),
  ]);
  /* ★2026-09-27 is-followup を row 自身にも付ける(以前は col だけ)。
     main.css の `.chat-row.is-followup { margin-top: -6px; }` が、同じ
     話者が続く時だけ行間を詰める —— 「1人がまとめて話している」まとまりが
     目でも分かるように(会話のキャッチボール=話者が変わる所は今までどおり)。 */
  const row = h('div', { class: `chat-row is-${who}${sameAsPrev ? ' is-followup' : ''}` }, [col]);
  return { row, bubble };
}

/* ★2026-09-27 「……」タイピングインジケーター(会話画面の再設計)。
   Harumi指示「相手が次の文章を話す前に…のようなtyping indicatorが
   短時間表示され、その後message bubbleが自然に出てくる」。
   js/branches.js の partnerTurn() が、実際の吹き出しを作る**前**に
   これを差し込み、短い間(TYPING_MS)だけ見せてから `.remove()` する。
   bubbleRow() をそのまま使うので、直前の話者と同じかどうかの判定
   (アイコン・名前の省略)もそのまま効く。呼び出し側は
   `thread.appendChild` を書かなくてよい(ここで済ませる)。
   aria-hidden(装飾) —— 実際の案内は既存の状態バー(.note「相手が話して
   います。」)が同じ瞬間に出るので、二重に読み上げない。 */
export function typingIndicator(thread) {
  const bubble = h('div', { class: 'chat-bubble chat-typing' }, [
    h('span', { class: 'typing-dot' }),
    h('span', { class: 'typing-dot' }),
    h('span', { class: 'typing-dot' }),
  ]);
  const { row } = bubbleRow('partner', copy.branches.chatPartner, null, { bubble, thread });
  row.setAttribute('aria-hidden', 'true');
  thread.appendChild(row);
  return row;
}

export function waveBars(seed = '', count = 20) {
  let hsh = 2166136261;
  const t = String(seed);
  for (let i = 0; i < t.length; i++) hsh = (Math.imul(hsh ^ t.charCodeAt(i), 16777619)) >>> 0;
  const wrap = h('span', { class: 'chat-wave', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    hsh = (Math.imul(hsh, 1103515245) + 12345) >>> 0;
    const ratio = 0.3 + ((hsh >>> 16) % 71) / 100; /* 0.30〜1.00 */
    wrap.appendChild(h('i', { style: `height:${Math.round(ratio * 24)}px` }));
  }
  return wrap;
}

// 「あと何秒」を丸い時計で見せる部品(2026-08-31 Harumi提案「まるいチャート
// カウントダウン / 時計カウントダウン。ビジュアル的に10秒経ってるって
// 見える方法」)。
// なぜ丸か: 帯(プログレスバー)は「読み込み中/どこまで進んだか」に読める。
// **円は時計の文字盤**なので、説明なしで「時間が減っている」と分かる —— 
// タイマーアプリ・クイズ番組が全部この形なのはそのため。
// 数字も必ず一緒に出す(50〜60代の読み手には、形より数字が速い)。
// 新しい色は足していない: 地は--ink-hair(エスプレッソの一番淡い罫線)、
// 減っていく弧は金(--accent-line)、数字は本文色。
export function countdownRing() {
  const R = 20;
  const C = 2 * Math.PI * R;
  // SVGはHTML要素のinnerHTMLに**まるごと**入れないと名前空間が付かない
  // (js/ui.js svgIcon の注記と同じ理由)。
  const wrap = h('div', { class: 'countdown', role: 'timer' });
  wrap.innerHTML =
    `<svg class="countdown-svg" viewBox="0 0 44 44" aria-hidden="true">` +
    `<circle class="countdown-track" cx="22" cy="22" r="${R}"></circle>` +
    `<circle class="countdown-bar" cx="22" cy="22" r="${R}" ` +
    `stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"></circle>` +
    `</svg><span class="countdown-num"></span>`;
  const bar = wrap.querySelector('.countdown-bar');
  const num = wrap.querySelector('.countdown-num');
  return {
    el: wrap,
    // left/total で弧の残りを決める。1秒ごとに呼ぶだけで、CSS側の
    // transition(1s linear)がなめらかに繋ぐ。
    set(left, total) {
      const ratio = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
      bar.style.strokeDashoffset = String((C * (1 - ratio)).toFixed(2));
      num.textContent = String(Math.max(0, left));
    },
    // 「もう一度聞く」で10秒に戻す時、弧が逆回りに伸びるのは不自然なので
    // その1回だけアニメーションを切って即座に満タンへ戻す。
    reset(total) {
      bar.classList.add('is-instant');
      this.set(total, total);
      /* 次のフレームで戻す(付けた瞬間に外すと効かない) */
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('is-instant')));
    },
  };
}

/* ★2026-09-29 smallPlayButton(枠付きの「▶ 聞く」)を削除した。2026-09-28 に
   相槌ドリルの答え合わせから外して以来、どこからも使われていなかった。
   一覧の行は .phrase-row-chev(▶だけ)、吹き出しは voiceRow() —— 再生ボタンの
   形は3つだけ(CLAUDE.md「再生ボタンは3つの形だけ」)。復活させないこと。 */

// 「そのページの主要アクション」を表す3段階のボタン(埋め/枠線/ミント)。
// navRow()/backRow()とは別に用意した — あちらは「戻る・次へ」の対に
// 特化しているのに対し、こちらは画面ごとに文言が変わる単発のCTA
// （「選ぶ」「終わり」「ホームに戻る」等）に使う共通の作り方。extraAttrs
// は hidden:true 等、作成直後に付けたい追加属性がある時だけ渡す。
// 2026-08-28 Harumi指摘「Speakupの多くのボタンの色を最終的にこの色に
// (エスプレッソグラデーション、太すぎない長方形)」— Redesign案
// (speakup-redesign.html)の.btn-primaryと同じく、文字の後ろに小さな
// 金の矢印を添える。ここでまとめて足すことで、呼び出し側(各画面)は
// 一切変更しなくてよい。
export function withArrow(label) {
  return [label, h('span', { class: 'btn-arrow', 'aria-hidden': 'true', text: '→' })];
}
export function primaryButton(label, onClick, extraAttrs) {
  return h('button', { class: 'btn-primary', type: 'button', onClick, ...extraAttrs }, withArrow(label));
}
/* ★2026-09-04 「今日はここまでにする」のような**進まない**主ボタン。
   見た目は .btn-primary のまま(新しい様式は作らない)で、**矢印だけ付けない**
   —— 矢印は「進む」の合図なので、やめる操作に付くと意味がねじれる
   (CLAUDE.md「矢印は文言に書かない」の裏返し: 付ける側/付けない側がある)。 */
export function primaryStopButton(label, onClick, extraAttrs) {
  return h('button', { class: 'btn-primary', type: 'button', text: label, onClick, ...extraAttrs });
}
export function outlineButton(label, onClick, extraAttrs) {
  return h('button', { class: 'btn-outline', type: 'button', text: label, onClick, ...extraAttrs });
}
export function accentButton(label, onClick, extraAttrs) {
  return h('button', { class: 'btn-accent', type: 'button', onClick, ...extraAttrs }, withArrow(label));
}

// A field that HARU has not supplied yet. Never render invented text in
// its place — always this.
export function missingEl(fieldHint) {
  const span = h('span', { class: 'placeholder-missing', text: copy.missing });
  if (fieldHint) span.title = fieldHint;
  return span;
}

// Renders `value` as text if present, otherwise a visible [未入稿] marker.
export function textOrMissing(tag, value, attrs = {}, fieldHint) {
  if (typeof value === 'string' && value.trim() !== '') {
    return h(tag, { ...attrs, text: value });
  }
  return h(tag, attrs, [missingEl(fieldHint)]);
}

let toastTimer = null;
// 表示は次のフレーム(rAF)で付ける。この待ち札を覚えておかないと、
// 表示が付く前に hideToast() が走った時に「消すタイマーだけ消えて、
// 後から表示が付く」= 消えないトーストになる(2026-08-30 実害:
// 「いいですね。」が画面に residue として残り続けた)。
let toastRaf = null;
export function showToast(message, ms = 1500) {
  let toast = document.getElementById('etv-toast');
  if (!toast) {
    toast = h('div', { id: 'etv-toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toast);
  }
  setJaText(toast, message);
  if (toastRaf !== null) cancelAnimationFrame(toastRaf);
  toastRaf = requestAnimationFrame(() => {
    toastRaf = null;
    toast.classList.add('is-visible');
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), ms);
}

// 画面遷移が速いと、前の画面のトースト(「My Bookに追加しました」等)が
// 消えきる前に次の画面に重なって見えることがある(プロレビュー
// 2026-08-26: 次の画面の「次へ」ボタンに被って見えた)。router側から
// 画面が変わるたびに呼び、前の画面のトーストを即座に消す。
export function hideToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  // まだ表示が付いていない(rAF待ち)分も取り消す。これを忘れると、
  // この直後にrAFが表示を付けてしまい、消す人がいなくなる。
  if (toastRaf !== null) {
    cancelAnimationFrame(toastRaf);
    toastRaf = null;
  }
  const toast = document.getElementById('etv-toast');
  if (toast) toast.classList.remove('is-visible');
}

export function renderDraftBanner() {
  if (!IS_DRAFT) return null;
  return h('div', { class: 'draft-banner', text: copy.draftBanner });
}

// Persistent head — ported from Eatout's .topbar (harmony-horizon/eatout/
// listening/index.html): a .cat label on the left, .progress + .backlink
// stacked on the right. `progress` is { current, total } or null (e.g.
// the home screen, which shows the brand lockup instead of a step label).
// アプリ内の1画面ずつの「戻る」はヘッダーには出さない（下記コメント
// 参照、下部のnav-row/backRowに一本化）。ヘッダー右側は進捗表示に加え、
// Eatoutと同じ「← 一覧に戻る」（harmony-horizon/eatout/listening/
// index.html の setBackLink()）— 一覧的な画面（Home / ★聞き逃した
// フレーズ / あなたのフレーズ）より深い画面には常にこれが出て、1回の
// タップでそこまで一気に戻れる（Harumi指示 2026-08-19: 「インデックス
// 以外のページで、一覧に戻るボタンがない」）。Home画面自体だけは、
// Eatoutと同じ形（harmony-horizon/eatout/listening/index.html の
// #catLink / setTopbar / setBackLink）:
//   - 左側は常にボタンで、押すとどの画面からでもHomeへ戻る(onHomeClick)。
//     Home画面自体では、代わりにロゴのロックアップ(ブランド名+タグライン)を
//     出す。productName(商品名)行はHome再設計で外した（Harumi指示
//     2026-08-19第2弾: 「ブランド名だけでいい」）。
export function renderScreenHead(
  headEl,
  { progress, eyebrow, kind, brandLockup, onHomeClick, showListBack, onListBack, listBackLabel } = {}
) {
  clear(headEl);

  const markSvg =
    '<svg width="30" height="30" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="var(--ink)"/><circle cx="16" cy="16" r="2.7" fill="var(--accent-fill)"/><circle cx="16" cy="16" r="7.2" fill="none" stroke="var(--accent-fill)" stroke-width="2"/><circle cx="16" cy="16" r="11.8" fill="none" stroke="var(--accent-fill)" stroke-width="1.6" opacity="0.55"/></svg>';

  const catEl = brandLockup
    ? h('button', { type: 'button', class: 'brand-lockup-btn', onClick: onHomeClick }, [
        h('span', { class: 'brand-lockup' }, [
          svgIcon(markSvg, 'brand-lockup-mark'),
          h('span', { class: 'brand-lockup-text' }, [
            h('span', { class: 'brand-lockup-word', text: copy.home.brand }),
            h('span', { class: 'brand-lockup-tagline', text: copy.home.lockupTagline }),
          ]),
        ]),
      ])
    : // 中の画面にもロゴの丸マークを小さく添える（Harumi指摘 2026-08-19:
      // 「ヘッダーが素人っぽい」）。文字だけより、Home画面との統一感が出る。
      // kindが指定されていれば、見出し語の横に「何を鍛えているか」の
      // 小さいタグを添える（実際に声を出す/聞く/発音を測る画面だけ）。
      //
      // マークと見出し語は同じ行(.cat-top-row)に入れ、align-items:centerで
      // そろえる（Harumi指摘 2026-08-19: 「ロゴの位置が変」）。以前は
      // マーク単体にmargin-top:3pxの決め打ちで合わせていたが、
      // bodyのline-height:1.9を継いだ見出し語の行送りぶん、実際の文字の
      // 見た目の開始位置とマークの開始位置が数px ずれていた。チップ(2行目)
      // はこの行の外、.cat自体の2行目に置く（無い画面は1行のまま）。
      h('button', { type: 'button', class: 'cat', onClick: onHomeClick }, [
        h('span', { class: 'cat-top-row' }, [svgIcon(markSvg, 'cat-mark'), h('span', { class: 'cat-eyebrow', text: eyebrow || '' })]),
        /* ★2026-09-23 ヘッダーの小さい札(.cat-kind)は削除した。
           「リスニング / スピーキング」は本文の一番上に大きく出す
           (modeRow。Order Upと同じ)ので、ここに出すと同じ語を2回言う。
           **復活させないこと。** */
      ]);
  headEl.appendChild(catEl);

  // 画面内の「戻る」は下部の nav-row/backRow に一本化した（Harumi指示
  // 2026-08-17: ヘッダーとフッターで二重に出ていたのを整理）。
  // Home画面だけの「← Homeに戻る」（アプリの外の別ページへ）は下部に
  // 相当するボタンが無いので、ここだけ残す。
  const right = h('div', { class: 'topbar-right' });
  right.appendChild(h('p', { class: 'progress', text: progress ? `${progress.current} / ${progress.total}` : '' }));
  /* ★2026-09-06 Home右上の「アプリ一覧」(アプリの外へのリンク)を削除した。
     Harumi「上の『アプリ一覧』ボタンは必要ない。何を代わりに入れたらいい？」
     → **何も入れない。** ヘッダーの右は「いま何枚目か(4/4)」の席で、Homeには
     数える物が無いので、空くのが正しい。行き先はすべて下タブ3つが持って
     いるので(CLAUDE.md「画面の置き場所は下タブ3つで決める」)、ここに何かを
     置くと**タブの外に4つ目の入口**ができる。
     **代わりの物を入れないこと。** 設定のような物を足したくなったら、
     置き場所は「わたし」タブ。 */
  if (showListBack) {
    // 行き先の名前をそのまま出す(Harumi指摘 2026-08-30「HOME＝一覧に
    // 戻る？統一した方がいい」)。行き先がHomeなら「← Home」。
    right.appendChild(h('button', { type: 'button', class: 'backlink', 'data-back': '', onClick: onListBack }, ['← ', listBackLabel || copy.backList]));
  }
  headEl.appendChild(right);
}

// Ported from Eatout's .option (harmony-horizon/eatout/listening/
// index.html) — selection state uses aria-pressed with the accent-wash
// background, exactly as tokens.css documents that token's purpose.
// 「1つだけ選ぶ」の印(◯ → 選ぶと ◉)。★2026-08-31 Harumi指摘
// 「カジュアル『選ぶべき見た目ですか？』選択肢っぽい？ ◻︎があった方が
//  いいのでは？他のページと統一した方がいい。プロはどうする？」。
// プロの答えは**形で個数を語る**こと —— 世界中のアプリが同じ約束で
// 動いているので、説明が要らない:
//   ◯ 丸 = 1つだけ選ぶ / ☐ 四角 = いくつでも選ぶ / 印なし = ただ開く行
// ※CLAUDE.md 見た目の文法3「ピル形は押して選ぶものに使わない」は
//   **ボタンの形**の話。ボタンは今も四角のまま —— 丸いのは22pxの印だけで、
//   ここを四角にすると「複数選べる」の意味になってしまう。
/* ---- いまここ: 「リスニング / スピーキング」の札 と レッスンの地図 ----
   ★2026-09-23 Harumi指示「Order upみたいに、地図があった方がいいです。
   同じやり方をspeak upにも実装して」「リスニング／スピーキング って
   order upと同じようにTOPに加えて」。

   移植元は Order Up 本番(harmony-horizon/orderup/index.html)の
   journeyEl() と renderModeBridge() の地図。あちらの決め方をそのまま持つ:

   ・**札はどの練習画面にも同じものを、本文の一番上に大きく**
     (.journey-mode > .mode-name)。あちらの「一部のページにあって一部に
     無い」を直した形がこれ。ヘッダーの小さい札(.cat-kind)は**やめた**
     —— 同じ語を2回言わない(CLAUDE.md 2026-09-10)。
   ・**地図は練習ページに出さない。**「このページにトップの地図は削除」
     (Order Up 2026-09-23)と同じ。出すのは**レッスンの入口=状況ページ**
     1箇所だけ —— Speak Up には前置き画面が無いので、あちらの bridge に
     あたるのが状況ページ。
   ・**済んだ場面は名前＋✓ / いまは名前＋「← いまここ」/ 残りは
     「このあと Nつ」の1行**。先の名前を並べない(8行の空の番号が並ぶと
     地図が騒がしくなる、というあちらの実測)。

   旧 routeRow / lessonRoute(状況›言い方›会話 の細い1行)は、この地図に
   役目を譲って**削除した。復活させないこと** —— 同じ画面に地図が2つ
   出ることになる。 */
/* ★2026-09-30 Harumi指示「全タイトルにオートメーション(動き)を加えて、やってる
   ことが毎回明確になるように。何をやってるのか、ページがどう変わったのか
   分からないのが非常に痛い」。
   ・**毎ページ**: 札が上からふわっと入り、金の輪が1回広がる(自分の番の
     アイコンと同じ「ここを見て」の合図。新しい動きの言葉を増やさない)。
   ・**練習の種類が変わった時だけ**、輪を2回にして一段強く —— 「ここから
     別のことをする」が一番伝えたい瞬間なので、同じ強さにしない。
   ・role="status": 読み上げでも、変わった時に札の名前が告げられる。
   ・タブから戻った時(画面を付け直すだけ)は動かさない(app.js)。 */
export function modeRow(kind, { changed = false } = {}) {
  const label = kind && copy.skillKind[kind];
  if (!label) return null;
  return h('div', { class: 'journey-mode' }, [
    h('span', {
      class: 'mode-name is-enter' + (changed ? ' is-changed' : ''),
      role: 'status',
      text: label,
    }),
  ]);
}

/* items: [{ name, done }] を上から順に。nowIndex = いまのレッスンの位置。
   name = モジュール名 / total = そのモジュールのレッスン数。 */
/* ★2026-09-25 訂正: いまの1本の**名前も隠す**ようにした。
   Harumi指摘「Order upは、全体図を見せないことになってます。やってない
   部分を前に見せてしまうと、会話の内容を予想できてしまうので、Order up
   では『次のチャレンジ ← いまここ』と書かれているはず。新しく作り直す
   のではなく、常にOrder upのいいところを組み込んでください」。

   実際のOrder Up(harmony-horizon/orderup/index.html のbridge map)を
   読み直すと、**済んだ物だけ実名(STEP_NAMES_JA)を出し、いまの1本は
   実名を出さず「次のチャレンジ」の固定文言に置き換えている**
   (`j < idx ? 実名 : '次のチャレンジ'`)。直す前のここは「いまの1本にも
   実名(it.name)を出す」形で、Order Upのこの一点から外れていた——
   同じ画面のeyebrow(例:「言い方を選ぶ」)が既にその名前を言っているので、
   隠しても情報は減らない(「同じ語を2回言わない」とも整合する)。

   name/total は省略可(Home のような「全体の道のり」には、名乗る
   1つの主語が無いため——名乗る物がある時だけ見出しを出す)。 */
/* ★2026-09-29 Harumi承認(地図のかたち)。まとまり(モジュール)の地図は、中に
   レッスンが4〜8本あるので**何本やっても1マスも動かず**「進んでいない」に見えた
   (「5つやったのに、ずっと 3 次の練習」)。いまのまとまりの中だけ**1段細かく**見せる:
     ✓ 1 聞き返す
     ● 3 困っている人に声をかける      5 / 8
         ✓ 駅への道 …(済んだレッスンは名前)
         ● 山手線        ← いまここ
         ○ このあと 2つ   (先の名前は出さず数だけ —— Order Up の決まりを1段下にも)
     ○ このあと 6つ
   ・いまのまとまりの名前は出す(もう中に入っているので、先の会話の予想にならない)。
   ・スピーキング/リスニング/シミュレーションの3行は外した(どのレッスンも同じで、
     毎回同じ3行が並ぶだけだった)。
   ・nowIndex が items.length なら全部済み(いまここ無し)。 */
export function lessonMap({ items, nowIndex, nowSub }) {
  if (!items || items.length < 2) return null;
  const map = h('div', { class: 'bridge-map' });
  // ★2026-09-30 見出し(名前＋「全◯レッスン」)は削除。状況ページの地図をやめて(2026-09-29)
  // からどこも渡していなかった。
  const ol = h('ol', { class: 'bridge-steps' });
  items.forEach((it, i) => {
    if (i > nowIndex) return;
    const isNow = i === nowIndex;
    const li = h('li', { class: 'bridge-step' + (isNow ? ' is-now' : ' is-done') + (isNow && nowSub ? ' has-sub' : '') }, [
      h('span', { class: 'bridge-step-mark', text: isNow ? '' : '✓' }),
      h('span', { class: 'bridge-step-num', text: String(i + 1) }),
      h('span', { class: 'bridge-step-name', text: (isNow && !it.name) ? copy.map.nextChallenge : it.name || '' }),
    ]);
    if (isNow) li.appendChild(h('span', { class: nowSub ? 'bridge-step-count' : 'bridge-step-here', text: nowSub ? nowSub.count : copy.map.here }));
    ol.appendChild(li);
    if (isNow && nowSub) {
      const sub = h('ol', { class: 'bridge-sub' });
      nowSub.lessons.forEach((l) => {
        const now = l.state === 'now';
        const row = h('li', { class: 'bridge-sub-step' + (now ? ' is-now' : ' is-done') }, [
          h('span', { class: 'bridge-sub-mark', text: now ? '' : '✓' }),
          h('span', { class: 'bridge-sub-name', text: l.name || '' }),
        ]);
        if (now) row.appendChild(h('span', { class: 'bridge-step-here', text: copy.map.here }));
        sub.appendChild(row);
      });
      if (nowSub.later > 0) {
        sub.appendChild(h('li', { class: 'bridge-sub-step is-later' }, [
          h('span', { class: 'bridge-sub-mark', text: '' }),
          h('span', { class: 'bridge-sub-name', text: fmt(copy.map.later, { n: nowSub.later }) }),
        ]));
      }
      ol.appendChild(h('li', { class: 'bridge-sub-wrap' }, [sub]));
    }
  });
  const later = items.length - nowIndex - 1;
  if (later > 0) {
    ol.appendChild(
      h('li', { class: 'bridge-step is-later' }, [
        h('span', { class: 'bridge-step-mark', text: '' }),
        h('span', { class: 'bridge-step-name', text: fmt(copy.map.later, { n: later }) }),
      ])
    );
  }
  map.appendChild(ol);
  return map;
}

/* 「一回読めば分かることを何回も繰り返さない」(Order Up の firstTime。
   Harumi 2026-09-23、2026-09-25にSpeak Upへ移した)。

   長い説明は**その周の初回だけ**出し、2回目からは短い版にする。
   ・`key` … 説明の種類(例 'say-cue')
   ・`id`  … いまの画面を指す物(フレーズid・レッスンid)
   最初に呼ばれた `id` を覚えるので、**「戻る」で同じ画面に来た時は
   長い版のまま**(途中で言葉が変わると、戻ったのに違う画面に見える)。
   ★覚えるのはメモリだけ。アプリを開き直せばまた長い版から始まる ——
     端末に残す物ではない(久しぶりに開いた人には、もう一度読ませたい)。 */
const firstShown = {};
export function firstTime(key, id) {
  if (!(key in firstShown)) firstShown[key] = id;
  return firstShown[key] === id;
}

export function radioMark() {
  return h('span', { class: 'option-radio', 'aria-hidden': 'true' }, [h('span', { class: 'option-radio-dot' })]);
}

// 2026-08-31 削除: optionButton()。唯一の使い手だった状況ページの
// 「言えた/言えない」を消したので、呼ぶ人がいなくなった。
// いま `.option` を組み立てているのは js/earToVoice.js の「言い方を選ぶ」
// 1箇所だけ(印は radioMark() を使う)。**新しく選択肢を作る時は、
// 必ず radioMark() を先頭に入れること**(見た目の文法7c)。

// Tips accordion — ported from Eatout's .tip-acc/.tip-toggle/.tip-body
// (harmony-horizon/eatout/listening/index.html). `tips` is { word,
// grammar, pronunciation, linking } — a key with no supplied text opens
// no accordion item at all (never a placeholder, per SPEC.md section 11).
// 1件ぶんの開閉行(タイトル＋本文)。tipAccordion(発音Tips)と
// methodAccordion(2026-09-05・下記)が共有する——見た目・挙動を
// 増やさず、同じ`.tip-acc`家族を使い回す。
function accordionItem({ mark, title, text, body: bodyNodes, onToggle }) {
  const body = h('div', { class: 'tip-body', hidden: true }, bodyNodes || [h('p', { text })]);
  /* ★2026-09-08 このカードに「次へ」の行(旧 .tip-done)を持たせていた
     2026-09-07〜08の形は**やめた**(Harumi指摘「次への位置が不自然。上の
     ボックスの中か？ くっついてる」)。実測(390×664)で、吹き出しの下端から
     8pxしか離れていない**同じ白・同じ枠線・同じ幅**の箱として並び、
     吹き出しと1つの塊に見えていた。出口は会話の練習側(js/branches.js)が
     「意味と英文を見る」と同じ小さな文字リンクで持つ —— このカードは
     **見出しの行 / 本文** だけ。行を戻さないこと。 */
  const chevron = h('span', { class: 'tip-chevron', 'aria-hidden': 'true', text: '›' });
  /* ★2026-09-07 印(丸)は「並んだ何番目か」を言うための物。
     methodAccordion(根拠6項目)のように**複数が並ぶ時だけ**付ける。
     1件しか出ない所(Tips)では何も区別していないので付けない ——
     見出しと同じ事を2回言う飾りになる(見た目の文法7d と同じ理屈)。
     **`?` のような記号を印にしない**(見出しの「〜？」と二重になる)。 */
  const left = [h('span', { class: 'tip-toggle-title', text: title })];
  if (mark) left.unshift(h('span', { class: 'tip-icon', 'aria-hidden': 'true', text: mark }));
  const toggle = h(
    'button',
    { class: 'tip-toggle', type: 'button', 'aria-expanded': 'false' },
    [h('span', { class: 'tip-toggle-left' }, left), chevron]
  );
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    body.hidden = open;
    /* ★2026-09-07 開いた/閉じたを呼び出し側へ返す。会話の練習は、これで
       **丸い時計を止める**(Harumi報告「コツを読みながら他に音声が流れる」)。
       読む時間は人によって全く違うので、数え直す(restartCountdown)では
       足りない —— 読んでいる間は止め、閉じたら続きから動かす。 */
    if (onToggle) onToggle(!open);
  });
  return h('div', { class: 'tip-acc' }, [toggle, body]);
}

/* ★2026-09-07 「なぜ聞き取れない？」の中身の組み立て(Harumi指摘
   「カテゴリー・説明が改行も箇条書きでもなく非常に読みにくい」)。
   直す前は「聞こえ方＋【ラベル】説明【ラベル】説明…」を**1つの段落**に
   流し込んでいたので、ラベルが本文に埋もれて壁になっていた。

   ・**聞こえ方が主役**。この一言のために開くので、一番上に一番大きく
     (--text-lg)。上に添える「こう聞こえます」は --text-xs の静かな見出し。
   ・**理由は1件ずつの行**にする。ラベルは行の見出し(太字カテゴリ②)、
     説明はその下。行同士は --ink-hair の細い罫線で仕切る ——
     一覧の行と同じ形で、**新しい色・角・影は1つも足していない**
     (「区切り線を二重に引かない」の例外＝行同士を仕切る罫線)。
   ・【ラベル】が1つも無い古い形の文字列でも、そのまま1件として出す。 */
/* ★2026-09-29 Eat Outの tipAccordion(harmony-horizon)と同じ形にした
   ——【ラベル】をチップにして、説明文の**同じ段落の中**へそのまま流し込む
   (以前は「ラベル→改行→説明」の2行だったので、Harumi指摘「Tipsの
   カテゴリーを淡いバックグラウンドで囲ってある」の囲みが無いまま
   浮いて見えた)。1つの関数にまとめたのは、listeningBody/speakingTipsの
   2箇所が同じ<li>を別々に組み立てていて、直す時に片方だけ直る事故が
   起きやすいため(「同じ仕事をする画面は、必ず一緒に直す」)。 */
function tipListenLi(label, sentence) {
  return h('li', { class: 'tip-listen-item' }, [
    h('p', { class: 'tip-listen-text' }, [
      label ? h('span', { class: 'tip-listen-label', text: label }) : null,
      sentence,
    ]),
  ]);
}

function parseWhy(why) {
  const out = [];
  const re = /【([^】]+)】/g;
  let m;
  let label = null;
  let from = 0;
  while ((m = re.exec(why))) {
    if (label !== null) out.push([label, why.slice(from, m.index).trim()]);
    label = m[1];
    from = re.lastIndex;
  }
  if (label !== null) out.push([label, why.slice(from).trim()]);
  const kept = out.filter(([, t]) => t);
  if (kept.length) return kept;
  const plain = (why || '').trim();
  return plain ? [[null, plain]] : [];
}

function listeningBody({ heard, why }) {
  const wrap = h('div', { class: 'tip-listen' });
  if (heard) {
    wrap.appendChild(
      h('div', { class: 'tip-listen-heard' }, [
        h('span', { class: 'tip-listen-cap', text: copy.reveal.tipHeardLabel }),
        h('p', { class: 'tip-listen-kana', text: heard }),
      ])
    );
  }
  const rows = parseWhy(why);
  if (rows.length) {
    const list = h('ul', { class: 'tip-listen-list' });
    for (const [label, sentence] of rows) {
      list.appendChild(tipListenLi(label, sentence));
    }
    wrap.appendChild(list);
  }
  return wrap;
}

/* ★2026-09-29 スクロールの補助(HARU様承認・LP harmony-horizon-landing 9b3c040 の
   bringSayIntoView を写した)。自分の番で「なんかしら言った」を待つ間に、相手のセリフを
   開いたり「なぜ聞き取れない？」を開いたりすると、ボタンが画面の下へ押し出されて
   目が迷う。ボタンが画面の外なら、見える所まで下へ1本だけスクロールする。
   ・keepEl を渡した時(相手のセリフを開いた直後)は、スクロールすると keepEl の上端が
     画面の上から消えるなら**動かさない**(読んでいる文を優先)。
   ・コースに合わせた所: 下の限界は LP の innerHeight ではなく .tabbar の上端 − 12px
     (branches.js sayThenReveal の fold と同じ)。上の限界は sticky の .topbar /
     .listen-bar の下端 + 8px(LP は .site-header)。
   ・smooth。動きを減らす設定では 'auto'(revealNavRow と同じ)。 */
export function bringSayIntoView(sayRow, keepEl = null) {
  if (!sayRow || sayRow.hidden || !sayRow.firstChild) return;
  const r = sayRow.firstChild.getBoundingClientRect();
  // 会話の画面ではタブバーが隠れている(高さ0・top 0)ので、その時は画面の下端を使う。
  const bar = document.querySelector('.tabbar');
  const barRect = bar && bar.offsetParent !== null ? bar.getBoundingClientRect() : null;
  const limit = (barRect && barRect.height > 0 ? barRect.top : window.innerHeight) - 12;
  let topLimit = 0;
  for (const el of document.querySelectorAll('.topbar, .listen-bar')) {
    if (el.hidden || el.offsetParent === null) continue;
    topLimit = Math.max(topLimit, el.getBoundingClientRect().bottom);
  }
  topLimit += 8;
  if (r.top >= topLimit && r.bottom <= limit) return;
  const delta = r.bottom - limit;
  if (delta <= 0) return;
  if (keepEl && keepEl.getBoundingClientRect().top - delta < topLimit) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    window.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
  } catch (e) {
    window.scrollBy(0, delta);
  }
}

export function tipAccordion(tips, keys, opts = {}) {
  const stack = h('div', { class: 'tip-stack' });
  const labels = {
    word: copy.reveal.tipWord,
    grammar: copy.reveal.tipGrammar,
    pronunciation: copy.reveal.tipPronunciation,
    linking: copy.reveal.tipLinking,
    // ★2026-09-07 相手のセリフが「なぜ聞き取れないか」(会話の練習)。
    // 新しい部品は作らず、この一覧に1つ足すだけ。
    listening: copy.reveal.tipListening,
  };
  /* 印(W/G/P/L/?)は2026-09-07に外した。データ上ここに2件以上並ぶことは無く
     (`linking` と `listening` しか中身が無い)、印は何も区別していなかった。
     **戻さないこと** —— 2件以上並ぶ物を作る時は accordionItem に mark を渡す。 */
  const onToggle = typeof opts.onToggle === 'function' ? opts.onToggle : null;
  for (const key of keys) {
    const value = tips ? tips[key] : null;
    // {heard, why} で渡されたら箇条書きに組み立てる。文字列のままなら
    // 今までどおり1つの段落(発音Tipsの linking はこちら)。
    if (value && typeof value === 'object') {
      if (!value.why && !value.heard) continue;
      stack.appendChild(accordionItem({ title: labels[key], body: [listeningBody(value)], onToggle }));
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) continue;
    stack.appendChild(accordionItem({ title: labels[key], text, onToggle }));
  }
  stack.hasTips = stack.children.length > 0;
  return stack;
}

/* ★2026-09-08 自分が言う文の「言うときのコツ」(発音・つながる音)。
   Harumi指示「毎回クリックして開くのは面倒」「この発音の練習用の機会は
   自分が言う質問、自分が言う言葉を練習する場」——**タップで開く
   アコーディオンにしない**。英文が開いた瞬間(＝1回目で外した直後。
   「惜しい！」が出るのと同じ瞬間。または自分でタップして開いた時)に
   そのまま見える静的な一覧にする。

   ・**枠を持たない。** この一覧はカード(.card)の中に入るので、`.tip-acc` の
     ような枠付きの箱にすると「箱の中の箱」になる(CLAUDE.md「枠を持つ
     入れ物の中に、枠を持つ物を置かない」)。中身は「なぜ聞き取れない？」と
     **まったく同じ** `.tip-listen-list`(ラベル＋説明の行)で、
     **新しい色・角・影・様式は1つも足していない**。
   ・**発音と つながる音 を1つの並びにまとめる。** 【ラベル】がその行の
     種類を既に言っているので、見出しを2つ立てると同じ事を2回言うことになる
     (書き手側の分類は content/speaking.py の2列のまま)。
   ・相手のセリフの「なぜ聞き取れない？」(会話の練習)とは**別物**。
     あちらは聞き取りの謎解きでタップして開く任意のヒント、こちらは
     自分が言うためのコツで練習の核心 —— 隠す理由が無い。 */
export function speakingTips(tips) {
  const wrap = h('div', { class: 'say-tips' });
  const rows = [];
  for (const key of ['pronunciation', 'linking']) {
    const value = tips ? tips[key] : null;
    const why = value && typeof value === 'object' ? value.why : value;
    for (const row of parseWhy(typeof why === 'string' ? why : '')) rows.push(row);
  }
  wrap.hasTips = rows.length > 0;
  if (!wrap.hasTips) return wrap;
  wrap.appendChild(h('span', { class: 'tip-listen-cap', text: copy.reveal.tipSayCap }));
  const list = h('ul', { class: 'tip-listen-list' });
  for (const [label, sentence] of rows) {
    list.appendChild(tipListenLi(label, sentence));
  }
  wrap.appendChild(list);
  /* ★2026-09-29「発音解説は北米英語基準」の一言をここに毎回足していたが、
     ★2026-09-30 Harumi指摘「どこかみんな通るチュートリアルでいいんじゃ
     ない？常に書くんじゃなくて」で撤回。いまは「この練習の流れ」の橋
     (js/ui.js modeBridge。mimic/speakingのpronScope)に1回だけ出す。
     **ここには戻さないこと。** */
  return wrap;
}

// ※2026-09-09 削除: methodAccordion(Homeの「なぜこの練習法なのか」の
// 折りたたみ)。Harumi指示でHome末尾の教材の量・根拠の説明ごと削除した
// ため、呼び出し元が無くなった。accordionItem自体はtipAccordionが
// 引き続き使うので残す。復活させないこと。

// ---- 声・速さのトグル（毎回の再生ボタンの下）----
// harmony-horizon/eatout/listening/index.html の segControl/controlsRow の
// そのままの移植（クラス名も同じ .seg/.seg-btn/.controls-row）。
// 最初に1回だけ選ぶ画面はやめ、Eatoutと同じくここで毎回切り替えられる
// ようにした（Harumi指示 2026-08-17）。
//
// 声（男性/女性）は選ぶまでランダム、選んだらセッション中は保持される。
// 速さ（ふつう/ゆっくり）は画面が変わるたびに「ふつう」へ戻る
// （router.push() 側でリセットする。Eatoutは各画面の先頭で `rate = 1;`
// していたが、こちらは中央のrouterで一括してやる）。
function segControl(items, isSelected, onSelect) {
  const buttons = [];
  const seg = h('div', { class: 'seg', role: 'radiogroup' });
  items.forEach((item, i) => {
    const b = h(
      'button',
      { class: 'seg-btn', type: 'button', role: 'radio', 'aria-checked': String(isSelected(i)) },
      [h('span', { class: 'seg-label', text: item.label }), item.sub ? h('span', { class: 'seg-sub', text: item.sub }) : null]
    );
    b.addEventListener('click', () => {
      onSelect(i);
      buttons.forEach((o, j) => o.setAttribute('aria-checked', String(isSelected(j))));
    });
    buttons.push(b);
    seg.appendChild(b);
  });
  return seg;
}

// onChange は声・速さのどちらかが変わった直後に呼ばれる。再生中の音声を
// 新しい声/速さでその場で聞き直す処理を渡す（Eatoutと同じ「切り替えたら
// 即座に鳴り直す」挙動。押しただけで鳴らないと、変わったことに気づけない）。
//
// showVoice を false にすると、男性/女性トグルを出さない。相手役にも
// 女性の声ができた(2026-08-30 audio/partner-f)ため、現在は全画面で
// トグルを出している — 今後「片方の声しか無い音」を足す時だけ使う。
// ★2026-08-31 Harumi指摘「トグルを女性・ゆっくりにする時に自動に音が鳴る
// ように全てなってるのかなってないのか。なっているところがあるのであれば
// 全て同じように反応するように書いてください」。
// 以前は onChange を**画面ごとに渡す**形で、6画面のうち2つしか鳴らして
// いなかった(残り4つは `onChange: () => {}`)。同じ部品なのに反応が違う
// ので「押していいのか分からない」になっていた。
// → 鳴らし直しはこの部品の中でやる。画面側は何も渡さない＝忘れようがない。
//   鳴らすのは「その画面で最後に鳴った1本」(js/audio.js replayLastCue)。
//   まだ何も鳴っていない画面では静かに何もしない。
export function voiceSpeedControls({ showVoice = true } = {}) {
  const onChange = () => replayLastCue(playerState.rate);
  const wrap = h('div', { class: 'controls-row' });
  if (showVoice) {
    wrap.appendChild(
      segControl(
        [{ label: '女性の声' }, { label: '男性の声' }],
        (i) => (i === 1) === (playerState.voice === 'm'),
        (i) => {
          setVoice(i === 1 ? 'm' : 'f');
          if (onChange) onChange();
        }
      )
    );
  }
  wrap.appendChild(
    segControl(
      [
        { label: 'ふつう', sub: '1.0x' },
        { label: 'ゆっくり', sub: '0.7x' },
      ],
      (i) => (i === 1) === (playerState.rate === 0.7),
      (i) => {
        setRate(i === 1 ? 0.7 : 1);
        if (onChange) onChange();
      }
    )
  );
  return wrap;
}

const SLIDERS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="16" cy="16" r="2.2" fill="currentColor" stroke="none"/></svg>';
const CHEVRON_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

// 常時大きく出す毎回の切り替えは「毎回必ず使うもの」ではなく「必要な人だけ
// 調整する設定」（Harumi指示 2026-08-19: リピート画面に限って、⚙のような
// 小さいアイコンに畳み、タップした時だけ展開する）。中身は voiceSpeedControls
// をそのまま流用し、開閉の見た目だけをここで足す。
//
// 2026-08-30 Harumi指示「音声を聞ける場所に関しては、例外なく『男性』でも
// 『女性』でも聞けるチョイスを残してください」「全てのページで、すでに他の
// ページでは使われている『声・速さ』の小さなボタンを加えれば、いいのでは？」
// → 音が鳴る画面は例外なくこの形を1つ置く（大きい段組の
// voiceSpeedControlsを直接置く画面は無くした。見た目を1つに保つため、
// 新しく音を鳴らす画面を作る時もこちらを使うこと）。
// 対象: 言い方を選ぶ / 聞いて言う / 会話の練習(チャット) / 通し練習 /
//       シミュレーション / ★聞き逃したフレーズ / あなたのフレーズ /
//       フレーズを見る
// 中身は voiceSpeedControls と同じ。opts は showVoice だけを見る
// (onChange は受け取らない —— 鳴らし直しは部品側の仕事。上の注記参照)。
/* ---- §A-8 受話口からの復帰ボタン(js/audio.js recoverFromEarpiece) ----
   練習画面4つが全部これを通るので、ここに置けば1箇所で済む(「同じ仕事を
   する画面は、必ず一緒に直す」)。**マイクを使った後だけ**出す —— 受話口に
   回るのはその後だけで、前に出すと騒音になる。
   形は micPermissionBlock と同じ「1行の案内 + 白いボタン」。新しい部品は
   作らない。畳んだ設定の**外**に置く —— 聞こえなくて困っている人は
   「声・速さ」を開こうとは思わない。 */
/* opts.always … マイクを使っている最中の画面(AI英会話)は必ず出す。
   opts.onRecover … 押した時の中身を差し替える(既定は recoverFromEarpiece)。
   AI英会話は SDK の出口を作り直すので、アプリ側の Context を捨てる既定の
   動きは使えない(js/aiConversation.js §A-9)。 */
export function earpieceRecoveryBlock({ always = false, onRecover = null, compact = false } = {}) {
  if (!always && !micWasUsed()) return null;
  /* ★2026-09-02 Harumi「大きなボタンではなく、大きく邪魔にさせないように
     配置できませんか」。初版は幅いっぱいの白ボタン(.btn-outline)で、練習の
     主役より目立っていた。→ 行内の小さな操作用に。
     ★2026-09-04 compact: 練習画面では**「声・速さ」と同じ形・同じ大きさ**に
     して1本の帯に並べる(.settings-toggle)。問いかけの2行は既定では出さず、
     「鳴らなかった」とアプリが気づいた時だけ出す(下の showAudioStuckOnTools)
     —— **1つの部品に2つの状態**。押せる物を2つ作らないための形。 */
  const btn = h('button', {
    class: compact ? 'settings-toggle audio-fix' : 'btn-small',
    type: 'button',
    text: copy.audio.earpieceButton,
  });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if (onRecover) await onRecover();
      else await recoverFromEarpiece(playerState.rate);
    } catch {
      /* 直せなかった時も、ボタンは残す(何度でも押せる) */
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-alert');
    }
  });
  if (compact) return btn;
  return h('div', { class: 'earpiece-recovery' }, [
    h('p', { class: 'footnote pre-line', text: copy.audio.earpieceHint }),
    btn,
  ]);
}

/* ---- 画面に出ている「音の道具の帯」の名簿 ------------------------------
   ★2026-09-04 Harumi報告(実機)「『スピーカーから直す』あたりの部分が
   ぐちゃぐちゃしていて邪魔です」。数えると、音まわりの窓口が**3つ**あった:
   ①声・速さ ②「音が出てこない？/受話口から〜/スピーカーから直します」(5行)
   ③黒い札「音を出しなおす」(js/app.js の .audio-stuck)。
   ②と③は**同じ仕事(音の経路を作り直す)を、違う名前で2箇所**に置いていた。
   しかも②は `micWasUsed()`(セッション全体)が条件なので、最初のレッスンを
   終えた瞬間から**4つの練習画面すべてに永久に居座る家具**になっていた。

   直した形:
   ・②と③を1つに。画面に帯があれば**その帯が濃くなって**知らせ、黒い札は
     出さない(帯の無い画面 —— ★一覧など —— だけ従来どおり札に落ちる)。
   ・ふだんは押せる物1つだけ(問いかけの2行は出さない)。
   ・**この画面で1本でも鳴らすまで出さない**(onCuePlayed)。まだ鳴らして
     いない人に「直します」は意味が無い。 */
let audioTools = [];
let cueHookInstalled = false;
function liveAudioTools() {
  audioTools = audioTools.filter((t) => t.root.isConnected);
  return audioTools;
}
function registerAudioTools(entry) {
  audioTools.push(entry);
  if (cueHookInstalled) return;
  cueHookInstalled = true;
  onCuePlayed(() => {
    for (const t of liveAudioTools()) t.reveal();
  });
}
/* js/app.js の setStuckHandler から呼ぶ。帯があれば true(=黒い札は出さない)。 */
export function showAudioStuckOnTools(stuck) {
  const live = liveAudioTools();
  if (!live.length) return false;
  for (const t of live) {
    t.reveal();
    t.fixBtn.classList.toggle('is-alert', !!stuck);
    t.hint.hidden = !stuck;
  }
  return true;
}

export function collapsibleVoiceSpeedControls(opts = {}) {
  const wrap = h('div', { class: 'settings-collapsible' });
  const panel = h('div', { class: 'settings-panel', hidden: true }, [voiceSpeedControls(opts)]);
  const toggle = h(
    'button',
    { class: 'settings-toggle', type: 'button', 'aria-expanded': 'false' },
    [
      svgIcon(SLIDERS_ICON, 'settings-toggle-icon'),
      h('span', { class: 'settings-toggle-label', text: copy.audio.settingsLabel }),
      svgIcon(CHEVRON_ICON, 'settings-toggle-chevron'),
    ]
  );
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });
  /* ★2026-09-04 道具は**1本の帯**にまとめる。「声・速さ」と「スピーカーから
     直します」は同じ性質(練習の内容ではなく、音の道具)なので、同じ形・同じ
     大きさで横に並べる —— 形で「ここは道具の列」と伝わり、本文の邪魔をしない。
     ※「1つの行に押せる物を2つ置かない」(2026-08-31)は**一覧の行**の話で、
     主役と脇役の役割が逆転していたのが問題だった。ここは同じ重さの道具が
     2つ並ぶ道具列なので当たらない。どちらを押しても迷う余地が無い。 */
  const row = h('div', { class: 'audio-tools-row' }, [toggle]);
  wrap.appendChild(row);
  const fixBtn = earpieceRecoveryBlock({ compact: true });
  if (fixBtn) {
    row.appendChild(fixBtn);
    const hint = h('p', { class: 'footnote pre-line audio-fix-hint', text: copy.audio.earpieceHint, hidden: true });
    wrap.appendChild(hint);
    // この画面でまだ1本も鳴っていない間は出さない(鳴らした瞬間に出る)。
    fixBtn.hidden = !hasLastCue();
    registerAudioTools({
      root: wrap,
      fixBtn,
      hint,
      reveal() {
        fixBtn.hidden = false;
      },
    });
  }
  wrap.appendChild(panel);
  return wrap;
}

// ---- 下部の「＜ 戻る／次へ ＞」----
// harmony-horizon/eatout/listening/index.html の navRow() の移植
// （Harumi指示 2026-08-17: 「戻る」がヘッダー上部だけだと見にくい・
// 押しにくいので、Eatoutと同じく画面の下にも「次へ」と並べて置く。
// 記号は矢印(←→)ではなく山括弧(＜＞)がEatoutの定番）。
// ヘッダー上部の「戻る」はこの下部ボタンと重複するため出さない
// （Home画面だけの「← Homeに戻る」は別物なので残る。renderScreenHead参照）。
/* ★2026-09-29 「戻る」は、直前に見ていた画面へ(タブをまたいでも)。
   Harumi報告「間違えて学ぶを押したら相づちに移動した。戻るを押しても
   戻れない」。タブを押した直後の「戻る」だけ、js/app.js が渡す関数
   (backInterceptor)が先に受け取り、元のタブ・元の画面へ帰す。
   受け取らなかった時(ふつうの「戻る」)は、その画面の onBack がそのまま動く。
   「戻る」はすべて navRow / backRow を通るので、ここ1箇所で全画面に効く。 */
let backInterceptor = null;
export function setBackInterceptor(fn) { backInterceptor = fn; }
const guardedBack = (onBack) => (e) => {
  if (backInterceptor && backInterceptor()) return;
  if (onBack) onBack(e);
};

export function navRow({ onBack, onNext, backLabel, nextLabel, nextDisabled, nextClass } = {}) {
  const row = h('div', { class: 'nav-row' });
  row.appendChild(
    h('button', { class: 'btn-outline', type: 'button', 'data-back': '', text: backLabel || copy.navBack, onClick: guardedBack(onBack) })
  );
  row.appendChild(
    h('button', {
      class: nextClass || 'btn-primary',
      type: 'button',
      text: nextLabel || copy.navNext,
      disabled: !!nextDisabled,
      onClick: onNext,
    })
  );
  return row;
}

// 決まった瞬間に「＜戻る／次へ」を画面の中へ運ぶ。
// Harumi報告 2026-08-31「どこクリックすれば次に行けるの？」——「進む」は
// 本文の末尾(タブの上)という置き場所は正しいが(CLAUDE.md「画面の置き場所」4)、
// 中身が画面より縦に長い画面ではスクロールしないと見えない。選び終えた
// 瞬間は目線が動く場所が要るので、そこで運ぶ。
// ※新しいボタン・新しい様式は足していない。既にある nav-row を見せるだけ。
export function revealNavRow(nav) {
  if (!nav || typeof nav.scrollIntoView !== 'function') return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    nav.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  } catch (_) {
    nav.scrollIntoView(false);
  }
}

/* ★2026-09-24 micPermissionBlock(マイクの許可を取り直すブロック)を削除した。
   Harumi指示「発音チェックは、やめようと思います」——呼んでいたのは
   js/earToVoice.js のマイク分岐1箇所だけで、その分岐ごと消えた。
   **復活させないこと。** AI英会話のマイクは ElevenLabs の SDK が開くので、
   ここは通らない(あちらの受け皿は js/aiConversation.js の中にある)。
   ※受話口の復帰(earpieceRecoveryBlock)は**別物**。あちらは §A-8 の
   必須ルールで機械検査(ルール21)にも入っているので、消さないこと。 */


/* 完了画面の「次は「◯◯」です。」——押す物のすぐ上で行き先の名前を言う行
   (js/lesson.js / js/phraseBank.js / js/reactionDrill.js が共有)。
   ★2026-09-06 Harumi質問「注目を引く演出、プロならどうする？」に対する
   答え。絵文字・点滅・新しい色は足さない —— 「絵文字をUIに使わない」
   (見た目の文法5)と「重要な一度きりの気づきは、色・太字ではなく順番で
   重みを出す」の精神に沿う。ただしこの行は**一度きりの注意書き**ではなく
   **行き先を名指しするラベル**なので、「太字は3つだけ」の②(見出し・
   ラベル)がそのまま当てはまる —— 文全体ではなく、行き先の名前だけを
   太字にする(「次は」「です。」は読む文のまま)。名前だけ重みが違うと、
   文を読まなくても名前だけが目に入る——**新しい様式を1つも足さずに
   済む**唯一の方法だったので、これを採用した。
   `template`は`copy.practice.doneNextLead`('次は「{name}」です。')の
   ように`{name}`を1つ含む文字列。呼び出し側で`fmt()`は使わない
   (fmtは文字列を1本返すだけで、名前だけを別要素にできないため)。 */
/* ★2026-09-28 文の中の {{…}} だけを蛍光ペン(.lead-mark)にする。
   Harumi指示「「日本語で書かれたセリフ」にハイライト。重要なので」。
   文全体を太くしない(「読む文には太字を付けない」)——大事な語だけに印を付ける。
   {{ }} を含まない文は、そのまま地の文の段落になる。 */
export function markedLead(text, className = 'body-text pre-line') {
  // ★2026-09-29 className: .note の中では '' を渡す(.note p の大きさ・pre-line に従う)。
  const parts = String(text).split(/\{\{(.+?)\}\}/);
  return h('p', { class: className },
    parts.map((t, i) => (i % 2 ? h('span', { class: 'lead-mark', text: t }) : t)));
}

export function leadWithBoldName(template, name) {
  const [before, after] = template.split('{name}');
  return h('p', { class: 'body-text pre-line' }, [before, h('span', { class: 'lead-name', text: name }), after]);
}

// 「次へ」相当のボタンが無い画面(選択肢そのものが次へを兼ねる、など)でも、
// 「戻る」だけは同じ見た目で下に置けるようにする。
export function backRow({ onBack, backLabel } = {}) {
  return h('div', { class: 'nav-row is-back-only' }, [
    h('button', { class: 'btn-outline', type: 'button', 'data-back': '', text: backLabel || copy.navBack, onClick: guardedBack(onBack) }),
  ]);
}

/* 「今日はここまでにする/今日の練習を完了する」を選んだ直後に、Homeの
   全モジュール一覧へ直接落とさず、今日やった事と次の一手を見せる
   締めくくり画面(js/lesson.js / js/phraseBank.js / js/reactionDrill.js が
   共有)。Harumi指摘 2026-09-09「辞めた人が、ここまで進んだ。達成感。
   次戻ってくる意味を見出せるために、１ページ足すと全然効果が違うと
   思います。一覧が出てしまうと、あぁ、まだこんなに進んでないんだぁ、が
   目に入ります。その代わりに、今日はこれをカバーしました。次は、これを
   カバーしましょう、の方が100倍よくないですか？」。

   新しい部品・色・様式は足していない —— 既存の`leadWithBoldName`・
   `primaryStopButton`・`backRow`をそのまま並べるだけ。呼び出し側は
   「次に進める場所(next)がある時だけ」この画面を呼ぶ —— 全部終えて
   次が無い時(allDoneの完了画面・復習で開き直した回)は「次はこれを
   カバーしましょう」が言えないので、今までどおりHomeへ直接戻す。

   紙吹雪は鳴らさない —— 直前の完了画面で既に鳴っている
   (「紙吹雪が戻るたびに出ると『またか』になる」と同じ理由)。

   戻り値: 'back'(1つ前の完了画面へ) | undefined(Homeへ進む)。 */
export function stepDailyClosing(router, { justDidName, nextName }) {
  return new Promise((resolve) => {
    router.push({
      eyebrow: copy.practice.closingEyebrow,
      render(body) {
        body.appendChild(
          h('h2', { class: 'screen-title is-hero', text: fmt(copy.practice.closingCovered, { name: justDidName }) })
        );
        // ★2026-09-09 お祝いの写真。HARU様が用意するまでは
        // sceneHolder(「写真がここに入ります」)がそのまま出る
        // (sceneImage()の既定の壊れ方——「写真・音声の拡張子」ルール参照)。
        body.appendChild(sceneImage({ src: 'images/celebrate-01.jpg', situation: copy.practice.closingEyebrow }));
        body.appendChild(leadWithBoldName(copy.practice.closingNextLead, nextName));
        body.appendChild(h('p', { class: 'closing-farewell', text: copy.practice.closingFarewell }));
        body.appendChild(h('div', { class: 'btn-row' }, [
          primaryStopButton(copy.practice.closingToHome, () => resolve()),
        ]));
        body.appendChild(backRow({ onBack: () => resolve('back') }));
      },
    });
  });
}

// ---- 状況写真（画面①）----
// 写真はまだ1枚も無い。あとから images/ に置けば、そのまま写真に変わる。
// 無い間は、その場所に何が入るのかが分かる札を出す —— 割れた画像アイコンを
// 出すと「壊れている」に見えるし、ただの灰色の箱だと何が抜けているのか
// 誰にも分からない。写真の指示（content/scenes.py の2つ目）をそのまま見せる。
export function sceneImage({ src, brief, situation }) {
  const holder = h('div', { class: 'scene-holder' });

  const showPlaceholder = () => {
    clear(holder);
    holder.classList.add('is-empty');
    // 📷絵文字は撤去(CLAUDE.md「見た目の文法」5: 絵文字をUIに使わない。
    // Harumi指摘 2026-08-30「このページ統一感ない」)。
    holder.appendChild(h('p', { class: 'scene-holder-label', text: '写真がここに入ります' }));
    if (brief) holder.appendChild(h('p', { class: 'scene-holder-brief', text: brief }));
  };

  if (!src) {
    showPlaceholder();
    return holder;
  }
  // ★2026-09-03 拡張子は .jpg 固定にしない(Harumi報告「not jpeg」——
  // 画像生成の道具が返すのは たいてい PNG)。台本(scenes.py)には
  // images/xxx-01.jpg と書いてあるが、**置かれたファイルの方に合わせる**:
  // .jpg が無ければ .png → .webp の順に試し、どれも無い時だけ札を出す。
  // 「拡張子を .jpg に直してから置いてください」という**人力の注意で
  // 済ませない**(CLAUDE.md「使い方を説明する文を足す前に、部品の方を直す」)。
  // ★2026-09-25 assetUrl() を通す。画面(index.html)がどこにあっても
  // speakup/images/ を指す(audio.js の ASSET_BASE 参照)。
  const candidates = [assetUrl(src)];
  for (const ext of ['png', 'webp', 'jpeg']) {
    const alt = assetUrl(src.replace(/\.(jpg|jpeg|png|webp)$/i, '.' + ext));
    if (alt !== candidates[0] && !candidates.includes(alt)) candidates.push(alt);
  }
  const img = h('img', { class: 'scene-image', alt: situation || '' });
  let tried = 0;
  img.addEventListener('error', () => {
    tried += 1;
    if (tried < candidates.length) img.src = candidates[tried];
    else showPlaceholder();
  });
  img.src = candidates[0];
  holder.appendChild(img);
  return holder;
}

/* はじめの案内(js/onboarding.js)の絵の枠。★2026-09-25
   Harumi指示「**動画は後で加えます。動画を入れる場所を確保しといて**」。

   ★「置いたら、こちらもコードを直します」という**人の約束にしない**
     (CLAUDE.md「写真・音声の拡張子を人に合わせさせない」と同じ考え方)。
     `video/<名前>.mp4` が置かれた瞬間に動画へ、無ければ写真
     (`images/<名前>.jpg`。拡張子は sceneImage が合わせる)、どちらも
     無ければ今までの「写真がここに入ります」の札。**3段とも自動。**
   ★写真(または札)を**先に**出す。在るかの問い合わせを待ってから描くと、
     動画を置いていない間は毎回そのぶん白く待つことになる。
   ★在るかの確かめ方は HEAD。動画の preload は端末差が大きく、
     「読めたかどうか」の合図に使えない(Eat Out の photoOrVideoEl と同じ)。
   ★iOSで勝手に動き出す条件は **src を入れる前に**そろっている必要がある
     (muted / playsinline / autoplay を**属性で**先に付ける)。あとから
     プロパティで足しても間に合わず、静止画になる —— Eat Out で実際に
     起きた事故。**この順番を入れ替えないこと。** */
export function onbVisual(name, { loop = true } = {}) {
  const box = h('div', { class: 'onb-visual' });
  box.appendChild(sceneImage({ src: `images/${name}.jpg`, situation: '' }));
  const src = assetUrl(`video/${name}.mp4`);
  try {
    fetch(src, { method: 'HEAD' })
      .then((r) => {
        if (!r || !r.ok || !box.isConnected) return;
        const holder = h('div', { class: 'onb-video-holder' });
        const v = document.createElement('video');
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        v.setAttribute('autoplay', '');
        if (loop) v.setAttribute('loop', '');
        v.muted = true;
        v.setAttribute('preload', 'auto');
        v.src = src;
        /* 読めない動画(壊れている・形式が違う)で**黒い箱**を残さない。
           写真(または札)に戻す —— 置いた人が気づけるように、画面は
           必ず「何か」を見せる。 */
        v.addEventListener('error', () => {
          clear(box);
          box.appendChild(sceneImage({ src: `images/${name}.jpg`, situation: '' }));
        });
        holder.appendChild(v);
        clear(box);
        box.appendChild(holder);
        const kick = () => { try { v.play(); } catch { /* 静かに諦める */ } };
        kick();
        /* 動かない端末では、指で触った中でもう一度だけ起こす。
           押す物は増やさない(画面のどこを触っても効く・1回きり)。 */
        const onGesture = () => {
          document.removeEventListener('touchend', onGesture, true);
          document.removeEventListener('click', onGesture, true);
          kick();
        };
        setTimeout(() => {
          if (!box.isConnected || v.ended || (v.currentTime > 0.1 && !v.paused)) return;
          document.addEventListener('touchend', onGesture, true);
          document.addEventListener('click', onGesture, true);
        }, 1200);
      })
      .catch(() => {});
  } catch { /* 取りに行けない端末では写真のまま */ }
  return box;
}

/* ★2026-09-30 Harumi報告(実機)「動画がロードする時間がかかって遅い」。
   onbVisual() は今の画面の動画を**その画面に来てから**取りに行くので、
   ①(opening.mp4。5本の中で一番重い・約1.1MB)は必ず1回、待ちが出る。
   一言を読んでいる間は手が空くので(★2026-10-02 問いは一言と同時に出すようにしたが、
   読んで答えるまでの間は同じ)、その間に**次の画面の動画**をキャッシュへ運んでおく(preloadImages()と
   同じ考え方 —— 「読めるかどうか」を確かめる onbVisual 本体のHEADとは
   別物で、こちらはただ先に取りに行くだけなので、無くても静かに諦める)。 */
export function preloadVideo(name) {
  if (!name) return;
  try {
    fetch(assetUrl(`video/${name}.mp4`)).catch(() => {});
  } catch { /* 取りに行けない端末では何もしない */ }
}

// ★2026-09-05 Harumi質問「写真を小さくしたらすぐ出ますか」への回答の一部。
// 圧縮(バイト数を減らす)は限りがある(1回あたり10〜15%程度)ので、音声と
// 同じ「使う前にメモリ/ブラウザキャッシュへ先に置いておく」を写真にも足す
// (CLAUDE.md「音は『メモリに置いてから』鳴らす」と同じ考え方)。
// new Image().src へ入れるだけで、ブラウザが裏でHTTP/Service Workerの
// キャッシュへ取り込む。実際に<img>へ同じURLを出す時は、そこから
// 一瞬で出る。同じURLへ何度呼んでも、ブラウザが自分で二重取得を避ける
// ので安全(sceneImage() 側の .png/.webp 探しは再現しない —— これは
// あくまで「先読みのヒント」で、404になっても実害は無い)。
export function preloadImages(urls) {
  const seen = new Set();
  (urls || []).filter(Boolean).forEach((src) => {
    if (seen.has(src)) return;
    seen.add(src);
    const img = new Image();
    // ★2026-09-25 先読みも assetUrl() を通す(画面がどこにあっても
    // speakup/images/ を指す)。通さないと、アプリを /speakup/app/ へ
    // 移した日から **先読みだけ静かに404**になり、写真が出るのが遅い
    // まま誰も気づかない。
    img.src = assetUrl(src);
  });
}

/* ★2026-09-28 モードの橋(練習に入る前の1枚)。js/lesson.js から移した。
   Harumi指示「**やってから理解するではなく、やる前にやることを理解してから
   練習に入る**」——場面の会話は、写真を見て・日本語を読んで・英語で3回言って・
   相手の英語を聞いて・意味を選ぶ、と**4〜5つのことを同時に**させている。
   何が出てくるか知らずに入ると、その場で理解するプレッシャーが全部のしかかる。

   ・その周の初回だけ(firstTime)、「何をする」→「この練習の流れ」(番号つきの
     手順)→「なぜ？」を出す。2回目からは見出し＋地図＋始めるだけ。
   ・手順の番号の帯は、はじめの案内の「1 聞く / 2 分かる / 3 声にする」
     (.onb-flow-row / .onb-flow-n)と同じ見た目。新しい色・様式は無し。
     ただし手順は**読む文**なので太字にしない(.bridge-flow-text)。
   ・手順は画面で実際に起きる順番どおりに書く。画面を変えたら、ここも直す。
   ・`key` は firstTime の id(レッスンid など)。「戻る」で同じ橋に来た時は
     長い版のまま。
   resolveの値: 'start'(進む) | 'back'(1つ前へ)。 */
/* 「この練習の流れ」(見出し＋番号の手順)。流れのページ(modeBridge)と、
   相槌の「なぜ」のページ(js/aizuchi.js stepAizuchiIntro)が同じ物を使う
   (★2026-09-29 相槌②に流れの説明が無かったので、読み物の一番下に足した)。 */
export function bridgeFlowBlock(mode) {
  const c = copy.bridge[mode];
  const flow = h('ol', { class: 'bridge-flow' });
  (c.flow || []).forEach((t, i) => {
    flow.appendChild(
      h('li', {}, [
        h('span', { class: 'onb-flow-n', text: String(i + 1) }),
        // {{…}} は蛍光ペン(markedLead と同じ書き方)。無ければ地の文のまま。
        h('span', { class: 'bridge-flow-text' }, String(t).split(/\{\{(.+?)\}\}/).map((x, i) => (i % 2 ? h('span', { class: 'lead-mark', text: x }) : x))),
      ])
    );
  });
  return h('div', { class: 'bridge-flow-block' }, [
    h('p', { class: 'bridge-flow-head', text: copy.bridge.flowHead }),
    flow,
  ]);
}

/* ★2026-09-29 「この練習の流れ」を出すかどうか —— **生まれて初めての1回だけ**
   (Harumi決定)。同じ練習の中で「戻る」で橋へ帰ってきた時は、同じ id なので
   もう一度出す(戻る先が消えないように)。別の練習(別の id)ではもう出ない。 */
const bridgeShownNow = {};
export function bridgeFirstEver(mode, id) {
  if (mode in bridgeShownNow) return bridgeShownNow[mode] === id;
  if (hasSeenBridge(mode)) { bridgeShownNow[mode] = null; return false; }
  bridgeShownNow[mode] = id;
  markBridgeSeen(mode);
  return true;
}

/* ★2026-09-30 「使い方をもう一度見る」(js/guide.js replayGuides)。流れの印を
   外し、このセッションの覚え書きも消す(残すと、同じセッションではもう出ない)。 */
export function forgetBridge(mode) {
  delete bridgeShownNow[mode];
  forgetBridgeSeen(mode);
}

/* ★2026-09-30 flow: 「この練習の流れ」の中身を差し替える時の作り手(関数)。
   会話の練習だけ、文字の手順ではなく動くお手本(js/guide.js simDemoBlock)。
   ui.js から guide.js を import すると輪になるので、呼ぶ側(lesson.js)が渡す。 */
export function modeBridge(router, { mode, key, eyebrow, progress, flow }) {
  const c = copy.bridge[mode];
  return new Promise((resolve) => {
    router.push({
      eyebrow,
      progress,
      render(body) {
        body.appendChild(h('h2', { class: 'screen-title', text: c.title }));
        if (firstTime('bridge-' + mode, key)) {
          body.appendChild(
            h('div', { class: 'bridge-msg' }, [
              h('p', { class: 'bridge-line', text: c.what }),
              typeof flow === 'function' ? flow() : bridgeFlowBlock(mode),
              // 「なぜ？」は持っている練習だけ(会話を1本通す は 2026-09-30 に外した)。
              c.why ? h('div', { class: 'bridge-why' }, [
                h('p', { class: 'bridge-why-head', text: copy.bridge.whyHead }),
                markedLead(c.why, 'bridge-why-text'),  // {{…}} を蛍光ペンに(無ければ地の文のまま)
              ]) : null,
              /* ★2026-09-30 Harumi指摘「どこかみんな通るチュートリアルでいい
                 んじゃない？常に書くんじゃなくて」。以前は聞き取り/発音Tipsが
                 出るたびに毎回「※発音解説は北米英語の発音を基準にしています」
                 を添えていたが、この橋(初めて入った1回だけ出る画面)へ1本
                 まとめた。pronScopeを持つ橋(mimic・speaking)にだけ出る。 */
              c.pronScope ? h('p', { class: 'tip-scope', text: copy.reveal.tipScope }) : null,
            ])
          );
        }
        // ★2026-09-29 地図は Home の1枚だけ。流れのページにも出さない。
        body.appendChild(
          navRow({
            onBack: () => resolve('back'),
            onNext: () => resolve('start'),
            nextLabel: copy.bridge.go,
          })
        );
      },
    });
  });
}
