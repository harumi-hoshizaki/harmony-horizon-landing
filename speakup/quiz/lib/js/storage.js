// EAR TO VOICE — Talk to a Visitor
// localStorage layer. All keys are prefixed etv.talk. per SPEC.md section 9.
// Saving is automatic everywhere — never ask the learner "保存しますか？".

const PREFIX = 'etv.talk.';
const SCHEMA_VERSION = 1;

// Whether reaching a lesson/My Book/Confidence Check requires a purchased
// unlock. Nothing in the app currently sits behind a purchase gate —
// simulation and AI conversation both dropped theirs too (Harumi指示
// 2026-08-28「このページも削除。購入した人しか使えません」). Flip this to
// true if HARU decides to put the app behind purchase again.
export const REQUIRE_PURCHASE_FOR_LESSONS = false;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[storage] failed to read', key, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[storage] failed to write', key, err);
    return false;
  }
}

export function initSchema() {
  const current = readJSON('schema_version', null);
  if (current === null) writeJSON('schema_version', SCHEMA_VERSION);
}

// ---- My Book ----

export function getMyBook() {
  return readJSON('mybook', []);
}

function saveMyBook(entries) {
  writeJSON('mybook', entries);
}

/* ★2026-09-06 記録の鍵は「フレーズのid」だけでは足りない —— **レッスンの
   idと対**で1件を決める。
   レッスンの「言い方」のidは全38レッスンで `op1` / `op2` / `op3` の**3種類
   しか無い**(データを数えた: op1×38・op2×37・op3×27)。idはレッスンの中で
   1・2・3番目を指す番号で、レッスンを跨いで一意ではない。
   ところが記録側は `phraseId` だけで1件を探していたので、2本目のレッスンを
   練習しても**1本目の記録が見つかってしまい、新しい行が増えなかった** ——
   「フレーズ」タブにレッスンの文が**最大3件しか貯まらない**状態だった
   (2026-09-06にHarumi様へ報告して判明。今回の変更より前からある不具合)。
   聞き返す・相槌のフレーズ(`az-nice` 等)は元から一意で、どちらも
   scenarioId が null なので、この対で比べても今までどおり動く。
   **データ側のidは変えていない** —— `findPhraseById(scenario, phraseId)` が
   「そのレッスンの中の op1」を引く形なので、idを変えると引けなくなる。
   鍵の作り方だけを1箇所(この関数)に集める。 */
/* ★2026-09-06 会話の途中の返し(RP)だけは、**レッスンを跨いで1行**にまとめる。
   Harumi承認「英文ごとまとめるに賛成です」。
   返しは `pool.json` の**全レッスン共通のプール**で、id(`RP32` 等)は
   その中で一意 —— 同じ `No problem!` が7箇所で使われても、覚える英文は
   1つなので、レッスンごとに7行に増やす意味が無い(数えた: 延べ167回 /
   実数57本。対で持つと一覧が約215行、まとめると約107行)。
   **レッスンの「言い方」(`op1`〜`op3`)は今までどおり対のまま** ——
   あちらのidはレッスンの中の1・2・3番目を指す番号で、跨ぐと一意でない。
   `scenarioId` は**最初に練習したレッスン**が入ったまま残るので、
   一覧の行をタップした時の行き先(js/mybook.js goToSource)はそのまま効く。 */
const isPoolReply = (phraseId) => /^RP\d+$/.test(phraseId || '');

const sameEntry = (e, phraseId, scenarioId) =>
  e.phraseId === phraseId &&
  (isPoolReply(phraseId) || (e.scenarioId || null) === (scenarioId || null));

