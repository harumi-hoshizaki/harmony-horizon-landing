// EAR TO VOICE — Talk to a Visitor
// 音声再生エンジン。
//
// ★このファイルは思いつきで書き換えないこと。
//   harmony-horizon の docs/ios-speech-blueprint.md（設計図）と
//   docs/audio-solutions.md（症状→原因の索引）に書かれた、実機で確かめた
//   結論をそのまま実装してある。飲食店アプリ eatout/listening/index.html の
//   再生部の移植で、節番号は解決集のもの。
//
//   守ること（解決集 §C のチェックリスト）:
//   - 新しく音を鳴らす経路を足したら micUsed / actxStale / rate の3つを見る
//   - pcmCache を空にする処理を足さない（足すと §A-5 の穴が戻る）
//   - AudioContext を作り直す処理を書き写さない（rebuildAudioCtx を呼ぶ）
//   - 録音を始めるタップで出力側に触らない（holdAudioForMic）
//   - state === 'running' で生死を判断しない（時計で見る）

// 音声ファイルを差し替えたら上げること。Safari と Vercel のエッジは
// 古いバイト列を返し続ける（解決集 §D-1）。
export const AUDIO_VERSION = '202609300152';

/* ★2026-09-25 素材の基準フォルダ。アプリの画面(index.html)がどこに
   あっても同じ場所を指すよう、**ページからの相対ではなく
   import.meta.url(= speakup/js/)からの相対**で1つだけ作る。
   CLAUDE.md「音声URLの基準フォルダを間違えない」2 と同じ形 ——
   あちらは data/ と audio/ を直したが、効果音(audio/se_*.mp3)と
   場面写真(images/*.jpg)だけ**ページからの相対のまま残っていた**。
   2026-09-25 にアプリを /speakup/app/ へ移した時、この2つが
   静かに404になる(エラーは出ず、音が鳴らない・写真が札のまま)ので、
   移す前にここへ寄せた。**ページからの相対に戻さないこと。** */
const ASSET_BASE = new URL('../', import.meta.url);

export function assetUrl(src) {
  return new URL(src, ASSET_BASE).href;
}

export function versioned(src) {
  const url = assetUrl(src);
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + AUDIO_VERSION;
}

/* ---- 音源をメモリに置く(Eatout本番と同じ形。2026-08-30) ----
   Harumi報告 2026-08-30「女性の声は ふつうでもゆっくりでも途切れ途切れ
   です。Eatoutではその問題はないです」。Eatoutの本番を読むと、
   preloadAudio() が **fetch → blob → URL.createObjectURL** で音源を
   まるごとメモリに持ち、鳴らす時は必ず
   `new Audio(audioCache[src] || versioned(src))` を使っている
   (eatout/listening/index.html の 6886-6893 / 7438 / 7782 / 7934)。
   つまりEatoutは **再生中に一切ネットへ取りに行かない**。

   Speak Up はPCMに変換したものだけをキャッシュしていて、WebAudioに
   乗せられなかった時のHTMLAudio再生は毎回ネットから流していた。
   細切れのmp3を電波の弱い所で流せば、当然「途切れ途切れ」になる。
   これがEatoutとの差の正体。

   ここではEatoutと同じblobキャッシュを足し、**HTMLAudioを使うすべての
   経路**(通常再生・その場スロー・効果音)がこれを見るようにする。
   PCMキャッシュ(pcmCache)は今までどおり別に持つ —— 役割が違う
   (あちらはWebAudioで鳴らすため、こちらはネットに行かせないため)。 */
const blobCache = Object.create(null);
const blobPending = Object.create(null);

/* 鳴らす時に使うURL。メモリにあればそれを、無ければ従来どおりネットを。 */
export function srcUrl(src) {
  return blobCache[src] || versioned(src);
}

export function cacheBlob(src) {
  if (!src || blobCache[src]) return Promise.resolve(blobCache[src]);
  if (blobPending[src]) return blobPending[src];
  const pr = fetch(versioned(src))
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.blob();
    })
    .then((b) => {
      blobCache[src] = URL.createObjectURL(b);
      delete blobPending[src];
      return blobCache[src];
    });
  blobPending[src] = pr;
  pr.catch(() => {
    delete blobPending[src];
  });
  return pr;
}

/* ---- §A-1b iOSに「これは再生です」と宣言する ----
   これが無いと、iOSは音声セッションを通話向けの扱いのままにすることが
   あり、その時 HTMLAudio は受話口（耳に当てる小さい方）へ回る。
   unlockAudioCtx() と再生関数の頭で毎回呼ぶ。 */
export function ensurePlaybackAudioSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    /* 未対応のブラウザには navigator.audioSession が無い＝無害 */
  }
}
ensurePlaybackAudioSession();

/* ---- §A-1b補: マイクを開く画面(AI英会話)用 ----
   上の'playback'宣言のままだと、iOS実機は getUserMedia を
   「AudioSession category is not compatible with audio capture.」で
   拒否する(実機報告 2026-08-28、AI英会話が接続できない)。マイクを
   開く直前に 'play-and-record' へ切り替えること。
   ★終わったら必ず ensurePlaybackAudioSession() で戻す — 戻さないと
   その後のレッスン音声が受話口(耳に当てる小さい方)へ回る(§A-1b)。
   戻す時は markAudioRouteKick() も呼ぶ(マイク後の1音目は出力先を
   決め直させる、§A-1cと同じ扱い)。 */
export function ensureCaptureAudioSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
  } catch {
    /* 未対応のブラウザには navigator.audioSession が無い＝無害 */
  }
}

/* ---- §A-1c 出力先を取り直す「鳴らし直し」 ----
   1回目を鳴らしておく長さ（ミリ秒）。ここが唯一の調整つまみ。
   人が音の始まりを音節として聞き分けられるのは およそ40〜60ms から。
   40ms なら聞こえてもごく短い「プツ」で、言葉にはならない。
   0にはしない（動き出す前に止めると2回目がまた「1回目」扱いになる）。 */
const ROUTE_KICK_MS = 40;

/* 印は最初から立てておく。「どのセッションでも最初の1音」が鳴らし直しの
   対象になる。1回で使い切るので、2音目からは1回しか鳴らない。 */
let audioRouteKick = true;

export function markAudioRouteKick() {
  audioRouteKick = true;
  /* ★★★ 2026-09-02 ここで actxStale を立てるのをやめた ★★★

     Harumi報告 2026-09-02「聞き返すのページで、**1個目の音声を録音した後は
     必ず通話口から音声が出てくる**。Eatoutではその問題が解決したはずなのに、
     このアプリでは毎回同じ問題が起こる。おそらくEatoutで見つけた解決法を
     まだ適用できていない」——**そのとおりだった。**

     Eatoutの本番(eatout/listening/index.html markAudioRouteKick)は、
     2026-08-18の実機記録を根拠に**この1行を削除している**:

       16.7s ▶ ゆっくり → WebAudio     ← ⚠なし(Contextはスピーカーに紐づく)
       28.5s〜55.0s マイク使用。suspended→running を5回繰り返す(生きている)
       67.3s ◆ AudioContext 作り直し   ← ここで破棄して作り直した
       71.8s ★受話口                   ← 以後 WebAudio も HTMLAudio も
       83.5s ★受話口                      **全部**受話口。二度と戻らない

     結論(Eatoutの言葉):「マイクで止まったContextは毎回ちゃんと復帰していて、
     壊れてなどいない。それを actxStale で破棄し、**新しいContextを作った
     瞬間に受話口へ紐づいてしまう**」。
     **出力先は AudioContext が生まれた瞬間に決まり、
     navigator.audioSession.type='playback' では上書きできない**(実機確認)。

     SpeakUpはこの1行を残したままで、さらに2026-09-01に §A-4b で
     「どのタップでも抜け殻を作り直す」を足した。その結果、
     **録音した直後の最初のタップで必ずContextを作り直す** ——
     つまり毎回、受話口に紐づいた新しいContextに乗り換えていた。
     Harumi報告の「録音した後は必ず通話口」と完全に一致する。

     正しいのは**スピーカーに紐づいた最初のContextを捨てずに使い続ける**
     こと。止まっていたら resume で起こす(記録どおり、それで戻る)。
     鳴らし直し(audioRouteKick)はHTMLAudio側の手当てなので、そのまま残す
     —— Contextを作り直さないので無害。
     本当に死んだ時だけ onWebAudioDead() が actxStale を立てる(最後の逃げ道)。
     **ここに actxStale を書き戻さないこと。** */
}

