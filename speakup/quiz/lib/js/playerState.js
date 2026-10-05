// EAR TO VOICE — Talk to a Visitor
// 声(お手本の男性/女性)と速さ(ふつう/ゆっくり)は、Eatoutと同じく
// 「最初に1回選ぶ設定」ではなく「毎回の音声の下のトグル」にする
// (harmony-horizon/eatout/listening/index.html の voice/rate と同じ考え方)。
//
// - voice は選ぶまでランダム、選んだらセッション中ずっとその声のまま
//   (画面を移動しても勝手に戻らない。Eatout: 「以前は質問ごとにランダムに
//   戻り、女性を選んだのに次の質問で男性が鳴って『勝手に声が変わった』と
//   感じさせていた」)。ページを閉じて開き直すとまたランダムに戻る
//   (localStorageには保存しない — Eatoutも同じ)。
// - rate は画面が変わるたびに 1.0 に戻る(Eatoutは各 showXxx() の先頭で
//   毎回 `rate = 1;` していた。ここでは router 側で一括してやる)。

/* ★2026-09-29 Harumi決定「選んだ声を端末に覚えておく:はい」。
   選んだ声は localStorage(etv.talk.voice)に残し、次の日に開いても同じ声にする。
   まだ一度も選んでいない人だけ、今までどおりランダム。上の「localStorageには
   保存しない」は、この決定で取り消し。速さは今までどおり画面ごとに「ふつう」へ戻す。 */
const VOICE_KEY = 'etv.talk.voice';
function savedVoice() {
  try {
    const v = JSON.parse(localStorage.getItem(VOICE_KEY));
    return v === 'f' || v === 'm' ? v : null;
  } catch (_) {
    return null;
  }
}
const initialVoice = savedVoice();

export const playerState = {
  voice: initialVoice || (Math.random() < 0.5 ? 'f' : 'm'),
  voiceChosen: !!initialVoice,
  rate: 1,
};

export function setVoice(v) {
  playerState.voice = v;
  playerState.voiceChosen = true;
  try {
    localStorage.setItem(VOICE_KEY, JSON.stringify(v));
  } catch (_) {
    /* 保存できない端末(プライベート窓など)では、今までどおりこの回だけ覚える */
  }
}

export function setRate(r) {
  playerState.rate = r;
}

// 速さ(ふつう/ゆっくり)は、画面が変わるたびに「ふつう」へ戻す。
//
// ★2026-08-31 経緯(同じ日に外して、戻した)。判断が2回動いているので
//   両方の理由を残す:
//   1. 朝: Harumi報告「ゆっくりに変えたのに、会話に入ったらめちゃくちゃ
//      早く話す」→ この関数が原因だったので**削除**し、保持する形にした。
//   2. 夜: Harumi再決定「**画面が変わるたびに速さが1.0へ戻した方がやはり
//      いい**」→ **戻した**。
//   1のときの本当の問題は「戻ること」ではなく、**戻ったのに直す場所が
//   その画面に無かったこと**(会話の練習には声・速さが置いていなかった)。
//   そちらは別途直してあり、いまは音が鳴る練習画面には必ず声・速さがある。
//   ゆっくりは「その画面だけの助け」で、次の画面ではまた普通に聞いてみる ——
//   という移植元(Eatout)の考え方に戻したことになる。
// 声(男性/女性)は選んだらセッション中ずっと保持する(ここでは触らない)。
export function resetRateForNewScreen() {
  playerState.rate = 1;
}