/* ★2026-09-06 Harumi決定「★を消していい」——`toggleStarred()`(一覧の☆)を
   削除した。2026-09-05に発音チェックが全画面から外れ、★を自動で付ける道
   (下の savePracticeResult の speechAvailable)が1本も通らなくなっていたので、
   ★は「自分で☆を押した物」しか意味しなくなっていた ——「言えなかった
   フレーズ」という名前と中身が食い違う(CLAUDE.md「入口のボタン名と、開いた
   先の中身を一致させる」)。**復活させないこと。**
   端末に残っている `starred` は消さない —— 読みも書きもしなくなるので害は
   無く、消す処理を足すと万一戻したくなった時に戻せない
   (CLAUDE.md「やめた機能は、コードから消えるまで やめたことにならない」3)。
   ※`js/phraseIndex.js` の★(聞き取れなかった)は別の記録
   (`markMissedListening()`)で、いまも自動で付く。**そちらは消していない。** */

// 練習を1つ終えた時の記録。**練習したフレーズを1件ずつ残すだけ。**
//
// ★2026-09-06 Harumi決定「★を消していい」——ここで★(`starred`)を
// 付け外ししていた処理を削除した。2026-09-05に発音チェックが全画面から
// 外れたので `speechAvailable` は常に false で、★が付く道はもう無かった
// (=飾りとして残っていただけ)。**復活させないこと。**
// ★2026-09-24 引数 `passed`/`speechAvailable` も削除した(発音チェックの廃止)。
// 判定する画面が1つも無いので、常に false の値を受け取り続ける理由が無い。
export function savePracticeResult({ phraseId, en, ja, scenarioId }) {
  if (!phraseId) return getMyBook();
  const book = getMyBook();
  // 鍵は phraseId 単独ではなく (phraseId, scenarioId) の対。上の sameEntry 参照。
  let entry = book.find((e) => sameEntry(e, phraseId, scenarioId));
  if (!entry) {
    entry = {
      phraseId,
      en: en || '',
      ja: ja || '',
      scenarioId,
      addedAt: new Date().toISOString(),
    };
    book.push(entry);
  }
  saveMyBook(book);
  return book;
}

/* ★2026-09-08 保存済みの本文(en/ja)を、いまの台本の文に入れ替える時だけ使う。
   `savePracticeResult()` は**既にある行の en/ja を書き換えない**作りなので、
   台本の英文が変わると、その行は**古い英文を持ったまま**残る ——
   ところが行の▶は `findPhraseById()` で**いまの音声**を引くので、
   「表示は古い文・鳴るのは新しい文」という食い違いになる。
   実例(Harumi報告 2026-09-08「It was nice talking to you. が2回出てくる」):
   その英文は i-close-1 の言い方だったが、2026-09-07に I-CLOSE-5 として
   独立し、i-close-1 側は別の英文に変わった。両方を練習した端末には
   **同じ英文の行が2つ**並んで見えていた(片方は化石)。
   入れ替えを決めるのは `js/mybook.js loadPracticedPhrases()` の1箇所だけ
   —— そこは台本(プール・レッスン)を読み込んでいるので、いまの文が引ける。
   **行は消さない**(記録を黙って落とさない。CLAUDE.md「やめた機能は…」3)。 */
export function replaceMyBook(entries) {
  saveMyBook(Array.isArray(entries) ? entries : []);
  return getMyBook();
}

export function entriesForScenario(scenarioId) {
  return getMyBook().filter((e) => e.scenarioId === scenarioId);
}

// ---- 聞き逃した（リスニングの聞き取りミス） ----
// 「★ 聞き逃したフレーズ」画面は、以前はConfidence Check(スピーキングの
// 言えなかった)のstarredを流用していたが、「聞き取れなかった」とは
// 別物だとHarumi指摘 2026-08-20で判明。ここは独立した記録にする —
// 「相手のひとことを聞く」画面(js/branches.js stepHearPartner)で
// 「意味を見る」を押した実際の行動そのものを、聞き取れなかった合図
// として使う（新しい確認UIを足さず、既存の行動から拾う）。
export function markMissedListening(scenarioId) {
  if (!scenarioId) return;
  const ids = readJSON('missedListening', []);
  if (!ids.includes(scenarioId)) {
    ids.push(scenarioId);
    writeJSON('missedListening', ids);
  }
}