/* マイクを一度でも使ったか（使用後の HTMLAudio は受話口に回る）。 */
let micUsed = false;
/* ★2026-09-08 §A-8b マイクが開いている間に生きていた Context は、次に指で
   触った「再生」の中で作り直す(下の playClip 参照)。印はここで立て、
   1回使い切り。actxStale とは別物 —— あちらは「鳴らなかった」時だけ
   (ルール18)。こちらは「録音セッションをまたいだ」時。 */
let ctxLivedThroughMic = false;
export function noteMicUsed() {
  micUsed = true;
  ctxLivedThroughMic = true;
}
/* 画面側が「受話口から聞こえる時は」の復帰ボタンを出すかどうかを決めるための
   読み取り口。受話口に回るのはマイクを使ったあとだけなので、その前に出すと
   ただの騒音になる(§A-8)。 */
export function micWasUsed() {
  return micUsed;
}

/* ---- §A-8 受話口からの復帰は、押せるボタンで ----
   Harumi指示 2026-09-02「途中で通話口から音声が出てしまう。それはもう仕方が
   ないと思う。ただ**『受話器の方から音が出る方はここを押してください』という
   ボタン**を用意しておくだけで、『また聞こえない』というフラストレーションは
   すごく減る」。

   なぜ自動で直せないか: **アプリは音が受話口から出ていることを検知できない**。
   コードから見れば再生は成功していて、出口がどちらかは iOS しか知らない。
   だから §A-6(押したのに鳴らない=検知できる)の復帰ボタンだけでは足りず、
   **鳴っているのに聞こえない**時のために、本人が押せる物を常に置く。

   押した時の順番(この順番が肝):
     1. ensurePlaybackAudioSession()  ——「これは再生です」を先に宣言する。
        新しい Context は**生まれた瞬間の音声セッションの種類**で出口が決まる
        (markAudioRouteKick の記録)。録音側のまま作ると受話口に紐づく。
     2. resetAudioPipeline()          —— タップの中で Context を作り直す
        (§A-6 と同じ例外。ルール9の許可範囲)。
     3. markAudioRouteKick()          —— HTMLAudio 側も出口を取り直す。
     4. 最後に鳴らした1本を鳴らし直す —— **押した本人が、直ったかをその場で
        耳で確かめられる**ようにする。無言で終わらせない。
   ※ここで直るかどうかは実機の耳でしか分からない(CLAUDE.md)。直らなかった
   時のためにボタンは消さず、何度でも押せる形にしておく。 */
export function recoverFromEarpiece(rate) {
  ensurePlaybackAudioSession();
  resetAudioPipeline();
  ctxLivedThroughMic = false; /* §A-8b 手で作り直したので、自動の分は要らない */
  markAudioRouteKick();
  return replayLastCue(rate);
}

/* ---- §A-1 このページで、音が一度でも本当に鳴ったか ----
   分かれ目は「マイクの前後」ではなく「このセッションで最初の1音かどうか」。
   最初の1音さえ HTMLAudio で鳴らせば、あとは WebAudio でよい。
   印は実際に音が出た証拠でしか立てない（HTMLAudio なら再生位置が進んだ時、
   WebAudio なら start() に成功した時）。play() を呼んだだけでは立てない。 */
let audioSessionStarted = false;

/* 直前に鳴らしたのはどちらの経路か。web → html の乗り換えの瞬間に
   iOS が出力先を決め直すので、その時だけ §A-1c の鳴らし直しを使う。 */
let lastPlayPath = null; /* null | 'web' | 'html' */

let actx = null;
let actxPrimed = false;
let actxStale = false; /* §A-4 抜け殻。次のタップの中で作り直す */
const pcmCache = {}; /* src -> AudioBuffer（絶対に捨てない。§A-5） */
const pcmPending = {};
let activeSource = null;
let activeButton = null;
let player = new Audio();

/* ※2026-09-02 削除: markCtxStale()。マイクの後始末(js/speech.js)から
   「抜け殻の印」を立てるために使っていたが、**それ自体が受話口の原因**
   だった(上の markAudioRouteKick の記録を参照)。actxStale を立ててよいのは
   onWebAudioDead()——実際に鳴らそうとして鳴らなかった時——だけ。
   復活させないこと。 */

/* ---- §B-1 録音中は出力側に一切触らない ----
   解除し忘れても自然に戻るよう、フラグではなく時刻で持つ。 */
let micQuietUntil = 0;
export function micQuiet() {
  return Date.now() < micQuietUntil;
}
export function holdAudioForMic(ms) {
  micQuietUntil = Date.now() + ms;
}
export function releaseAudioForMic() {
  micQuietUntil = 0;
}

/* 録音に入る前に、出力側の音声セッションを録音側へ譲る。suspend は非同期
   なので、完了を待ってから認識を始めること（待たずに始めると、マイクは
   開いた形のまま何も拾わない）。 */
export function suspendForMic() {
  stopAll();
  if (actx && actx.suspend && actx.state === 'running') {
    return Promise.resolve()
      .then(() => actx.suspend())
      .catch(() => {});
  }
  return Promise.resolve();
}

/* ---- §A-4 抜け殻の作り直し ----
   ★pcmCache を捨てないこと。デコードは OfflineAudioContext なので
   AudioBuffer はどのコンテキストにも属さない「ただのPCMデータ」。 */
export function rebuildAudioCtx() {
  try {
    if (actx && actx.close) actx.close();
  } catch {
    /* 閉じられない端末は放置してよい */
  }
  actx = null;
  actxPrimed = false;
  actxStale = false;
  /* 古いContextに繋がったゆっくり用の要素は、そのContextと運命を共にして
     無音になる。必ず作り直す(上のresetSlowPlayer注意書き参照)。 */
  resetSlowPlayer();
  unlockAudioCtx();
  preloadPending();
}

/* iOSはユーザー操作の中でしか AudioContext を有効化できない。どのタップでも
   作成/復帰させる。resume() だけでは足りず、タップの中で1サンプルの無音を
   鳴らして出力経路を起動しておく（設計図 §4b）。 */
export function unlockAudioCtx() {
  if (micQuiet()) return;
  unlockAudioCtxForce();
}

/* ---- §A-0 「捨てずに起こす」----
   Contextが無ければ作り、あれば resume して鳴る状態に整えるだけ。
   rebuildAudioCtx() と違い**捨てない** —— スピーカーに紐づいたContextを
   捨てると、新しいContextが受話口に紐づいて二度と戻らない(§A-0)。
   再生の直前に必ずこれを呼ぶ。呼ばないとContextが suspended のままで
   WebAudioが使えず、HTMLAudio(=受話口の経路)に落ちる。 */
/* AudioContext.resume() は Promise を返す。**閉じた**Contextに呼ぶと
   「Cannot resume a context that has been closed」で拒否され、try/catch では
   拾えない(未処理のPromise拒否としてコンソールに出る)。状態を先に見て、
   さらに .catch を付ける —— 起こせなかった時は静かに諦め、次のタップで
   やり直す(2026-08-31)。 */
