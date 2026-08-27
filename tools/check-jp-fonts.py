#!/usr/bin/env python3
"""和文の部分集合に抜けがないか確かめる。

index.html の文言を書き換えて subset-jp-fonts.sh を流し忘れると、
追加した字だけが端末の既定の書体で出る。見出しの中で一字だけ形が違う、
という壊れ方をするので目視では気づきにくい。公開前に必ず流すこと。

    pip install fonttools brotli
    python3 tools/check-jp-fonts.py
"""
import re, sys, pathlib
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ['zen-old-mincho-600-jp', 'zen-old-mincho-400-jp',
         'zen-kaku-400-jp', 'zen-kaku-500-jp']
_R = pathlib.Path(__file__).resolve().parent.parent
# 法務ページも対象。絞る側と同じ集合にすること（追補5 §171）。
PAGES = sorted((_R / 'content/pages').glob('*.html')) + sorted((_R / 'content/legal').glob('*.html'))

def strip_code_comments(text, suffix):
    """注釈の日本語を拾わない。

    build-site.py や site.js には、なぜそう書いたかを日本語で残している。
    それを字面として数えると、画面に出ない字のために部分集合が太る
    （注釈を一行足すたびに書体を作り直す羽目になる）。
    """
    if suffix == '.py':
        text = re.sub(r'^\s*#.*$', '', text, flags=re.M)
        text = re.sub(r'^\s*"""(?:.|\n)*?"""', '', text, flags=re.M)
    elif suffix == '.js':
        text = re.sub(r'/\*(?:.|\n)*?\*/', '', text)
        text = re.sub(r'^\s*//.*$', '', text, flags=re.M)
    return text

body = ''
for f in PAGES + [ROOT / 'tools/build-site.py', ROOT / 'assets/site/site.js']:
    h = strip_code_comments(f.read_text(encoding='utf-8'), f.suffix)
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', h, flags=re.S)
    vals = ' '.join(re.findall(r'(?:aria-label|data-on|data-off|content|title|placeholder)="([^"]*)"', t))
    body += re.sub(r'<[^>]+>', ' ', t) + ' ' + vals
need = {c for c in body if ord(c) > 0x2000}

fail = 0
for name in FONTS:
    path = ROOT / 'assets/site/fonts' / f'{name}.woff2'
    if not path.exists():
        print(f'✕ {name}: ファイルがない'); fail += 1; continue
    cmap = set()
    for tb in TTFont(path)['cmap'].tables:
        cmap |= set(tb.cmap.keys())
    missing = sorted(c for c in need if ord(c) not in cmap)
    if missing:
        print(f'✕ {name}: {len(missing)} 字が抜けている → {"".join(missing[:40])}')
        fail += 1
    else:
        print(f'✓ {name}: {len(need)} 字すべて含まれている')

if fail:
    print('\nbash tools/subset-jp-fonts.sh を流してください。')
    sys.exit(1)
print('\n和文の書体に抜けなし。')