export function getMissedListeningScenarios() {
  return readJSON('missedListening', []);
}

/* ★2026-09-28 削除: exportMyBookJSON()。フレーズタブ末尾のバックアップ保存
   UI(js/tabs.js phrasesTabDescriptor参照)をHarumi指示で丸ごと外した時に、
   この関数を呼ぶ場所が無くなった。**復活させないこと** —— 復活させたく
   なったら、まずHarumi様に確認してから。importMyBookJSON()は別の判断
   (下のコメント参照)で残したままにしてあるので、混同しない。 */

// Merges an imported book into the current one, deduped by phraseId.
// Returns { ok, count } — never throws; a malformed file is reported, not
// crashed on.
//
// 「読み込む」のUIはmybook.jsから削除済み（Harumi指示 2026-08-19）。この
// 関数自体は復活させたくなった時のために残してある。
export function importMyBookJSON(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, count: 0 };
  }
  const incoming = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.mybook) ? parsed.mybook : null;
  if (!incoming) return { ok: false, count: 0 };

  const book = getMyBook();
  let count = 0;
  for (const item of incoming) {
    if (!item || typeof item.phraseId !== 'string') continue;
    // 重複の判定も (phraseId, scenarioId) の対で(上の sameEntry と同じ理由)。
    const existing = book.find((e) => sameEntry(e, item.phraseId, item.scenarioId));
    // ★2026-09-06: 既にある行には何もしない(以前は starred を寄せていたが、
    //   ★を削除したので寄せる物が無い)。古いバックアップの starred も読まない。
    if (!existing) {
      book.push({
        phraseId: item.phraseId,
        en: item.en || '',
        ja: item.ja || '',
        scenarioId: item.scenarioId || '',
        addedAt: item.addedAt || new Date().toISOString(),
      });
    }
    count++;
  }
  saveMyBook(book);
  return { ok: true, count };
}

// ---- Onboarding ----
// 初回起動時だけ、軽い説明を1枚見せる（Harumi指示 2026-08-19）。
// 一度見たら二度と出さない。

/* ★2026-09-30 合言葉(api/speakup/pass.js)を一度通した端末の印。
   2回目からは聞かない。 */
export function hasPass() {
  return readJSON('passOk', false) === true;
}
export function setPassOk() {
  writeJSON('passOk', true);
}

export function hasSeenOnboarding() {
  return readJSON('onboardingSeen', false) === true;
}

export function markOnboardingSeen() {
  writeJSON('onboardingSeen', true);
}

/* ★2026-09-25 はじめの案内が5枚になった(Harumi指示「このEatoutの5つの
   ページをSpeak upにも加えて」)ので、**どこまで進んだか**を覚える。
   iOSは「ホーム画面に追加」のあと別の入れ物で開き直すので、途中で
   切れることがある —— 1枚終えるごとに書いておけば、切れた所から続く。
   Eat Out(eatout/listening/index.html の onboardStep)と同じ考え方。
   値: 'opening' | 'paper' | 'translate' | 'want' | 'install' | 'ready' | 'done'
   `onboardingSeen` は**通し終えた印**で、こちらは**途中の栞**。2つの
   役目を1つの鍵にまとめない(まとめると、途中で閉じた人が二度と
   最初の1枚に戻れなくなる)。 */
const ONBOARD_STEPS = ['opening', 'paper', 'translate', 'want', 'install', 'ready', 'done'];

export function getOnboardStep() {
  const v = readJSON('onboardStep', null);
  return ONBOARD_STEPS.includes(v) ? v : 'opening';
}

export function setOnboardStep(step) {
  if (!ONBOARD_STEPS.includes(step)) return;
  writeJSON('onboardStep', step);
}

// ---- 「ホーム画面に追加」の案内(ブックマーク) ----
// Harumi指示 2026-09-01「ウェブにBookmarkも一度見せたら2度と出さないように
// して」。以前は onboardingSeen だけで守っていたが、案内を**出したこと自体**
// を覚えていないと、初回の途中で閉じた/別の道からオンボーディングに入った
// 時にまた出てしまう。**見せた時点で**印を付ける(押したかどうかは関係ない
// —— 一度見たなら、それが「見せた」)。
export function hasSeenInstallHint() {
  return readJSON('installHintSeen', false) === true;
}

