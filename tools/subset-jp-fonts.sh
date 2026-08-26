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
body = ''
for f in sorted(glob.glob('content/pages/*.html')) + ['tools/build-site.py', 'assets/site/site.js']:
    h = open(f, encoding='utf-8').read()
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', h, flags=re.S)
    vals = ' '.join(re.findall(r'(?:aria-label|data-on|data-off|content|title|placeholder)="([^"]*)"', t))
    body += re.sub(r'<[^>]+>', ' ', t) + ' ' + vals

keep = {c for c in body if ord(c) > 0x2000}
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
mapfile -t K < <(fetch "Zen+Kaku+Gothic+New:wght@400;500")
curl -sS --max-time 90 -o "$TMP/k400.ttf" "${K[0]}"
curl -sS --max-time 90 -o "$TMP/k500.ttf" "${K[1]}"
sub "$TMP/k400.ttf" zen-kaku-400-jp.woff2
sub "$TMP/k500.ttf" zen-kaku-500-jp.woff2

echo "完了。合計 $(du -sh "$OUT" | cut -f1)"