function resumeQuietly(ctx) {
  if (!ctx || !ctx.resume || ctx.state === 'closed' || ctx.state === 'running') return Promise.resolve();
  try {
    const r = ctx.resume();
    return r && r.catch ? r.catch(() => {}) : Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

export function unlockAudioCtxForce() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!actx) {
      actx = new AC();
      actx.onstatechange = () => {
        /* 録音のために意図的に止めている間は戻さない。 */
        if (micQuiet()) return;
        if (actx && actx.state === 'suspended' && actx.resume) {
          /* resume() は Promise を返す。閉じたContextに呼ぶと
             「Cannot resume a context that has been closed」で**拒否**され、
             try/catch では拾えない(未処理のPromise拒否になる)。
             状態を先に見て、さらに .catch を付ける(2026-08-31)。 */
          resumeQuietly(actx);
        }
      };
    }
    if (actx.state !== 'running') resumeQuietly(actx);
    if (!actxPrimed) {
      actxPrimed = true;
      const sfx = actx.createBufferSource();
      sfx.buffer = actx.createBuffer(1, 1, 22050);
      sfx.connect(actx.destination);
      sfx.start(0);
    }
  } catch {
    /* 使えない端末では HTMLAudio のまま */
  }
}
/* タップに繋ぐハンドラは、下の inUserGesture() を定義したあとで登録する
   (§A-4b)。ここで unlockAudioCtx を直接繋ぐと「起こすだけ」になり、
   抜け殻になったContextが作り直されないまま残る。 */

/* ---- 「いま、指で触った直後か」----
   iOSは**ユーザー操作の中でしか** AudioContext を作り直せない。タップの外で
   作り直すと、新しいContextは suspended のまま起きず、WebAudioが使えず
   HTMLAudio(=受話口の経路)に落ちる。どこが操作の中かを判定できるように、
   最後に触った時刻を覚えておく(2026-08-31)。
   1秒: タップから再生までにawaitが1〜2段挟まっても届く長さ。長すぎると
   「操作の中」でない所まで許してしまうので伸ばさない。 */
let lastGestureAt = 0;
const noteGesture = () => {
  lastGestureAt = Date.now();
};
document.addEventListener('pointerdown', noteGesture, true);
document.addEventListener('touchend', noteGesture, true);
document.addEventListener('click', noteGesture, true);
export function inUserGesture() {
  return Date.now() - lastGestureAt < 1000;
}

/* ---- §A-4b 抜け殻の作り直しは「どのタップでも」やる(2026-09-01) ----
   Harumi報告 2026-09-01「会話の練習にはいると必ずと言っていいほど、最初の
   相手の声は通話口から出てきます」。順に辿ると、こうなっていた:

   1. マイクの後、抜け殻の印(actxStale)が立つ。
   2. そのあと利用者が押すのは「次へ」だけ —— **音を鳴らさないタップ**。
   3. 作り直し(rebuildAudioCtx)は **playClip の中にしか無かった**。
   4. 会話の練習は全ターンがタップの外の自動再生 → playClip はいつも
      inUserGesture() が false → 一生作り直されない。

   直し方は「鳴らすタップ」を待たないこと。**どのタップでも**、抜け殻なら
   その場で作り直す。ここは touchend/click のハンドラ＝指で触っている最中
   なので §A-0 の禁じ手(タップの外で捨てる)には当たらない。

   ★★★ 2026-09-02 重要な補足。ここを読まずに触らないこと ★★★
   上の(1)「マイクの後に印が立つ」は**間違いだった**。Eatoutの実機記録が、
   マイクで止まったContextは毎回復帰していること・**作り直した瞬間に
   受話口へ紐づくこと**を示している(markAudioRouteKick のコメント参照)。
   いまは **actxStale を立てるのは onWebAudioDead() だけ** ——
   「実際に鳴らそうとして、450msの見張りで鳴っていないと分かった時」。
   つまりこの §A-4b が動くのは**本当に死んだContextの時だけ**で、
   マイクを使っただけでは動かない。両方が揃って初めて正しい:
     ・先回りして捨てない(受話口の原因)
     ・本当に死んだら、次のどのタップでも作り直す(鳴らない状態から抜ける) */
function unlockOrRebuildOnGesture() {
  /* このハンドラ自体がタップの中。印を先に立ててから判定する
     (登録順によっては noteGesture がまだ走っていないことがあるため)。 */
  noteGesture();
  if (micQuiet()) return;
  if (actxStale && inUserGesture()) rebuildAudioCtx();
  else unlockAudioCtxForce();
}
document.addEventListener('touchend', unlockOrRebuildOnGesture, true);
document.addEventListener('click', unlockOrRebuildOnGesture, true);

/* ---- §A-5 デコードは OfflineAudioContext で ----
   出力コンテキストが無くてもデコードできる＝最初のタップの前に先読みを
   済ませられる。作り直しても捨てなくてよい＝取りこぼしが起こり得ない。 */
function offlineDecode(bytes) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return Promise.reject(new Error('no-OfflineAudioContext'));
  const rateHz = (actx && actx.sampleRate) || 44100;
  let oac;
  try {
    oac = new OAC(1, 1, rateHz);
  } catch {
    oac = new OAC(1, 1, 44100);
  }
  return new Promise((res, rej) => {
    const ret = oac.decodeAudioData(bytes, res, rej);
    if (ret && ret.then) ret.then(res, rej);
  });
}

/* ---- 音声ファイルがまだ置かれていない間 ----
   写真と音声は後から入る。無い間に「押しても音が出ない」の復帰ボタンを
   出すと、直しようのない不具合が出ているように見える。ファイルが 404 で
   返ってきたものは「まだ無い」と覚えておき、復帰ボタンではなく静かな
   お知らせを1つ出す。ファイルを置けば、この道は自然に通らなくなる。 */
const notYetRecorded = new Set();
let missingHandler = null;

/* ---- 「ゆっくり」再生(2026-08-30 Harumi指示で確定) ----
   事前生成の遅い音声(_slow: ffmpeg引き伸ばし)は「不自然」で廃止。
   HTMLAudioのpreservesPitch(自然なその場スロー)の音をそのまま使い、
   **出力だけをWebAudio(スピーカーに紐づいたContext)へ通す** —
   createMediaElementSource。素のHTMLAudioの出力は受話口に回りうるが
   (§A-1)、この形なら音の出口はContextと同じ=スピーカー。
   ★注意: 一度MediaElementSourceに繋いだ要素は、そのContextが閉じると
   永久に無音になる。rebuildAudioCtx()では必ず要素ごと作り直す
   (resetSlowPlayer)。Contextが使えない端末では素のHTMLAudioに落ちる
   (音は出る。従来と同じ)。 */
/* ★2026-08-30 「ゆっくりがガチャガチャする」(Harumi実機報告)への対策。
   初版は**要素を1つ作って使い回し**、鳴らすたびに `el.src` を差し替えて
   いた。MediaElementSourceに繋いだままsrcを差し替えるのはSafariが苦手で、
   引き伸ばし(preservesPitch)の途中で音が割れる/こもる原因になる。
   Eatoutの検証コード(eatout/listening/index.html の「実験C」)は
   **毎回新しい`new Audio()`を作って**その場で繋いでいた —— こちらが
   元の形。使い回しは私(Claude)が勝手に足した省略で、そこだけが違った。
   以後、1回の再生につき1要素・1ノードを作り、終わったら切る。
   (MediaElementSourceは1要素につき1回しか作れないので、使い回すなら
   src差し替えしか無い。だから「作り直す」が正解。) */