export function markInstallHintSeen() {
  writeJSON('installHintSeen', true);
}

/* ★2026-09-29 Harumi決定「『この練習の流れ』を減らす …ほかは初めての1回だけ」。
   練習の種類ごとに「流れの説明を一度見せた」印。端末に残るので、アプリを
   開き直しても二度と出ない(以前は firstTime = アプリを開くたびに1回)。
   判定は js/ui.js bridgeFirstEver の1か所だけ。 */
export function hasSeenBridge(mode) {
  const list = readJSON('bridgeSeen', []);
  return Array.isArray(list) && list.includes(mode);
}

export function markBridgeSeen(mode) {
  const list = readJSON('bridgeSeen', []);
  const next = Array.isArray(list) ? list : [];
  if (!next.includes(mode)) next.push(mode);
  writeJSON('bridgeSeen', next);
}

/* ★2026-09-30 はじめてガイド(js/guide.js)。画面ごとに「一度見せた」印。
   端末に残るので、アプリを開き直しても二度と出ない。出した時点で印を付ける
   (押したかどうかではなく。「一度見せた初回だけの画面」と同じ考え方)。
   Homeの「使い方をもう一度見る」だけが resetGuides() で消す。 */
export function hasSeenGuide(key) {
  const list = readJSON('guideSeen', []);
  return Array.isArray(list) && list.includes(key);
}

export function markGuideSeen(key) {
  const list = readJSON('guideSeen', []);
  const next = Array.isArray(list) ? list : [];
  if (!next.includes(key)) next.push(key);
  writeJSON('guideSeen', next);
}

export function resetGuides() {
  writeJSON('guideSeen', []);
}

/* 「使い方をもう一度見る」で、会話の練習の動くお手本(この練習の流れ)も
   もう一度出すために、流れの印を1つだけ外す。 */
export function forgetBridgeSeen(mode) {
  const list = readJSON('bridgeSeen', []);
  if (!Array.isArray(list)) return;
  writeJSON('bridgeSeen', list.filter((m) => m !== mode));
}

// ---- ぼかし(タップで表示)の理由を、初回だけ伝える ----
// ★2026-09-26 削除: hasSeenRevealHint/markRevealHintSeen。
// このlocalStorageの永続フラグは、Harumi指示「字幕なしのヒントと
// 『聞こえたまま３回声に出す』の案内をマージして、読んだら次はシンプルに」
// を受けて、js/copy.js copy.reveal.sayCueWhy へ内容を合流させた際に、
// js/ui.js firstTime()(セッション内のみの一時フラグ)へ一本化した。
// 同じ「初回だけ出す」を2つの別の仕組み(こちらは永続・あちらはセッション内)
// で持つのをやめたので、こちらは丸ごと不要になった。**復活させないこと。**
// (端末に残っている `etv.talk.revealHintSeen` の値は読み書きしないだけで
// 害は無いので、そのまま放置してよい。「やめた機能は…」3と同じ扱い。)

// ---- Progress ----

export function getProgress() {
  return readJSON('progress', {});
}

export function setScenarioCompleted(scenarioId) {
  const progress = getProgress();
  progress[scenarioId] = { completed: true, updatedAt: new Date().toISOString() };
  writeJSON('progress', progress);
}

// ★2026-09-27 Unlock(Stripe session_idの購入記録)は削除した。入り方は
// パスワード方式のみ(api/speakup/pass.js)で、この記録は何も制限していなかった。
// ★2026-09-29 getConversationToken(AI英会話の回数キー)は削除した(AI英会話をSpeak Upから外した)。

// ---- Resume ----

export function getResume() {
  return readJSON('resume', null);
}

export function setResume(state) {
  writeJSON('resume', state);
}

