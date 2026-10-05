#!/usr/bin/env bash
# Speak Up クイズ用の書体(Zen Kaku Gothic New 400/700/900)を作る。
# HARU様の指示 2026-10-05「ヒラギノは使わないで。読みにくいので」。
# 本体の書体指定(端末の標準=ヒラギノ)を、このページだけ quiz.css で置き換える。
# クイズに出る字は、quiz.js・quiz-data.json・lib/js/copy.js から集める(和文+ASCII)。
# 文言やデータを変えたら流し直すこと。抜けた字はヒラギノ(端末の既定)で出てしまう。
#   pip install fonttools brotli
set -euo pipefail
cd "$(dirname "$0")/../speakup/quiz"
OUT=lib/fonts; mkdir -p "$OUT"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
python3 - "$TMP/keep.txt" <<'PY'
import sys, pathlib
src = ''.join(open(f, encoding='utf-8').read() for f in ('quiz.js', 'quiz-data.json', 'lib/js/copy.js'))
keep = {c for c in src if ord(c) >= 0x2000 and c not in '​'}
keep |= {chr(c) for c in range(0x20, 0x7f)} | {chr(c) for c in range(0x3040, 0x3100)}
keep |= set('　、。・「」『』（）〈〉《》—…〜％＆／：；？！＋－＝←→›‹')
pathlib.Path(sys.argv[1]).write_text(''.join(sorted(keep)), encoding='utf-8')
print(len(keep), '字')
PY
mapfile -t K < <(curl -sS --max-time 30 -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700;900&display=swap" | grep -oE "https://fonts\.gstatic\.com[^)]*\.ttf")
i=0; for w in 400 700 900; do
  curl -sS --max-time 90 -o "$TMP/k$w.ttf" "${K[$i]}"; i=$((i+1))
  pyftsubset "$TMP/k$w.ttf" --text-file="$TMP/keep.txt" --flavor=woff2 --layout-features="palt,kern,liga" \
    --no-hinting --desubroutinize --output-file="$OUT/zen-kaku-$w.woff2"
done
ls -l "$OUT"