let slowPlayer = null; /* いま鳴っている要素。GCで音が消えないよう保持する */
let slowNode = null;
function resetSlowPlayer() {
  try {
    if (slowPlayer) slowPlayer.pause();
  } catch {
    /* 停止済み */
  }
  try {
    if (slowNode) slowNode.disconnect();
  } catch {
    /* 切断済み */
  }
  slowPlayer = null;
  slowNode = null;
}
/* 1回の再生ぶんの要素とノードを作る。作れなければfalse(素のHTMLAudioへ)。 */
function makeSlowPlayer(src) {
  if (!actx || actx.state !== 'running') return null;
  try {
    const el = new Audio(srcUrl(src));
    /* 引き伸ばし再生は、読み込みが再生に追いつかないと途切れて
       「ガチャガチャ」に聞こえる。モバイルSafariは既定でmetadataまでしか
       先読みしないことがあるので、明示的に全部先読みさせる。 */
    el.preload = 'auto';
    try {
      el.preservesPitch = true;
      el.webkitPreservesPitch = true;
    } catch {
      /* 未対応でもそのまま(ピッチが下がるだけ) */
    }
    const node = actx.createMediaElementSource(el);
    node.connect(actx.destination);
    return { el, node };
  } catch {
    /* createMediaElementSource非対応 → 素のHTMLAudioに落ちる */
    return null;
  }
}
function playViaSlowElement(src, btn, onEnded, onFail, rate) {
  /* 前回のぶんは要素ごと片付ける(鳴りっぱなしの重なりも防ぐ)。 */
  resetSlowPlayer();
  const made = makeSlowPlayer(src);
  if (!made) return false;
  slowPlayer = made.el;
  slowNode = made.node;
  const el = slowPlayer;
  const applyRate = () => {
    try {
      el.preservesPitch = true;
      el.webkitPreservesPitch = true;
      el.playbackRate = rate;
    } catch {
      /* 同上 */
    }
  };
  applyRate();
  /* iOSは読み込みでplaybackRateを1に戻すことがある。読み込み後にもう一度。 */
  el.onloadedmetadata = applyRate;
  activeButton = btn || null;
  if (btn) btn.classList.add('playing');
  /* §A-10 ゆっくりはHTMLAudio要素なので、要素の pause()/play() で止まる。 */
  const myPause = pausableWish ? { kind: 'el', el, btn, paused: false } : null;
  if (myPause) {
    pauseState = myPause;
    setBtnIcon(btn, 'pause');
  }
  /* 鳴り終わった要素とノードは切っておく(繋ぎっぱなしにしない)。
     ただし片付けるのは「まだ自分が現役の時」だけ — 次の再生がもう
     始まっていたら、その要素を巻き添えに止めてしまう。 */
  const releaseIfCurrent = () => {
    if (slowPlayer === el) resetSlowPlayer();
  };
  el.onended = () => {
    clearStallTimer();
    if (btn) btn.classList.remove('playing');
    if (pauseState === myPause) clearPauseState();
    releaseIfCurrent();
    if (onEnded) onEnded();
  };
  el.onerror = () => {
    clearStallTimer();
    if (btn) btn.classList.remove('playing');
    if (el.error && el.error.code === 4) noteNotYetRecorded(src);
    releaseIfCurrent();
    setPlayStuck();
    if (onFail) onFail();
  };
  el.ontimeupdate = () => {
    if (el.currentTime > 0) {
      audioSessionStarted = true;
      clearStallTimer();
      el.ontimeupdate = null;
    }
  };
  lastPlayPath = 'web'; /* 出口はWebAudio=スピーカー */
  const p = el.play();
  if (p && p.then) {
    p.then(
      () => {},
      () => {
        clearStallTimer();
        if (btn) btn.classList.remove('playing');
        setPlayStuck();
        if (onFail) onFail();
      }
    );
  }
  clearStallTimer();
  stallTimer = setTimeout(() => {
    stallTimer = null;
    if (el.currentTime > 0 || el.ended) return;
    if (btn) btn.classList.remove('playing');
    setPlayStuck();
  }, 1600);
  return true;
}

export function setAudioMissingHandler(fn) {
  missingHandler = fn;
}

export function isNotYetRecorded(src) {
  return notYetRecorded.has(src);
}

function noteNotYetRecorded(src) {
  if (notYetRecorded.has(src)) return;
  notYetRecorded.add(src);
  if (missingHandler) missingHandler(src);
}

/* ---- 「ゆっくり」の焼いた音(Eatoutと同じ形。2026-08-30) ----
   {id}.mp3 に対する {id}_slow.mp3。あれば**等速のWebAudioで**鳴らす
   (実機で引き伸ばさないので破綻しない)。無ければ従来どおりその場スロー。
   どの声を焼くかはファイルの有無だけで決まる — アプリ側に分岐を持たない。 */
const slowMissing = new Set(); /* 焼いていない声。一度404なら二度と聞かない */
export function slowVariant(src) {
  if (!src || !/\.mp3$/.test(src)) return null;
  const out = src.replace(/\.mp3$/, '_slow.mp3');
  return slowMissing.has(out) ? null : out;
}
export function noteSlowMissing(src) {
  if (src) slowMissing.add(src);
}

export function decodeInto(src, { quiet = false } = {}) {
  if (pcmCache[src]) return Promise.resolve(pcmCache[src]);
  if (pcmPending[src]) return pcmPending[src];
  const pr = fetch(versioned(src))
    .then((r) => {
      if (!r.ok) {
        /* 焼いた「ゆっくり」は無いのが普通の状態なので、404を
           「まだ録っていません」の札に出さない(quiet)。 */
        if (r.status === 404 && !quiet) noteNotYetRecorded(src);
        throw new Error(String(r.status));
      }
      return r.arrayBuffer();
    })
    .then((buf) =>
      /* decodeAudioData は渡した ArrayBuffer を空にする（detach）。
         落ちた時のやり直しぶんを残すため、複製を渡す。 */
      offlineDecode(buf.slice(0)).catch((e) => {
        if (!actx) throw e;
        return new Promise((res, rej) => {
          const ret = actx.decodeAudioData(buf, res, rej);
          if (ret && ret.then) ret.then(res, rej);
        });
      })
    )
    .then((audioBuf) => {
      pcmCache[src] = audioBuf;
      delete pcmPending[src];
      return audioBuf;
    });
  pcmPending[src] = pr;
  pr.catch(() => {
    delete pcmPending[src];
  });
  return pr;
}

/* いま必要になりうる音源。画面を出す時に渡しておけば、タップの時には
   必ずキャッシュヒット＝同期 start になる（設計図 §4b）。 */
const pcmWish = new Set();
export function preloadAudio(urls) {
  (urls || []).forEach((src) => {
    if (!src) return;
    /* 焼いた「ゆっくり」は無いのが普通(焼いた声だけある)。札を出さず、
       無ければ覚えて二度と取りに行かない。 */
    const isSlow = /_slow\.mp3$/.test(src);
    if (isSlow && slowMissing.has(src)) return;
    pcmWish.add(src);
    /* Eatoutと同じく、まず**まるごとメモリに**置く。WebAudioに乗せられ
       なかった時のHTMLAudio再生がネットに行かなくなる(＝途切れない)。
       焼いた「ゆっくり」は無いのが普通なので、失敗しても黙って捨てる。 */
    cacheBlob(src).catch(() => {});
    decodeInto(src, { quiet: isSlow }).catch(() => {
      /* 取れなくても再生時に HTMLAudio / その場スローへ落ちる */
      if (isSlow) {
        noteSlowMissing(src);
        pcmWish.delete(src);
      }
    });
  });
}
function preloadPending() {
  pcmWish.forEach((src) => {
    if (!pcmCache[src]) decodeInto(src).catch(() => {});
  });
}

export function stopWebAudio() {
  if (activeSource) {
    try {
      activeSource.onended = null;
      activeSource.stop(0);
    } catch {
      /* 停止済み */
    }
    activeSource = null;
  }
}