export function clearResume() {
  try {
    localStorage.removeItem(PREFIX + 'resume');
  } catch {
    /* ignore */
  }
}

// ---- Missions ----
// ミッション(「この一言をミッションにしますか？」)は2026-08-31に廃止した
// (Harumi指摘「ミッションのアイデアは削除したはずです。なぜ、ミッションが
// まだ出てくるのでしょうか？」)。画面(js/missions.js)・文言(copy.mission)・
// 保存(getMissions/addMission/completeMission等)をすべて削除。
// すでに端末に残っている 'etv.talk.missions' は読みも書きもしないので、
// そのまま放置してよい(消す処理を足すと、万一戻したくなった時に元に
// 戻せなくなる)。**復活させないこと。**

// ---- Skill progress ----
// 「達成感」はラベルではなく積み上がる数字から生まれる（Harumi指示
// 2026-08-19）。聞く/言う/発音の練習回数を、練習するたびに数える。
// 発音だけは「見せた回数」ではなく「実際に通った回数」を数える —
// 露出ではなく習熟を見せるため（呼び出し側でpassed時のみ呼ぶ）。

export function incrementSkillCount(kind) {
  const counts = readJSON('skillCounts', {});
  counts[kind] = (counts[kind] || 0) + 1;
  writeJSON('skillCounts', counts);
  return counts;
}

export function getSkillCounts() {
  const counts = readJSON('skillCounts', {});
  return {
    speaking: counts.speaking || 0,
    listening: counts.listening || 0,
    // ★2026-09-24 `pronunciation` を外した(発音チェックの廃止)。
    // 数える所が1つも無くなったので、常に0の数を返し続ける理由が無い。
    // 端末に残っている値は消さない(読まなくなるだけ)。
  };
}

/* ★2026-09-23 Harumi指示「連続何日は削除」——連続練習日数(ストリーク)は
   読み書きごとやめた(recordStreakActivity / getStreakDays を削除)。
   **復活させないこと。**
   端末に残っている `streak` は消していない —— 読みも書きもしないので害が
   無く、消す処理を足すと万一戻したくなった時に戻せない(CLAUDE.md
   「やめた機能は、コードから消えるまで やめたことにならない」3)。
   下の todayStr / daysBetween は「今日の切れ目」と welcomeBack が使うので
   残す。 */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T00:00:00');
  const b = new Date(dateStrB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}


// ---- 今日の切れ目（1日1レッスン）----
// Harumi指示 2026-09-04「だらだらどこまで続けたらいいの？は非常に苦痛。
// 切れ目があった方がいい」。
// ★**時間で鍵をかけない。** 有料の教材を日付で塞ぐと「お金を払ったのに
//   使えない」になるし、目標日が近い人は自分の締切に合わせて先へ進む必要が
//   ある(「進む道は1本の鎖にする」の鍵は**順番**の鍵であって時間の鍵では
//   ない — この2つを混ぜないこと)。
// やるのは1つだけ: **その日の1本目を終えた時だけ**、完了画面の濃色を
//   「今日はここまでにする」に入れ替える。道は塞がず、白いボタンで進める。
//   2本目からは今までどおり —— 一度「続ける」と決めた人に毎回言わない。
export function noteTrainingFinishedToday() {
  const today = todayStr();
  const rec = readJSON('todayFinished', { date: null, count: 0 });
  if (rec.date !== today) { rec.date = today; rec.count = 0; }
  rec.count += 1;
  writeJSON('todayFinished', rec);
  return rec.count === 1; // true = 今日の1本目 = ここで切れ目を見せる
}


// ---- Welcome back演出のタイミング ----
// 元は毎回Homeを開くたびに再生していたが（Harumi指示 2026-08-19）、
// 「Appleミニマリスト」の見直し(2026-08-26)で「本当に久しぶりの時だけ」
// にする（Harumi指示: 「二日ぶりとか」）。streak.lastDateは実際に
// 練習した日しか進まないため、ただHomeを開くだけの日も数えられるよう
// 専用のキーを持つ。
export function daysSinceLastHomeVisit() {
  const last = readJSON('lastHomeVisit', null);
  if (!last) return null; // 初回訪問
  return daysBetween(last, todayStr());
}

