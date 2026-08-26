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
PAGES = sorted((pathlib.Path(__file__).resolve().parent.parent / 'content/pages').glob('*.html'))

body = ''
for f in PAGES + [ROOT / 'tools/build-site.py', ROOT / 'assets/site/site.js']:
    h = f.read_text(encoding='utf-8')
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