/* ---- §A-10 押して止める・続ける(2026-09-24 Harumi決定「Bでお願いします」) ----
   Harumi質問「全ての▶で一時停止・再開できますか？」に対し、数えて3案を出した:
     A 最初から鳴らし直す / **B 自分で押して聞くボタンだけ止められる** / C 全部

   **Bにしたのは、会話の自動再生を止めると会話そのものが止まるから。**
   js/branches.js の相手のターンは `await cue.play()` で次へ進むので、
   途中で止めると **Promise が解けずレッスンが宙に浮く**(CLAUDE.md
   「画面を閉じる時は、その画面を待っているPromiseを必ず解く」と同じ事故)。
   → 止められるのは **利用者が自分で押した「聞く」だけ**。自動再生は
   今までどおり最後まで鳴る。

   ★WebAudio(AudioBufferSourceNode)は**一時停止できない**。止めたら
   そのノードは二度と鳴らないので、「止める＝今どこまで鳴ったかを覚えて
   ノードを捨てる」「続ける＝同じ音を offset から新しいノードで鳴らす」。
   HTMLAudio 経路(ゆっくり・§A-1の最初の1音)は要素の pause()/play() で足りる。

   ★**印は ▶ ↔ ❚❚ の入れ替えだけ。**新しいボタン様式・色は作っていない
   (見た目の文法7bの「状態は既存クラスに足してよい」の範囲)。
   アイコンの差し替えはここ1箇所でやる —— 6種類あるボタンの組み立てを
   触らずに済み、片方だけ直る事故が起きない。 */
const ICON_PLAY_D = 'M8 5v14l11-7z';
const ICON_PAUSE_D = 'M6 5h4v14H6zM14 5h4v14h-4z';
function setBtnIcon(btn, kind) {
  if (!btn) return;
  const path = btn.querySelector('svg path');
  if (!path) return;
  path.setAttribute('d', kind === 'pause' ? ICON_PAUSE_D : ICON_PLAY_D);
}
/* この1本は止められるか(playClip が pausable:true で呼ばれた時だけ true)。
   各再生経路は、この印が立っている時だけ pauseState を残す。 */
let pausableWish = false;
/* 止められる1本の状態。鳴っている間も、止まっている間も入っている。
   { kind:'web'|'el', btn, paused, ... } */
let pauseState = null;
/* どの音(AudioCue)の分か。同じボタンでも中身が入れ替わる所があるので
   (js/earToVoice.js のカルーセルは ‹ › で同じ▶の音が変わる)、
   ボタンだけで「同じ1本」と決めない。 */
let pauseCue = null;

function clearPauseState() {
  if (pauseState && pauseState.btn) {
    pauseState.btn.classList.remove('paused');
    setBtnIcon(pauseState.btn, 'play');
  }
  pauseState = null;
  pauseCue = null;
}

/* いま鳴っている(または止まっている)1本が、このボタンの物か。 */
export function isPausableBtn(btn) {
  return !!(btn && pauseState && pauseState.btn === btn);
}

/* 押された時の toggle。止めた/続けた時は true(呼び出し側は鳴らし直さない)、
   false なら「このボタンの音は鳴っていない」ので最初から鳴らす。 */
export function pauseOrResume(btn) {
  if (!isPausableBtn(btn)) return false;
  return pauseState.paused ? resumePlayback() : pausePlayback();
}

function pausePlayback() {
  if (!pauseState || pauseState.paused) return false;
  if (pauseState.kind === 'web') {
    if (!actx) return false;
    const played = actx.currentTime - pauseState.startedAt;
    const at = pauseState.offset + Math.max(0, played);
    /* 残りが一瞬しか無い時は止めない(押した瞬間に鳴り終わると、
       続けるものが無い「止まったまま」のボタンになる)。 */
    if (!pauseState.buf || at >= pauseState.buf.duration - 0.08) return false;
    pauseState.offset = at;
    stopWebAudio(); /* onended を null にしてから止めるので「終わった」にならない */
  } else {
    try {
      pauseState.el.pause();
    } catch {
      return false;
    }
  }
  clearStallTimer();
  pauseState.paused = true;
  if (pauseState.btn) {
    pauseState.btn.classList.remove('playing');
    pauseState.btn.classList.add('paused');
    setBtnIcon(pauseState.btn, 'play');
  }
  return true;
}

function resumePlayback() {
  if (!pauseState || !pauseState.paused) return false;
  /* 続きも必ず再生用のセッションで鳴らす(§A-1)。Contextは捨てない。 */
  ensurePlaybackAudioSession();
  if (pauseState.kind === 'web') {
    const st = pauseState;
    const wish = pausableWish;
    pausableWish = true;
    const ok = playViaWebAudio(st.src, st.btn, st.onEnded, st.onFail, st.offset);
    pausableWish = wish;
    if (!ok) {
      /* 続けられない時は、最初から鳴らし直す道に戻す(行き止まりを作らない)。 */
      clearPauseState();
      return false;
    }
    if (st.btn) st.btn.classList.remove('paused');
    return true;
  }
  try {
    const p = pauseState.el.play();
    if (p && p.then) p.then(() => {}, () => {});
  } catch {
    clearPauseState();
    return false;
  }
  pauseState.paused = false;
  if (pauseState.btn) {
    pauseState.btn.classList.remove('paused');
    pauseState.btn.classList.add('playing');
    setBtnIcon(pauseState.btn, 'pause');
  }
  return true;
}

/* ---- §A-6 「押したのに音が出ない」からの復帰 ---- */
let playToken = 0;
let stallTimer = null;
let lastPlay = null;
let stallRetried = false;
let stuckHandler = null;

/* 復帰ボタンを出す/消すのは画面側の仕事。ここは知らせるだけ。 */
export function setStuckHandler(fn) {
  stuckHandler = fn;
}
function setPlayStuck() {
  // まだ録っていないファイルは、押しても直らない。復帰ボタンの出番ではない。
  if (lastPlay && notYetRecorded.has(lastPlay.src)) return;
  if (stuckHandler) stuckHandler(true);
}
function clearPlayStuck() {
  if (stuckHandler) stuckHandler(false);
}

function clearStallTimer() {
  if (stallTimer) {
    clearTimeout(stallTimer);
    stallTimer = null;
  }
}

/* 必ずユーザー操作（タップ）の中から呼ぶこと。
   AudioContext 側は rebuildAudioCtx() に一本化する。ここが持つのは
   HTMLAudio 側の後始末だけ（解決集 §C: 中身を書き写さない）。 */
export function resetAudioPipeline() {
  clearStallTimer();
  try {
    player.pause();
  } catch {
    /* 停止済み */
  }
  stopWebAudio();
  player = new Audio();
  rebuildAudioCtx();
}

function onPlayStalled() {
  if (!lastPlay || stallRetried) {
    setPlayStuck();
    return;
  }
  stallRetried = true;
  const l = lastPlay;
  try {
    player.pause();
  } catch {
    /* 停止済み */
  }
  unlockAudioCtx();
  if (playViaWebAudio(l.src, l.btn, l.onEnded, l.onFail)) {
    clearPlayStuck();
    return;
  }
  setPlayStuck();
  if (l.onFail) l.onFail();
}