export function markHomeVisitedToday() {
  writeJSON('lastHomeVisit', todayStr());
}

// ---- Phrase bank progress（聞き返す・相槌）----
// この2つはシナリオを持たないので、上のgetProgress()には乗らない
// （scenarioIdが無い）。Homeの他のモジュールと同じ「X / Y」を出すため、
// フレーズごとに「発音チェックまで終えた」ことをmoduleId別に覚えておく。
// 2026-08-31 Harumi報告「ボタン押して、一覧に戻った時に、どこまでやったかの
// 記録がない。ゼロに戻ってます」の原因のひとつ。相槌ドリルは 'reaction' と
// いうIDで記録していたのに、Homeは index.json のモジュールID 'aizuchi' で
// 読んでいたため、**何回練習しても Home はいつも0件**だった。IDを 'aizuchi'
// に統一し、すでに 'reaction' で貯まっている分はここで一度だけ移す
// (移さないと、実機で練習済みの人の記録が消える)。
function readPhraseBankProgress() {
  const all = readJSON('phraseBankProgress', {});
  if (all.reaction) {
    const merged = new Set([...(all.aizuchi || []), ...all.reaction]);
    all.aizuchi = Array.from(merged);
    delete all.reaction;
    writeJSON('phraseBankProgress', all);
  }
  return all;
}

export function markPhraseBankPhraseDone(moduleId, phraseId) {
  const all = readPhraseBankProgress();
  const done = new Set(all[moduleId] || []);
  done.add(phraseId);
  all[moduleId] = Array.from(done);
  writeJSON('phraseBankProgress', all);
  return all[moduleId];
}

/* ---- 選んだフレーズを覚えておく(2026-09-02) ----

   Harumi報告「10個フレーズを選んで途中まで練習 → 間違って他のタブへ →
   戻ってきたら一覧 → 『ここから』と言われる → 押すと**選んだはずの
   フレーズが選ばれていない** → 『練習する』を押しても一覧に戻るだけで、
   それ以上進めない」。

   選択をどこにも残していなかったので、中断すると**続きに戻れなかった**。
   選んだ時点で覚えておき、戻ってきたら**まだ練習していない分を選んだ
   状態で開く** —— そのまま「練習する」を押せば続きから再開できる。
   モジュールをやり切ったら消す(次は新しく選ぶ場面なので)。 */
export function getPhraseBankSelection(moduleId) {
  const all = readJSON('phraseBankSelection', {});
  return all[moduleId] || [];
}

export function savePhraseBankSelection(moduleId, ids) {
  const all = readJSON('phraseBankSelection', {});
  all[moduleId] = ids;
  writeJSON('phraseBankSelection', all);
}

export function clearPhraseBankSelection(moduleId) {
  const all = readJSON('phraseBankSelection', {});
  delete all[moduleId];
  writeJSON('phraseBankSelection', all);
}

export function getPhraseBankDone(moduleId) {
  const all = readPhraseBankProgress();
  return all[moduleId] || [];
}

// ※2026-09-01 削除: getPhraseBankDoneCount(練習済みフレーズの件数)。
// 「◯ / ◯」の分数表示と「全部やったか」の判定をどちらも廃止したため、
// 件数を数える読み手がいなくなった。**「終えた」は isModuleCompleted の
// 1本道だけ**(CLAUDE.md「鍵・進捗・お祝い・ヒーローは、必ず同じ『終えた』を
// 見る」)。件数比較の判定を復活させないこと —— ヒーローと「次の練習へ」で
// 実際に事故になった(2026-09-01)。

