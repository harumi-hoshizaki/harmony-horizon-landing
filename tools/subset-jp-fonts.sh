#!/usr/bin/env bash
# 和文の書体を「このページに出てくる字」だけに絞り直す。
#
# index.html の文言を書き換えたら必ず流すこと。追加した字が抜けていると、
# その字だけ端末の既定の書体で出て、見出しの中で一字だけ形が違う。
#
#   pip install fonttools brotli
#   bash tools/subset-jp-fonts.sh
#
# 元の ttf は Google Fonts から取る（どちらも SIL Open Font License 1.1）。
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="assets/site/fonts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ 使われている字を集める"
python3 - "$TMP/keep.txt" <<'PY'
import re, sys, pathlib
import glob
def is_jp_char(c):
    """和文の書体で描く必要がある字か。

    `ord(c) > 0x2000` だけで判定すると、絵文字（U+1F300 以降など）や
    記号（✓ など）まで「和文書体に無ければ抜け」と誤判定する。
    絵文字はどのみち絵文字フォントで描かれ、Zen Kaku/Mincho には
    そもそも収録されていない。2026-08-28、販売LPを検査対象に加えた
    直後にこれで誤検出した（☕🎤🎧😳 など14字）。
    実際に和文書体が要る範囲だけを明示する。
    """
    o = ord(c)
    return (
        0x3000 <= o <= 0x303F or   # CJK の記号・句読点（。、「」など）
        0x3040 <= o <= 0x30FF or   # ひらがな・カタカナ
        0x31F0 <= o <= 0x31FF or   # カタカナ拡張
        0x3400 <= o <= 0x4DBF or   # CJK拡張A
        0x4E00 <= o <= 0x9FFF or   # CJK統合漢字
        0xF900 <= o <= 0xFAFF or   # CJK互換漢字
        0xFF00 <= o <= 0xFFEF      # 全角英数・半角カナ
    )

body = ''
def strip_code_comments(text, suffix):
    # 注釈の日本語は画面に出ない。数えると注釈を書くたびに書体が太る。
    # check-jp-fonts.py と同じ規則。片方だけ直すと両者がずれる。
    if suffix == '.py':
        text = re.sub(r'^\s*#.*$', '', text, flags=re.M)
        text = re.sub(r'^\s*\"\"\"(?:.|\n)*?\"\"\"', '', text, flags=re.M)
    elif suffix == '.js':
        text = re.sub(r'/\*(?:.|\n)*?\*/', '', text)
        text = re.sub(r'^\s*//.*$', '', text, flags=re.M)
    return text

# 法務ページも対象。ここを忘れると法務ページだけ字が欠ける（追補5 §171）。
# 2026-08-28: 販売LP（eatout/immigration/speakup）が漏れていた。
# build-site.py が組む content/pages 配下しか見ておらず、単体の
# index.html として書いている3つの販売LPは一度も検査されていなかった。
# 「和文の書体に抜けなし」が出続けていたのは、見ていなかっただけ。
for f in (sorted(glob.glob('content/pages/*.html')) + sorted(glob.glob('content/legal/*.html'))
          + sorted(glob.glob('eatout/*.html')) + sorted(glob.glob('immigration/*.html'))
          + sorted(glob.glob('speakup/*.html'))
          + ['tools/build-site.py', 'assets/site/site.js']):
    h = strip_code_comments(open(f, encoding='utf-8').read(), pathlib.Path(f).suffix)
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', h, flags=re.S)
    vals = ' '.join(re.findall(r'(?:aria-label|data-on|data-off|content|title|placeholder)="([^"]*)"', t))
    body += re.sub(r'<[^>]+>', ' ', t) + ' ' + vals

keep = {c for c in body if is_jp_char(c)}
keep |= set(chr(c) for c in range(0x3040, 0x30FF))      # かな一式は余裕を持って残す
keep |= set('　、。・「」『』（）〈〉《》—…〜％＆／：；？！＋－＝')
keep |= set(chr(c) for c in range(0xFF10, 0xFF1A))      # 全角数字
pathlib.Path(sys.argv[1]).write_text(''.join(sorted(keep)), encoding='utf-8')
print(f'   {len(keep)} 字')
PY

fetch() { # $1=family:wght  $2=出力名の並び
  curl -sS --max-time 30 "https://fonts.googleapis.com/css2?family=$1&display=swap" \
    | grep -oE "https://fonts\.gstatic\.com[^)]*\.ttf"
}

sub() { # $1=ttf  $2=出力ファイル名
  pyftsubset "$1" --text-file="$TMP/keep.txt" --flavor=woff2 \
    --layout-features="palt,vert,vrt2,kern,liga" \
    --no-hinting --desubroutinize --output-file="$OUT/$2"
  printf '   %-32s %6.1f KB\n' "$2" "$(echo "scale=1; $(stat -c%s "$OUT/$2")/1024" | bc)"
}

echo "→ Zen Old Mincho"
mapfile -t M < <(fetch "Zen+Old+Mincho:wght@400;600")
curl -sS --max-time 90 -o "$TMP/m400.ttf" "${M[0]}"
curl -sS --max-time 90 -o "$TMP/m600.ttf" "${M[1]}"
sub "$TMP/m400.ttf" zen-old-mincho-400-jp.woff2
sub "$TMP/m600.ttf" zen-old-mincho-600-jp.woff2

echo "→ Zen Kaku Gothic New"
# Zen Kaku Gothic New に 600 は無い（300/400/500/700/900）。
# 600 を指定すると合成太字（偽ボールド）で描かれ、和文は輪郭が
# つぶれて安っぽく見える。実測で 61 か所が合成太字になっていた。
# 見出し用に本物の 700 を持たせる。
mapfile -t K < <(fetch "Zen+Kaku+Gothic+New:wght@400;500;700")
curl -sS --max-time 90 -o "$TMP/k400.ttf" "${K[0]}"
curl -sS --max-time 90 -o "$TMP/k500.ttf" "${K[1]}"
curl -sS --max-time 90 -o "$TMP/k700.ttf" "${K[2]}"
sub "$TMP/k400.ttf" zen-kaku-400-jp.woff2
sub "$TMP/k500.ttf" zen-kaku-500-jp.woff2
sub "$TMP/k700.ttf" zen-kaku-700-jp.woff2

echo "完了。合計 $(du -sh "$OUT" | cut -f1)"