function playViaWebAudio(src, btn, onEnded, onFail, offset = 0) {
  if (!actx || actx.state !== 'running') return false;
  const buf = pcmCache[src];
  if (!buf) {
    decodeInto(src).catch(() => {});
    return false;
  }
  stopWebAudio();
  const srcNode = actx.createBufferSource();
  srcNode.buffer = buf;
  /* playbackRate はあえて設定しない。WebAudio の playbackRate はピッチも
     変わる（§A-2）。ここに来るのは rate === 1 の時だけ。 */
  srcNode.connect(actx.destination);
  let webAudioEnded = false;
  /* §A-10 この1本ぶんの「止められる」状態。鳴り終わったら自分の分だけ片付ける
     (次の1本が既に始まっていたら巻き添えにしない)。 */
  const myPause = pausableWish
    ? { kind: 'web', src, btn, onEnded, onFail, buf, startedAt: 0, offset, paused: false }
    : null;
  srcNode.onended = () => {
    webAudioEnded = true;
    clearStallTimer();
    if (btn) btn.classList.remove('playing');
    activeSource = null;
    if (pauseState === myPause) clearPauseState();
    if (onEnded) onEnded();
  };
  const t0 = actx.currentTime;
  try {
    srcNode.start(0, offset);
  } catch {
    return false;
  }
  if (myPause) {
    myPause.startedAt = t0;
    pauseState = myPause;
    setBtnIcon(btn, 'pause');
  }
  audioSessionStarted = true;
  lastPlayPath = 'web';
  /* この経路で鳴ったなら出力先は取り直せている。HTMLAudio 用の印は
     消しておく（残すと関係のない場面で頭が二重に鳴る）。 */
  audioRouteKick = false;
  activeSource = srcNode;
  if (btn) btn.classList.add('playing');
  activeButton = btn || null;

  /* §A-4 抜け殻の見張り。生死は時計で判定する。 */
  const watched = actx;
  clearStallTimer();
  stallTimer = setTimeout(() => {
    stallTimer = null;
    if (webAudioEnded || actx !== watched) return;
    if (watched.currentTime - t0 > 0.15) return; /* 進んでいる＝鳴っている */
    onWebAudioDead(src, btn, onEnded, onFail);
  }, 450);
  return true;
}

/* ---- §A-7 マイクの後は、素のHTMLAudioに二度と落とさない(2026-09-01) ----
   Harumi報告 2026-09-01「(相槌ドリルに)初めてすぐここで通話口から音声出てます。
   **もう起こらないように設計して**」。

   受話口の事故は、これまで毎回「WebAudioに乗れなかった時の**逃げ道**が
   素のHTMLAudioだった」ことから起きている。マイクを一度でも使った後の
   HTMLAudioは**必ず受話口**に回る —— つまりこの逃げ道は、逃げた先が崖。
   受話口から鳴った音はほぼ聞こえないので、「鳴らさない」のと実害は同じ、
   なのに「壊れた」という印象だけを残す。

   → **設計として一本化する**: マイクを使ったセッションでは、WebAudioで
   鳴らせない時に**HTMLAudioへ落ちない**。代わりに §A-6 の
   「音を出しなおす」ボタンを出す —— 押した指の中で rebuildAudioCtx() が
   走り、次からスピーカー(WebAudio)で鳴る。マイクをまだ使っていない
   セッションでは、HTMLAudioはスピーカーから出るので従来どおり使ってよい
   (§A-1 最初の1音はHTMLAudio、の設計はそのまま)。

   ★playViaHtmlAudio を直接呼ばない。必ずこの受け皿を通す
   (check-audio-rules ルール17が機械検査する)。 */
function fallbackHtmlOrStuck(src, btn, onEnded, onFail, rate) {
  if (!micUsed) {
    playViaHtmlAudio(src, btn, onEnded, onFail, rate);
    return;
  }
  if (btn) btn.classList.remove('playing');
  setPlayStuck();
  if (onFail) onFail();
}

function onWebAudioDead(src, btn, onEnded, onFail) {
  actxStale = true;
  stopWebAudio();
  if (btn) btn.classList.remove('playing');
  /* §A-7: マイクの後にここでHTMLAudioへ落ちると受話口。落とさず
     「音を出しなおす」へ(マイク前ならHTMLAudioはスピーカーなので従来どおり)。 */
  fallbackHtmlOrStuck(src, btn, onEnded, onFail, 1);
}

function playViaHtmlAudio(src, btn, onEnded, onFail, rate) {
  player = new Audio(srcUrl(src));
  /* iOSの原則: 通常速度では playbackRate に一切触らない（触ると無音になる
     個体がある）。ゆっくりが選ばれている時だけ設定する。 */
  if (rate !== 1) {
    try {
      player.preservesPitch = true;
      player.webkitPreservesPitch = true;
    } catch {
      /* 対応していない端末は等倍のまま */
    }
    try {
      player.playbackRate = rate;
    } catch {
      /* 同上 */
    }
  }
  activeButton = btn || null;
  if (btn) btn.classList.add('playing');

  /* §A-10 素のHTMLAudioも要素の pause()/play() で止まる。 */
  const myPause = pausableWish ? { kind: 'el', el: player, btn, paused: false } : null;
  if (myPause) {
    pauseState = myPause;
    setBtnIcon(btn, 'pause');
  }

  player.onended = () => {
    clearStallTimer();
    if (btn) btn.classList.remove('playing');
    if (pauseState === myPause) clearPauseState();
    if (onEnded) onEnded();
  };
  player.onerror = () => {
    clearStallTimer();
    if (btn) btn.classList.remove('playing');
    // 先読みより先に押された時は、ここが「まだ無い」に気づく最初の場所になる。
    if (player.error && player.error.code === 4) noteNotYetRecorded(src);
    setPlayStuck();
    if (onFail) onFail();
  };
  /* 1コマでも進めば音は出ている。推測ではなく、再生位置が実際に進んだと
     いう証拠でだけ audioSessionStarted を立てる。 */
  player.ontimeupdate = () => {
    if (player.currentTime > 0) {
      audioSessionStarted = true;
      clearStallTimer();
      player.ontimeupdate = null;
    }
  };
  clearPlayStuck();
  /* WebAudio から乗り換えてきた1回目も、ガイド直後と同じ扱いにする。 */
  if (lastPlayPath === 'web') audioRouteKick = true;
  /* 「どちらの経路を選んだか」は選んだ時点で確定している。証拠を待つと、
     その隙にもう一度押された時に乗り換えと誤判定する。 */
  lastPlayPath = 'html';

  const kick = audioRouteKick;
  audioRouteKick = false;
  const kicked = player;
  const p = player.play();
  /* 成功側と失敗側は必ず1つの then() にまとめる（別々に繋ぐと未処理の
     Promise 拒否がコンソールに出る）。 */
  if (p && p.then) {
    p.then(
      () => {
        if (!kick) return;
        setTimeout(() => {
          if (player !== kicked || kicked.ended || kicked.paused) return;
          try {
            kicked.pause();
            kicked.currentTime = 0;
            const again = kicked.play();
            if (again && again.catch) again.catch(() => {});
          } catch {
            /* 鳴らし直せない時は1回目のまま */
          }
        }, ROUTE_KICK_MS);
      },
      () => {
        clearStallTimer();
        if (btn) btn.classList.remove('playing');
        setPlayStuck();
        if (onFail) onFail();
      }
    );
  }
  /* 1.6秒。読み込みの遅い回線でも足りて、待たされたと感じない長さ。 */
  stallTimer = setTimeout(() => {
    stallTimer = null;
    if (player.currentTime > 0 || player.ended) return;
    if (btn) btn.classList.remove('playing');
    onPlayStalled();
  }, 1600);
}

/* 本編の再生。src は speakup/ からの相対パス（例 audio/partner/xxx.mp3）。 */
/* ★2026-09-29 聞き流し(js/listen.js)の「ほかの音が鳴る時は譲る」(Eat Out listenYieldTo)。
   鳴らす前に1回だけ呼ぶ。聞き流し自身の再生かどうかは、あちらが見分ける。 */
let playHook = null;
export function setPlayHook(fn) {
  playHook = fn;
}