// ---- 「一度やり切った」の記録(2026-09-01) ----
// Harumi報告 2026-09-01「『聞き返す』だけ終えて一覧に戻ります。その次、相槌に
// 行こうと思っても鍵がかかったまま。あれ、さっき完了したはずなのに、と
// 『聞き返す』をクリックするとやったはずの情報がDefault真っ白に戻っていて、
// もう一度やらなければ『相槌』にいけない仕組みになってます」。
//
// 真因: 鍵の開く条件を「そのモジュールのフレーズを**全部**練習したか」に
// していた。ところがこのアプリは **「厳選する」ことを勧める学習法**で、
// 9個から1個だけ選ぶのが正しい使い方 —— つまり**正しく使うほど永久に
// 終わらない**作りだった。9個やらせるのは、この学習法そのものへの違反。
//
// → 「終えた」= **その練習を1回やり切った**(選ぶ → 練習 → 完了画面に着いた)。
//    どのボタンを押したかは関係ない。**完了画面に着いた時点で記録する。**
//    途中で「戻る」で抜けた時(aborted)は記録しない —— 終えていないため。
// ---- AI英会話(体験1回・5軸の記録)は2026-09-29に削除した ----
// Harumi指示「AI英会話はそれだけで販売する。Speak Upでは導入しないで。消して」。
// 端末に残っている aiTrialUsed / aiEarned / aiSessions / aiConversationAnonId は
// もう読み書きしない(消す処理は足さない)。**復活させないこと。**

// ---- 相槌の「定番」(2026-09-02) ----
// Harumi報告「Totally だけを選んで練習したのに、ドリルでは Nice! しか
// 出てこない。選ばせておいて無視するなら、選ぶ意味がない」。
// → 選んだ相槌が**ドリルの出題そのものを決める**(js/reactionDrill.js)。
// phraseBankSelection とは別に持つ理由: あちらは「中断からの復帰」用の
// 一時的な記録で、練習し終えると消える(clearPhraseBankSelection)。
// 定番は**次のドリルまで残っていないと意味がない**ので、別の鍵にする。
export function getAizuchiFavorites() {
  const list = readJSON('aizuchiFavorites', []);
  return Array.isArray(list) ? list : [];
}

export function setAizuchiFavorites(ids) {
  writeJSON('aizuchiFavorites', Array.from(new Set(ids || [])));
}

// ---- 相槌ドリル「直前の1回に出した問題」(2026-09-06) ----
// Harumi報告「もう一度すでにやったものを出さない。…出てきてもいいんだけど、
// バックトゥバックで出てくるのは避けたい。**一回目に出したものを三回目の
// roundに出すのはオッケー**」。
// → 覚えるのは **直前の1回だけ**。2回前より古いものは、また出てよい。
// getPhraseBankDone(=これまでにやった全部)とは別に持つ:
// ・あちらは「未練習を先に出す」ための**累積**の記録で、17問を使い切ると
//   全部が done になり、並べ替えの手がかりとして働かなくなる
//   (これが「4回目から毎回かぶる」の正体)。
// ・こちらは**直近1回だけの短い記録**で、累積とは寿命が違う。
//   同じ鍵に混ぜると「未練習を先に」の判定が壊れるので、必ず別の鍵にする。
export function getReactionRecent() {
  const list = readJSON('reactionRecent', []);
  return Array.isArray(list) ? list : [];
}

export function setReactionRecent(ids) {
  writeJSON('reactionRecent', Array.from(new Set(ids || [])));
}

/* ★2026-09-24 削除: 発音チェックの出題の記録
   (getPronunciationSeen / getPronunciationRecent / notePronunciationBatch)。
   Harumi指示「発音チェックは、やめようと思います」で画面ごと廃止したため。
   **復活させないこと。**
   端末に残っている `pronunciationSeen` / `pronunciationRecent` は消していない
   —— 読みも書きもしなくなるので害は無く、消す処理を足すと万一戻したく
   なった時に戻せない(CLAUDE.md「やめた機能は…」3)。 */

export function markModuleCompleted(moduleId) {
  if (!moduleId) return;
  const done = new Set(readJSON('modulesCompleted', []));
  done.add(moduleId);
  writeJSON('modulesCompleted', Array.from(done));
}

