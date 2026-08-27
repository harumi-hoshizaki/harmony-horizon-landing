#!/usr/bin/env python3
"""4ページを組み立てる。骨格はここ、本文は content/pages/*.html。

ヘッダーと脚注を4ページに書き写すと、片方だけ直す事故が必ず起きる。
骨格は1か所に置き、本文だけを差し替える。

    python3 tools/build-site.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'content/pages'

# slug, 出力先, ページ名, <title>, description
PAGES = [
    ('index', 'index.html', 'Home', 'Harmony Horizon — 耳から、声へ。',
     '完璧な英語は必要ありません。聞く力を起点に、話せるようになるまでを一続きにする、HARU のマンツーマン英語レッスン。モントリオールからオンラインで。'),
    ('programs', 'programs.html', 'Programs', 'レッスンについて — Harmony Horizon',
     'あなただけの目標に合わせた、完全個別のマンツーマン指導。個別カウンセリングから始まるオーダーメイド設計です。'),
    ('student-voices', 'student-voices.html', 'Student Voices', '受講者の声 — Harmony Horizon',
     '点数や評価では見えないものがあります。レッスンを受けた方が、ご自身の言葉で書いた感想です。'),
    ('contact', 'contact.html', 'Contact', 'お問い合わせ — Harmony Horizon',
     '初回のご連絡は、レッスンの申し込みではありません。今の悩みや目標をお聞かせください。24〜48時間以内にご返信します。'),
]

# 法務3ページ。ナビには入れないが、**脚注から必ず辿れる**ようにする。
# 販売しているのはこのドメインなので、特定商取引法の表記は
# 購入ページから辿れなければならない（追補2 §126）。
LEGAL = [
    ('privacy',   'legal/privacy/index.html',   'プライバシーポリシー',
     'Harmony Horizon の各アプリが、どの情報をどこに保存し、どこへ送るかを書いています。'),
    ('terms',     'legal/terms/index.html',     '利用規約',
     'Harmony Horizon の各アプリをお使いいただくうえでの取り決めです。'),
    ('tokushoho', 'legal/tokushoho/index.html', '特定商取引法に基づく表記',
     '通信販売にあたり、特定商取引法で表示が求められている事項です。'),
]

NAV = [('index.html', '考え方'), ('programs.html', 'レッスン'),
       ('student-voices.html', '受講者の声'), ('contact.html', 'お問い合わせ')]

SHELL = '''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://www.harmonyhorizon.space/{canon}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://www.harmonyhorizon.space/{canon}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/site/fonts.css">
<link rel="stylesheet" href="/assets/site/site.css">
<script>document.documentElement.className = "js";</script>
</head>
<body>
<a class="skip" href="#main">本文へ移動</a>

<header class="hdr">
  <div class="wrap hdr__in">
    <a class="brand" href="/">Harmony Horizon<span>耳から、声へ</span></a>
    <nav class="hdr__nav" aria-label="主要ナビゲーション">
{nav}
    </nav>
    <button class="burger" type="button" aria-expanded="false" aria-controls="drawer" aria-label="メニュー"><i></i><i></i><i></i></button>
  </div>
</header>

<div class="drawer" id="drawer" data-open="false">
  <nav class="drawer__nav" aria-label="メニュー">
{dnav}
  </nav>
  <a class="btn" href="/contact.html">相談する</a>
</div>

<main id="main">
{body}
</main>

<footer class="ftr">
  <div class="wrap">
    <div class="ftr__grid">
      <div>
        <p class="ftr__brand">Harmony Horizon</p>
        <p class="small">耳から、声へ。<br>HARU によるマンツーマンの英語レッスン。<br>カナダ・モントリオールから、オンラインで。</p>
      </div>
      <nav aria-label="フッターのナビゲーション">
{fnav}
      </nav>
      <div>
        <p class="ftr__k">連絡先</p>
        <a class="ftr__mail" href="mailto:haru@harmonyhorizon.space">haru@harmonyhorizon.space</a>
      </div>
    </div>
    <div class="ftr__legal">
      <span>© <span class="yr">2026</span> Harmony Horizon</span>
      <a href="/legal/privacy/">プライバシーポリシー</a>
      <a href="/legal/terms/">利用規約</a>
      <a href="/legal/tokushoho/">特定商取引法に基づく表記</a>
    </div>
  </div>
</footer>

<script src="/assets/site/site.js" defer></script>
</body>
</html>
'''

def render(src_dir, slug, out, title, desc, body_class=''):
    def links(indent):
        rows = []
        for href, label in NAV:
            cur = ' aria-current="page"' if href == out else ''
            rows.append(f'{indent}<a href="/{href}"{cur}>{label}</a>')
        return '\n'.join(rows)
    body = (src_dir / f'{slug}.html').read_text(encoding='utf-8').rstrip()
    if body_class:
        # 法務の本文は素の HTML なので、ここで節と余白のコンテナに包む。
        # 4ページの本文は自前で <section><div class="wrap"> を持っている。
        body = (f'<section class="{body_class}">\n  <div class="wrap wrap--narrow">\n'
                f'{body}\n  </div>\n</section>')
    html = SHELL.format(
        # index.html は省く。/legal/x/index.html は /legal/x/ にする
        title=title, desc=desc,
        canon='' if out == 'index.html' else out.replace('index.html', ''),
        nav=links('      '), dnav=links('    '), fnav=links('        '),
        body=body)
    dest = ROOT / out
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding='utf-8')
    print(f'  {out}')


def build():
    for slug, out, name, title, desc in PAGES:
        render(SRC, slug, out, title, desc)
    # 法務ページは本文が長い。追補3 §152 のとおり寸法を落とすので、
    # 目印のクラスを付けて CSS 側で切り替える。
    for slug, out, name, desc in LEGAL:
        render(ROOT / 'content/legal', slug, out,
               f'{name} — Harmony Horizon', desc, body_class='page-legal')

if __name__ == '__main__':
    print('ページを組み立てる')
    build()