export function playClip(src, { btn = null, rate = 1, onEnded = null, onFail = null, pausable = false } = {}) {
  if (playHook) playHook();
  ensurePlaybackAudioSession();
  /* ---- §A-8b マイクの後の最初の「再生のタップ」で、§A-8 と同じ順で作り直す ----
     Harumi報告 2026-09-08(発音タブ)「音声を聞いてからマイクで声を入れる。
     次のエクササイズで『お手本を聞く』を押すと受話口から出る。**マイクを
     押した時の『ピロっ』は必ず正しい所から出る** —— その仕組みをお手本にも
     使えないか」。
     ・「ピロっ」はこのアプリの音ではなく **iOS の認識開始音**(rec.start() が
       録音セッションの中で鳴らす)。借りられる部品では無いが、**その瞬間に
       スピーカーが生きている**ことの証拠にはなる。
     ・受話口になるのは、録音セッションを**またいで生き残った actx** を
       そのまま使うから。2026-09-02(ルール18)の「マイクの後に捨てない」は
       Eatout の getUserMedia の記録が根拠で、**SpeechRecognition(iOS の
       認識器がセッションを握る)は2026-09-05から一度も通っていなかった**
       —— 発音タブで初めて通り、実機で受話口になった。
     ・§A-8 の復帰ボタン(再生宣言 → 作り直し → 鳴らし直し)は同じ状態から
       戻せている。だから**同じ順を、次の再生のタップの中で自動でやる**。
       捨ててよい条件は3つ揃った時だけ: ①録音をまたいだ印が立っている
       ②指で触っている最中(ルール9) ③直前に 'playback' を宣言した(上の1行)。
       タップの外(会話の練習の自動再生)では捨てない —— そこは今までどおり
       §A-8 のボタンが受け皿。actxStale には触らない(ルール18)。 */
  if (ctxLivedThroughMic && inUserGesture()) { ctxLivedThroughMic = false; rebuildAudioCtx(); } /* 1行で書く: ルール9は行単位で inUserGesture() を見る */
  clearStallTimer();
  try {
    player.pause();
  } catch {
    /* 停止済み */
  }
  /* ゆっくり用の要素は止めるだけでなく、ノードごと片付ける
     (繋いだままの要素が残ると、次の再生と重なって濁る)。 */
  resetSlowPlayer();
  stopWebAudio();
  if (activeButton) activeButton.classList.remove('playing');
  lastPlay = { src, btn, onEnded, onFail };
  stallRetried = false;
  /* §A-10 新しい1本を鳴らすので、前の「止められる1本」は忘れる
     (印も▶へ戻す)。pausableWish は次の再生経路が読む —— 途中で decode を
     待つ道(下の8秒の見張り)から playViaWebAudio に入る時も同じ値が要る
     ので、ここで立てたら勝手に下ろさない(次の playClip が上書きする)。 */
  clearPauseState();
  pausableWish = !!pausable;

  /* ★ゆっくり(rate!==1)は、自然なその場スロー再生(preservesPitch)を
     WebAudioの出口(スピーカー)に通して鳴らす(playViaSlowElement)。
     事前生成の遅い音声は不自然で廃止(Harumi判断 2026-08-30)。
     Contextがまだ無い/使えない時は素のHTMLAudioに落ちる(セッション
     最初の1音はどのみちHTMLAudioが正解 — §A-1)。 */
  if (rate !== 1 && (micUsed || audioSessionStarted)) {
    /* 捨てずに起こす(§A-0)。作り直しは本当に鳴らなかった時だけ。 */
    unlockAudioCtxForce();
    /* ★2026-08-31 受話口の真因。ここで無条件に作り直していた。
       会話画面は**マイクの直後に相手のひとことが自動再生**される —— つまり
       タップの外。タップの外での作り直しは、このファイルの §A-0 が
       「スピーカーに紐づいたContextを捨てると、新しいContextが受話口に
       紐づいて二度と戻らない」と自分で書いている禁じ手そのものだった。
       作り直してよいのは指で触っている最中だけ(§A-4「次のタップの中で
       作り直す」の“タップの中”はここ)。触っていない時は捨てずに起こすだけ
       (直前の unlockAudioCtxForce がそれ)。本当に抜け殻だった時は、
       playViaWebAudio の450msの見張りが onWebAudioDead で拾い、そこで
       actxStale を立て直すので、次のタップで作り直される。 */
    if (actxStale && inUserGesture()) rebuildAudioCtx();
    /* ①焼いた「ゆっくり」があれば、それを**等速で**WebAudio再生する
       (Eatoutの本番と同じ形。実機で引き伸ばさないので、低い声でも
       「ガチャガチャ」しない — Harumi報告 2026-08-30「男性のゆっくり
       だけガチャガチャしています」)。 */
    const slowSrc = slowVariant(src);
    if (slowSrc && pcmCache[slowSrc]) {
      if (playViaWebAudio(slowSrc, btn, onEnded, onFail)) {
        clearPlayStuck();
        return;
      }
    } else if (slowSrc) {
      /* 次に押した時に間に合うよう、取り込みだけ始めておく(Eatoutと同じ)。
         無ければ黙って諦める — 焼いていない声はこのまま②へ落ちる。 */
      decodeInto(slowSrc, { quiet: true }).catch(() => noteSlowMissing(slowSrc));
    }
    /* ②焼いた音が無い声は、従来どおりその場スロー(自然な音)をWebAudioの
       出口に通して鳴らす。 */
    if (playViaSlowElement(src, btn, onEnded, onFail, rate)) {
      clearPlayStuck();
      return;
    }
  }

  /* §A-1:
     - 最初の1音は HTMLAudio。2音目からは WebAudio（受話口に回らない）
       micUsed だけを見ると、マイクを使わずに進める道から漏れる。 */
  if (rate === 1 && (micUsed || audioSessionStarted)) {
    /* ここはタップの中なので、iOSでも作り直しが許される。 */
    unlockAudioCtxForce();
    /* ★2026-08-31 受話口の真因。ここで無条件に作り直していた。
       会話画面は**マイクの直後に相手のひとことが自動再生**される —— つまり
       タップの外。タップの外での作り直しは、このファイルの §A-0 が
       「スピーカーに紐づいたContextを捨てると、新しいContextが受話口に
       紐づいて二度と戻らない」と自分で書いている禁じ手そのものだった。
       作り直してよいのは指で触っている最中だけ(§A-4「次のタップの中で
       作り直す」の“タップの中”はここ)。触っていない時は捨てずに起こすだけ
       (直前の unlockAudioCtxForce がそれ)。本当に抜け殻だった時は、
       playViaWebAudio の450msの見張りが onWebAudioDead で拾い、そこで
       actxStale を立て直すので、次のタップで作り直される。 */
    if (actxStale && inUserGesture()) rebuildAudioCtx();
    if (playViaWebAudio(src, btn, onEnded, onFail)) {
      clearPlayStuck();
      return;
    }
    /* PCM がまだ無いだけの時は、HTMLAudio に落とさず**待つ**。
       ★2026-09-01 ここに「1200msで諦めて素のHTMLAudioに落とす」早道があり、
       それが相槌ドリル1問目の受話口の正体だった(Harumi報告「初めてすぐ
       ここで通話口から音声出てます」)。初めて開いた画面は音声をまだ
       取り込んでおらず、電波が細いと1.2秒では届かない —— そして
       マイクの後のHTMLAudioは受話口。**遅いだけなら待てば必ずスピーカー
       (WebAudio)で鳴る**ので、時間切れで崖に飛び降りる理由が無い(§A-7)。 */
    if (actx) {
      const token = ++playToken;
      let settled = false;
      if (btn) btn.classList.add('playing');
      activeButton = btn || null;
      clearPlayStuck();
      const giveUp = () => {
        if (settled || token !== playToken) return;
        settled = true;
        fallbackHtmlOrStuck(src, btn, onEnded, onFail, rate);
      };
      /* 8秒: 弱い電波での初回の取り込みにも届く長さ。それでも来ないのは
         読み込み自体が死んでいる時なので、待たせ続けずに§A-7の受け皿へ。 */
      const waitTimer = setTimeout(giveUp, 8000);
      /* resume() は指で触った今この瞬間に呼ぶ必要がある（iOSの決まり）。 */
      const ready =
        actx.state === 'running' ? Promise.resolve() : resumeQuietly(actx);
      ready
        .then(() => decodeInto(src))
        .then(() => {
          if (settled || token !== playToken) return;
          settled = true;
          clearTimeout(waitTimer);
          if (playViaWebAudio(src, btn, onEnded, onFail)) clearPlayStuck();
          else fallbackHtmlOrStuck(src, btn, onEnded, onFail, rate);
        })
        .catch(() => {
          clearTimeout(waitTimer);
          giveUp();
        });
      return;
    }
  }
  fallbackHtmlOrStuck(src, btn, onEnded, onFail, rate);
}