export function isModuleCompleted(moduleId) {
  return readJSON('modulesCompleted', []).includes(moduleId);
}

/* ---- 20日間コース(2026-09-30。js/course.js) ----
   Day の数字は保存しない(既存の記録から毎回計算する)。保存するのは
   「復習の日を最後まで聞き終えた」印だけ —— これだけは既存の記録から分からない。
   { "5": true, "10": true, ... } */
export function getCourseReviewDone() {
  return readJSON('courseReviewDone', {});
}

export function markCourseReviewDone(dayN) {
  const done = readJSON('courseReviewDone', {});
  done[String(dayN)] = true;
  writeJSON('courseReviewDone', done);
}

/* ---- 目標(finalGoal) ----
   ★2026-09-23 Harumi指示「目標を決める 削除」——読み書きごと削除した
   (hasFinalGoal / getFinalGoal / setFinalGoal)。**復活させないこと。**
   端末に残っている `finalGoal` は消していない(もう読み書きしないだけ)。 */

// ※Module goals(場面ごとの締切)は2026-08-29に廃止(Harumi指示:
// どのカテゴリーも1つの会話の一部なので、まとまりごとに締切を切る
// 意味がない。目標日は最終目標=finalGoalの1つだけ)。localStorageの
// 旧`moduleGoals`キーは読まれないだけで、消さなくても害はない。

// ---- Your Journey ----
// ※「⭐Your Journey」画面(2026-08-28廃止)専用の集計関数
// getJourneyStats、および「実際に使えた回数」をHomeのスコアとして
// 集計する仕組みgetUsedTotal(2026-08-29廃止)はここにあったが、
// どちらも使う画面が無くなったため削除した。My Book自体の「使った」
// ☐/✓チェックも2026-08-29に廃止した(Harumi指示: 「実際使ったかどうかは
// アプリで管理しないようにします」)。

/* ★2026-09-30 聞き流しタブの「聞き流す ｜ 止まって練習」(js/listen.js)。
   Harumi決定: 聞き流しは今までどおり残し(家事・通勤の人)、止まる形は選べるようにする。
   最初は「聞き流す」。選んだ方を覚えておく(毎回選び直させない)。
   復習の日(Home の「復習をはじめる」)はこの値に関係なく、必ず止まる形で開く。 */
export function getListenMode() {
  return readJSON('listenMode', 'flow') === 'stop' ? 'stop' : 'flow';
}
export function setListenMode(mode) {
  writeJSON('listenMode', mode === 'stop' ? 'stop' : 'flow');
}

/* ---- 復習の選び方(2026-09-30。js/pausePractice.js) ----
   Harumi決定: 復習は1回5本まで。①「聞き取れなかった」を押した会話
   (markMissedListening) ②練習してから一番時間がたっている会話 ③ランダム。
   前の回と同じ会話が続けて出ないように、相槌ドリル(getPhraseBankDone /
   getReactionRecent)と同じ2段の記録を持つ:
   ・reviewLastSeen … 会話ごとの「最後に復習で出た日時」(ずっと残る記録。②の順番に使う)。
   ・reviewRecentPicks … 直前の1回の復習で選んだ会話id(直前1回だけの記録。
     次の回でまず除外する。プールがそれで5本に満たない時だけ戻す)。 */
export function getReviewLastSeen() {
  return readJSON('reviewLastSeen', {});
}

export function getReviewRecentPicks() {
  const list = readJSON('reviewRecentPicks', []);
  return Array.isArray(list) ? list : [];
}

export function recordReviewPicks(scenarioIds) {
  const ids = (scenarioIds || []).filter(Boolean);
  if (!ids.length) return;
  const now = new Date().toISOString();
  const lastSeen = getReviewLastSeen();
  ids.forEach((id) => { lastSeen[id] = now; });
  writeJSON('reviewLastSeen', lastSeen);
  writeJSON('reviewRecentPicks', ids);
}
