#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Speak Up 聞き取りクイズ(/speakup/quiz/)の素材を、本体から作る。

★このクイズは「新しく作った物」を持たない。HARU様の指示(2026-10-05):
  「何も新しく作らない。Speak Up の CLAUDE.md・ルールブックを尊重し、同じフォント・
   同じ余白・同じ全部を使う。発音・つながる音のルールは自分のデータベースから」。

  1. 見た目と部品 … 本体(harmonyhorizon.foreigners/speakup)の css と js を
     **1文字も変えずにコピー**する(lib/css, lib/js)。書き直さない。
     クイズの画面は、その ui.js / audio.js の関数をそのまま呼ぶだけ。
  2. 中身 … 本体の data/scenarios/*.json から**機械で**取り出す。
     英文・和訳・「こう聞こえます」・「なぜ聞き取れない？」の文は一字も打っていない。
     数字(パターンの種類・説明の数)も、このデータを数えた値。
  3. 音声 … 本体の audio/ のファイルをそのままコピーする(作り直さない)。

使い方:
    python3 tools/build-speakup-quiz.py --app /path/to/harmonyhorizon.foreigners
本体を直したら、このスクリプトをもう一度走らせて写し直す(手で直さない)。
"""
import argparse, glob, json, os, re, shutil, subprocess, sys, zlib
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'speakup', 'quiz')

# 出題する4本。どの音(パターン)を試すかだけが、ここで決める編集の部分。
# 英文・和訳・解説は、audio_id から本体のデータを引く。
# 2026-10-05 英語講師の目で選び直した(HARU様指示)。基準:
#  ・外国人に話しかけた時、実際に相手の口から出る短い文(4〜6語)
#  ・単語は全部知っているのに、聞くと別の音になる(クイズの「えっ」)
#  ・HARU様が柱にしている4つのパターンを1問ずつ。やさしい驚き→具体的な場面の順
#  ・Q2とQ3は同じレッスン(駅の出口で道に迷った旅行者)=1つの小さな場面でつながる
#  ・I-HELP-4 は LP に出る会話なので、音声は LP 品質で作り直してある
QUESTIONS = [
    ('I-FROM-1_b2n1', 'i-from-1', '母音ドッキング'),   # Have you ever been there?
    ('I-HELP-4_b2n1', 'i-help-4', '消えるT'),         # Actually, I'm a bit lost.
    ('I-HELP-4_b2n2', 'i-help-4', 'Toの弱形'),        # I'm going to this karaoke place.
    ('I-HELP-6_b2n6', 'i-help-6', 'Flap T'),          # Right at the bank.
]
# 聞こえ方の直し(HARU様 2026-10-05「べねぁ → べんねぁ」。「まずはクイズだけ直して」)。
# 本体の台本(listening.py)にも同じ直しがある。本体の main に入ったら、この表は空にしてよい
# (本体が直っていれば、置き換えは何も起きない)。
HEARD_FIXES = [('べねぁ', 'べんねぁ')]
# 説明の追加(HARU様 2026-10-06「been の i も重要」)。型は本体 listening.py の定型文
# 【い/えの中間音】と同じ。並びは「母音の音 → ほかの発音 → つながる音」なので先頭に足す。
# 本体の台本にも同じ一文を足してもらう必要がある(足されたら、この表は空にしてよい)。
WHY_PREPEND = {
    'I-FROM-1_b2n1': '【い/えの中間音】"been" の i は、日本語の「い」ではなく、「え」と「い」の中間のような音です。そのため、知っている単語でも別の音に聞こえることがあります。',
}
# はずれの選択肢(HARU様 2026-10-05「選択肢がつまらない」)。ランダムではなく、
# 聞き間違えそうな訳を問いごとに決めた。並びは HARU様の指定(正解の位置は quiz.js の ANSWER_AT)。
#  Q1 been を「存在した」と取る / 似た場面の質問 ・ Q2 lost=負けた / Actually, I'm を人名に
#  Q3 going を歌のタイトルに / karaoke を「カラッと」に ・ Q4 Right=正しい / Right at を人名に
DECOYS = {
    'I-FROM-1_b2n1': ['あなたは、存在したことがありますか？', 'よくここに来るんですか？'],
    'I-HELP-4_b2n1': ['実はさぁ、負けちゃってさぁ。', 'アシュリーは、ちょっとラストです。'],
    'I-HELP-4_b2n2': ['カラオケで「Going」歌いたいんです。', '明日の天気はカラッと快晴、オッケー。'],
    'I-HELP-6_b2n6': ['正しくは銀行です。', 'ライラは銀行にいる。'],
}
HERO_SCENE = 'i-help-4'   # はじめの画面の写真(LPのカラオケへの道と同じ)

# 本体からそのままコピーするファイル(クイズが使う部品だけ)。
LIB_FILES = [
    'css/tokens.css', 'css/main.css',
    'js/ui.js', 'js/audio.js', 'js/copy.js', 'js/playerState.js', 'js/storage.js',
    'js/vendor/budoux/parser.js', 'js/vendor/budoux/ja.js',
]
SE_FILES = ['audio/se_tick.mp3', 'audio/se_celebrate.mp3']


def walk_partner(obj, found):
    if isinstance(obj, dict):
        p = obj.get('partner')
        if isinstance(p, dict) and p.get('audio_id'):
            found.append((obj, p))
        for v in obj.values():
            walk_partner(v, found)
    elif isinstance(obj, list):
        for v in obj:
            walk_partner(v, found)


def bigrams(s):
    s = re.sub(r'^(ええ、|あ、|わあ、|へえ、|はい。|うん、)', '', s)
    s = re.sub(r'[、。！？!?\s]', '', s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def dice(a, b):
    A, B = bigrams(a), bigrams(b)
    return 2 * len(A & B) / (len(A) + len(B)) if A and B else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--app', required=True, help='harmonyhorizon.foreigners のチェックアウト')
    args = ap.parse_args()
    app = os.path.abspath(args.app)
    spk = os.path.join(app, 'speakup')

    # --- 1. 本体の css / js をそのままコピー ---
    for rel in LIB_FILES:
        dst = os.path.join(OUT, 'lib', rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(spk, rel), dst)

    # --- 2. データを本体から取り出す ---
    lines = {}          # audio_id -> partner dict
    scene_of = {}       # scenario id -> (image, situation_ja)
    lesson_of = {}      # audio_id -> lesson json file
    all_partner = []    # (audio_id, ja, lesson)
    total_lessons = 0
    label_lines = Counter()      # ラベル -> その説明を持つセリフの数
    tipped = 0
    for f in sorted(glob.glob(os.path.join(spk, 'data/scenarios/i-*.json'))):
        total_lessons += 1
        d = json.load(open(f))
        scene_of[os.path.basename(f)[:-5]] = (d.get('image'), d.get('situation_ja', ''))
        found = []
        walk_partner(d, found)
        seen = set()
        for _, p in found:
            aid = p['audio_id']
            if aid in seen:
                continue
            seen.add(aid)
            lines[aid] = p
            lesson_of[aid] = os.path.basename(f)
            all_partner.append((aid, p['ja'], os.path.basename(f)))
    for aid, p in lines.items():
        l = p.get('listening')
        if l and l.get('why'):
            tipped += 1
            for lab in set(re.findall(r'【([^】]+)】', l['why'])):
                label_lines[lab] += 1

    questions = []
    for qi, (aid, sid, primary) in enumerate(QUESTIONS):
        p = lines[aid]
        assert primary in p['listening']['why'], (aid, primary)
        # はずれ: 他のレッスンの相手のセリフの和訳から。正解と似ていない物だけ、
        # はずれ同士も似ていない物だけ(本体 js/branches.js pickQuizOptions の考え方。
        # 同じレッスンは外す)。決まった順に拾うので、毎回同じ結果になる。
        decoys = []
        for did, dja, dlesson in all_partner:
            if dlesson == lesson_of[aid] or did == aid:
                continue
            if abs(len(dja) - len(p['ja'])) > 10:
                continue
            if dice(dja, p['ja']) >= 0.2 or any(dice(dja, x) >= 0.2 for x in decoys):
                continue
            # 取り違えやすい過去形・現在形のちがいだけの物は避けるため、固定の間引き
            if (zlib.crc32(did.encode()) + qi) % 7 != 0:
                continue
            decoys.append(dja)
            if len(decoys) == 2:
                break
        decoys = list(DECOYS.get(aid, decoys))
        assert len(decoys) == 2, aid
        heard, why = p['listening'].get('heard', ''), p['listening']['why']
        for old, new in HEARD_FIXES:
            heard, why = heard.replace(old, new), why.replace(old, new)
        if aid in WHY_PREPEND and WHY_PREPEND[aid][:6] not in why:
            why = WHY_PREPEND[aid] + why
        questions.append({
            'id': aid, 'en': p['en'], 'ja': p['ja'],
            'heard': heard, 'why': why,
            'primary': primary, 'decoys': decoys,
            'image': scene_of[sid][0], 'situation': scene_of[sid][1],
        })

    data = {
        'hero': {'image': scene_of[HERO_SCENE][0], 'situation': scene_of[HERO_SCENE][1]},
        'questions': questions,
        'stats': {
            'lessons': total_lessons,
            'partner_lines': len(lines),
            'tipped_lines': tipped,
            'patterns': len(label_lines),
            'explanations': sum(label_lines.values()),
            'by_label': {k: v for k, v in label_lines.most_common()},
        },
        'source': subprocess.run(['git', '-C', app, 'rev-parse', '--short', 'HEAD'],
                                 capture_output=True, text=True).stdout.strip(),
    }
    # 既存の newsletter 設定(MailerLiteの接続先)は上書きしない
    path = os.path.join(OUT, 'quiz-data.json')
    if os.path.exists(path):
        try:
            data['newsletter'] = json.load(open(path)).get('newsletter', {})
        except Exception:
            pass
    data.setdefault('newsletter', {'endpoint': '', 'group': ''})
    json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1)

    # --- 3. 音声(男女・ふつう・ゆっくり)をそのままコピー ---
    for aid, _sid, _p in QUESTIONS:
        for voice in ('partner', 'partner-f'):
            for suf in ('', '_slow'):
                rel = f'audio/{voice}/{aid}{suf}.mp3'
                dst = os.path.join(OUT, 'lib', rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copyfile(os.path.join(spk, rel), dst)
    imgs = {q['image'] for q in questions} | {data['hero']['image']}
    for rel in sorted(imgs):
        dst = os.path.join(OUT, 'lib', rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(spk, rel), dst)
    for rel in SE_FILES:
        dst = os.path.join(OUT, 'lib', rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(spk, rel), dst)

    s = data['stats']
    print(f"本体 {data['source']} から作成: 問題{len(questions)} / "
          f"{s['lessons']}レッスン・相手のセリフ{s['partner_lines']}本のうち{s['tipped_lines']}本に解説 / "
          f"パターン{s['patterns']}種類・説明{s['explanations']}件")


if __name__ == '__main__':
    sys.exit(main())