export function stopAll() {
  clearStallTimer();
  clearPauseState();
  try {
    player.pause();
  } catch {
    /* 停止済み */
  }
  /* ゆっくり用の要素は止めるだけでなく、ノードごと片付ける
     (繋いだままの要素が残ると、次の再生と重なって濁る)。 */
  resetSlowPlayer();
  stopWebAudio();
  if (activeButton) activeButton.classList.remove('playing');
}

/* 効果音。本編の再生を止めたくないので WebAudio でも別ノードで鳴らす
   （activeSource には入れない）。判断は本編と同じにすること —— 効果音だけ
   HTMLAudio＝受話口に残る、というちぐはぐを作らない。 */
export function playSe(src, volume = 1) {
  if ((micUsed || audioSessionStarted) && !actxStale && actx && actx.state === 'running' && pcmCache[src]) {
    try {
      const n = actx.createBufferSource();
      n.buffer = pcmCache[src];
      if (volume !== 1) {
        const g = actx.createGain();
        g.gain.value = volume;
        n.connect(g);
        g.connect(actx.destination);
      } else {
        n.connect(actx.destination);
      }
      n.start(0);
      return;
    } catch {
      /* 下の HTMLAudio に落ちる */
    }
  }
  try {
    ensurePlaybackAudioSession();
    const se = new Audio(srcUrl(src));
    se.volume = volume;
    se.play().catch(() => {});
  } catch {
    /* 効果音は鳴らなくても学習は進む */
  }
}

/* ---- 画面側の使い勝手のための薄い包み ----
   1つの文を何度も鳴らす画面（お手本・リピート）用。中身は playClip なので、
   §A-1〜§A-6 の手当ては全部通る。ここに再生の実装を書き写さないこと。 */
/* ★2026-08-31 Harumi指摘「トグルを女性・ゆっくりにする時に自動で音が鳴る
   ように全てなってるのかなってないのか。なっているところがあるのであれば
   全て同じように反応するように」。
   実際に数えると、声・速さのトグルで**その場で鳴らし直す画面は6つ中2つだけ**
   だった(聞いて、言う/相槌ドリル)。残る4つ(言い方を選ぶ・会話の練習・★一覧2つ)は
   何も起きず、「押さないと鳴らない画面」と「勝手に鳴る画面」が混在していた。
   → **最後に鳴らした1本を覚えておき、トグルを触ったらそれを新しい声・速さで
   もう一度鳴らす**。これなら「どれを鳴らすか決まらない一覧」でも意味が決まる
   (直前に自分が押した行が鳴る)。画面が変わったら忘れる(clearLastCue) ——
   前の画面の文が鳴ると、それこそ何が起きたのか分からない。 */
let lastCue = null;
let lastBtn = null;
/* ★2026-09-04 「この画面で1本でも鳴らしたか」を知らせる。
   §A-8の「スピーカーから直します」は、**まだ一度も鳴らしていない画面**では
   意味が無い(押す理由が無いのに、練習の邪魔をする家具になる)。鳴った後に
   初めて出すため、鳴った瞬間をui.jsへ伝える。 */
let cuePlayedListeners = [];
export function onCuePlayed(fn) {
  cuePlayedListeners.push(fn);
  return () => {
    cuePlayedListeners = cuePlayedListeners.filter((f) => f !== fn);
  };
}
export function noteCuePlayed(cue, btn) {
  lastCue = cue;
  lastBtn = btn && btn.isConnected ? btn : null;
  for (const fn of cuePlayedListeners) {
    try {
      fn();
    } catch {
      /* 聞き手の都合でここを止めない */
    }
  }
}
export function clearLastCue() {
  lastCue = null;
  lastBtn = null;
}
export function hasLastCue() {
  return !!lastCue;
}
/* 声・速さを変えた直後に呼ぶ。まだ何も鳴らしていない画面では静かに何もしない。 */
export function replayLastCue(rate) {
  if (!lastCue) return Promise.resolve(false);
  const btn = lastBtn && lastBtn.isConnected ? lastBtn : null;
  return lastCue.play({ rate, btn });
}

export class AudioCue {
  // urlOrResolver は固定URLの文字列でも、呼ぶたびに現在のURLを返す関数でも
  // よい。声（男性/女性）はEatoutと同じく画面の途中でトグルできるので、
  // 一度作った AudioCue を使い回しても、次に再生した時は必ずいまの声で
  // 鳴るように、関数の場合は毎回の play() で呼び直す。
  constructor(urlOrResolver) {
    this._resolve = typeof urlOrResolver === 'function' ? urlOrResolver : () => urlOrResolver;
    this.endedResolvers = [];
    /* 2026-08-31: 焼いた「ゆっくり」も一緒に載せる。載せないと、ファイルが
       あるのに使われず、毎回その場スロー＝ぶつぎりになる(CLAUDE.md
       「焼いただけでは使われない」)。画面側の withSlowVariants と同じ手当てを
       ここでもやっておくと、1文だけ鳴らす画面が取りこぼさない。 */
    this._warm(this._resolve());
  }

  _warm(url) {
    if (!url) return;
    const slow = slowVariant(url);
    preloadAudio(slow ? [url, slow] : [url]);
  }

  get url() {
    return this._resolve();
  }

  play({ rate = 1, btn = null, pausable = false } = {}) {
    /* 声(男性/女性)は画面の途中で切り替わる。切り替えた直後の1音が
       ネット再生に落ちないよう、鳴らす前にいまのURLも載せておく
       (preloadAudio は二重呼び出しを無視する)。 */
    this._warm(this._resolve());
    /* 声・速さのトグルを触った時に鳴らし直せるよう、最後の1本を覚える。 */
    noteCuePlayed(this, btn);
    return new Promise((resolve) => {
      playClip(this._resolve(), {
        btn,
        rate,
        pausable,
        onEnded: () => {
          this._flush();
          resolve(true);
        },
        onFail: () => {
          this._flush();
          resolve(false);
        },
      });
    });
  }

  _flush() {
    const list = this.endedResolvers;
    this.endedResolvers = [];
    list.forEach((r) => r());
  }

  waitEnded() {
    return new Promise((resolve) => this.endedResolvers.push(resolve));
  }

  stop() {
    stopAll();
  }
}

/* ---- §A-10 押す側の入口(2026-09-24) ----
   「自分で押して聞く」ボタンは、必ずこれを通す:
     ・その音が鳴っている  → 止める(▶に戻る)
     ・止まっている        → 続き から鳴らす(❚❚に戻る)
     ・鳴っていない        → 最初から鳴らす(止められる印を付けて)

   ★**自動再生では呼ばない。** js/branches.js の相手のターンは
   `await cue.play()` で次へ進むので、止めると会話が宙に浮く(§A-10の冒頭)。
   自動再生は今までどおり `cue.play({ rate })`(btn を渡さない)のまま。 */
export function playOrPause(cue, { rate = 1, btn = null } = {}) {
  /* 同じボタン **かつ** 同じ音の時だけ toggle。音が入れ替わっていたら
     (カルーセルの ‹ ›)、止まっている前の音を続けてしまわないよう
     最初から鳴らす。 */
  if (pauseCue === cue && pauseOrResume(btn)) return Promise.resolve(true);
  /* ★順番に意味がある: cue.play() の中の playClip が「前の1本」を忘れる
     (clearPauseState)ので、印を付けるのは**そのあと**。先に付けると
     自分で消してしまい、2回目のタップが止められない。 */
  const p = cue.play({ rate, btn, pausable: true });
  pauseCue = cue;
  return p;
}
