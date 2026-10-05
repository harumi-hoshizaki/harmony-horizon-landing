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
    ('index', 'index.html', 'Home', 'Harmony Horizon — 「耳から、声へ」の英会話',
     '完璧な英語は必要ありません。聞く力を起点に、話せるようになるまでを一続きにする、HARU のマンツーマン英語レッスン。モントリオールからオンラインで。'),
    ('programs', 'programs.html', 'Programs', 'レッスンについて — Harmony Horizon',
     'あなただけの目標に合わせた、完全個別のマンツーマン指導。個別カウンセリングから始まるオーダーメイド設計です。'),
    ('student-voices', 'student-voices.html', 'Student Voices', '受講者の声 — Harmony Horizon',
     '点数や評価では見えないものがあります。レッスンを受けた方が、ご自身の言葉で書いた感想です。'),
    ('contact', 'contact.html', 'Contact', 'お問い合わせ — Harmony Horizon',
     '初回のご連絡は、レッスンの申し込みではありません。今の悩みや目標をお聞かせください。24〜48時間以内にご返信します。'),
    # 2026-10-04: HARU が AI で作っていることの記録。ナビには入れず、
    # SNS のプロフィールから直接リンクする。
    ('ai-journey', 'ai-journey/index.html', 'AI Journey', 'AI Journey — Harmony Horizon',
     '英語を教えながら、AIを使って教材やサイトを自分で作っています。うまくいったことも失敗も、実験の記録として残します。'),
    ('ai-contact', 'ai-journey/contact/index.html', 'AI Contact', 'AIのお問い合わせ — Harmony Horizon',
     'AIで作っていることへの感想や質問、「こんなものを作ってほしい」というご相談を受け付けています。'),
    # 2026-10-05 HARU様「AI Journey は3か国語で」。このページとフォームだけ英語・フランス語版を持つ。
    ('ai-journey-en', 'ai-journey/en/index.html', 'AI Journey', 'AI Journey — HARU builds with AI',
     'HARU builds websites, online courses, AI voice tools and automations with AI, from Montréal. A log of what works and what doesn’t.'),
    ('ai-contact-en', 'ai-journey/en/contact/index.html', 'AI Contact', 'Contact — AI Journey',
     'Questions, feedback, or something you would like built with AI. HARU replies within 24–48 hours.'),
    ('ai-journey-fr', 'ai-journey/fr/index.html', 'AI Journey', 'AI Journey — HARU construit avec l’IA',
     'Depuis Montréal, HARU crée avec l’IA des sites web, des cours en ligne, des voix IA et des automatisations. Le journal de ce qui marche, et de ce qui ne marche pas.'),
    ('ai-contact-fr', 'ai-journey/fr/contact/index.html', 'AI Contact', 'Contact — AI Journey',
     'Questions, commentaires ou projet à créer avec l’IA. HARU répond sous 24 à 48 heures.'),
]

# AI Journey のページだけのメニュー（2026-10-04 HARU様）。英語レッスンの4項目は
# 「英語学習」1つにまとめてトップへ。お問い合わせは AI 用のフォームへ。
AI_LANG = {'ai-journey': 'ja', 'ai-contact': 'ja',
           'ai-journey-en': 'en', 'ai-contact-en': 'en',
           'ai-journey-fr': 'fr', 'ai-contact-fr': 'fr'}
AI_SLUGS = tuple(AI_LANG)
# 言語ごとの入口（ja は今までどおり /ai-journey/）
AI_BASE = {'ja': 'ai-journey/', 'en': 'ai-journey/en/', 'fr': 'ai-journey/fr/'}
NAV_AI = {
    'ja': [('https://www.harmonyhorizon.space/', '英語学習'), ('ai-journey/', 'AI Journey'), ('ai-journey/contact/', 'お問い合わせ')],
    'en': [('https://www.harmonyhorizon.space/', 'English lessons'), ('ai-journey/en/', 'AI Journey'), ('ai-journey/en/contact/', 'Contact')],
    'fr': [('https://www.harmonyhorizon.space/', 'Cours d’anglais'), ('ai-journey/fr/', 'AI Journey'), ('ai-journey/fr/contact/', 'Contact')],
}
LEGAL_LINKS_JA = '''      <a href="/eatout/">飲食店の英会話</a>
      <a href="/immigration/">入国審査</a>
      <a href="/legal/privacy/">プライバシーポリシー</a>
      <a href="/legal/terms/">利用規約</a>
      <a href="/legal/tokushoho/">特定商取引法に基づく表記</a>'''
# 骨格の言葉。ja はこれまでと一字一句同じ。
SHELL_TEXT = {
    'ja': dict(lang='ja', locale='ja_JP', skip='本文へ移動', btn='問い合わせる',
               ftr_blurb='耳から、声へ。<br>HARU によるマンツーマンの英語レッスン。<br>カナダ・モントリオールから、オンラインで。',
               ftr_k='連絡先', ftr_gps='Google の優先ソースに追加', ftr_legal=LEGAL_LINKS_JA),
    'en': dict(lang='en', locale='en_CA', skip='Skip to content', btn='Get in touch',
               ftr_blurb='HARU builds with AI.<br>Websites, online courses, AI voice and automation.<br>From Montréal, Canada.',
               ftr_k='Contact', ftr_gps='Add as a preferred source on Google',
               ftr_legal='      <a href="/legal/privacy/">Privacy policy (Japanese)</a>'),
    'fr': dict(lang='fr', locale='fr_CA', skip='Aller au contenu', btn='M’écrire',
               ftr_blurb='HARU construit avec l’IA.<br>Sites web, cours en ligne, voix IA et automatisation.<br>Depuis Montréal, Canada.',
               ftr_k='Contact', ftr_gps='Ajouter comme source préférée sur Google',
               ftr_legal='      <a href="/legal/privacy/">Politique de confidentialité (en japonais)</a>'),
}

# 法務3ページ。ナビには入れないが、**脚注から必ず辿れる**ようにする。
# 販売しているのはこのドメインなので、特定商取引法の表記は
# 購入ページから辿れなければならない（追補2 §126）。
LEGAL = [
    ('privacy',   'legal/privacy/index.html',   'プライバシーポリシー',
     'Harmony Horizon の各コースが、どの情報をどこに保存し、どこへ送るかを書いています。'),
    ('terms',     'legal/terms/index.html',     '利用規約',
     'Harmony Horizon の各コースをお使いいただくうえでの取り決めです。'),
    ('tokushoho', 'legal/tokushoho/index.html', '特定商取引法に基づく表記',
     '通信販売にあたり、特定商取引法で表示が求められている事項です。'),
]

# 2026-08-27: 販売LP2枚（/eatout/ /immigration/）はどこからも辿れず、
# URL を知っている人しか見られなかった。トップページの「練習コース」の節へ
# 案内を足す。節への錨なので、どのページからでも同じ場所に着く。
NAV = [('index.html', '考え方'), ('programs.html', 'レッスン'),
       ('student-voices.html', '受講者の声'), ('#apps', '練習コース'),
       ('contact.html', 'お問い合わせ')]

JSONLD_HOME = '\n<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","@id":"https://www.harmonyhorizon.space/#website","url":"https://www.harmonyhorizon.space/","name":"Harmony Horizon","inLanguage":"ja","publisher":{"@id":"https://www.harmonyhorizon.space/#org"}},{"@type":"Organization","@id":"https://www.harmonyhorizon.space/#org","name":"Harmony Horizon","url":"https://www.harmonyhorizon.space/","email":"haru@harmonyhorizon.space","founder":{"@id":"https://www.harmonyhorizon.space/#haru"},"sameAs":["https://www.instagram.com/harmony_horizon_by_hh/","https://www.youtube.com/@HaruHoshizaki"]},{"@type":"Person","@id":"https://www.harmonyhorizon.space/#haru","name":"HARU","jobTitle":"英語コーチ","worksFor":{"@id":"https://www.harmonyhorizon.space/#org"},"homeLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Montréal","addressRegion":"QC","addressCountry":"CA"}},"knowsLanguage":["ja","en","fr"]},{"@type":"Service","@id":"https://www.harmonyhorizon.space/#lesson","name":"マンツーマン英語レッスン（オンライン）","serviceType":"英語レッスン","description":"聞く力を起点に、話せるようになるまでを一続きにする、HARU のマンツーマン英語レッスン。モントリオールからオンラインで。","provider":{"@id":"https://www.harmonyhorizon.space/#org"},"areaServed":"Worldwide","availableLanguage":["ja","en"],"url":"https://www.harmonyhorizon.space/programs.html"}]}</script>'

SHELL = '''<!DOCTYPE html>
<html lang="{lang}">
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
<meta property="og:locale" content="{locale}">{alt}
<meta name="twitter:card" content="summary_large_image">
<meta property="og:site_name" content="Harmony Horizon">
<meta property="og:image" content="https://www.harmonyhorizon.space/assets/site/hero.jpg">
<meta property="og:image:width" content="2048">
<meta property="og:image:height" content="1152">
<link rel="icon" type="image/svg+xml" href="/assets/site/favicon.svg">
<link rel="stylesheet" href="/assets/site/fonts.css">
<link rel="stylesheet" href="/assets/site/site.css">
<script>document.documentElement.className = "js";</script>{jsonld}
</head>
<body{bodyattr}>
<a class="skip" href="#main">{skip}</a>

<header class="hdr">
  <div class="wrap hdr__in">
    <a class="brand" href="/">
      <svg class="brand-mark" viewBox="0 0 200 200" role="img" aria-label="Harmony Horizon">
        <circle cx="100" cy="100" r="96" fill="#221D18"/>
        <circle cx="100" cy="100" r="69" fill="none" stroke="#E2A33D" stroke-width="8" opacity="0.55"/>
        <circle cx="100" cy="100" r="46" fill="none" stroke="#E2A33D" stroke-width="12"/>
        <circle cx="100" cy="100" r="16" fill="#E2A33D"/>
      </svg>
      <span class="brand-text"><span class="brand-word">Harmony Horizon</span><span class="brand-tag">耳から、声へ</span></span>
    </a>
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
  <a class="btn" href="{contact}">{contact_label}</a>
</div>

<main id="main">
{body}
</main>

<footer class="ftr">
  <div class="wrap">
    <div class="ftr__grid">
      <div>
        <p class="ftr__brand">Harmony Horizon</p>
        <p class="small">{ftr_blurb}</p>
      </div>
      <nav aria-label="フッターのナビゲーション">
{fnav}
      </nav>
      <div>
        <p class="ftr__k">{ftr_k}</p>
        <a class="ftr__mail" href="mailto:haru@harmonyhorizon.space">haru@harmonyhorizon.space</a>
        <a class="ftr__gps" href="https://www.google.com/preferences/source?q=harmonyhorizon.space" target="_blank" rel="noopener">{ftr_gps}</a>
      </div>
    </div>
    <div class="ftr__legal">
      <span>© <span class="yr">2026</span> Harmony Horizon</span>
{ftr_legal}
    </div>
  </div>
</footer>

<script src="/assets/site/site.js" defer></script>
<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{{"token": "cbce8f1a5efe454ca00b354ec0f02307"}}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>
'''

def render(src_dir, slug, out, title, desc, body_class='', page_class=''):
    lang = AI_LANG.get(slug, 'ja')
    nav = NAV_AI[lang] if slug in AI_SLUGS else NAV
    txt = SHELL_TEXT[lang]
    alt = ''
    if slug in AI_SLUGS:
        # 3か国語の対応を検索エンジンに伝える（同じ種類のページどうし）
        sub = 'contact/' if slug.startswith('ai-contact') else ''
        alt = ''.join(f'\n<link rel="alternate" hreflang="{l}" href="https://www.harmonyhorizon.space/{b}{sub}">'
                      for l, b in AI_BASE.items())
    def links(indent):
        rows = []
        for href, label in nav:
            # 節への錨（#apps）はトップページの中を指す。他のページからでも
            # 同じ場所に着くよう、必ず / から書く。
            target = href if href.startswith('https://') else '/' + href
            cur = ' aria-current="page"' if out in (href, href + 'index.html') else ''
            rows.append(f'{indent}<a href="{target}"{cur}>{label}</a>')
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
        body=body,
        contact='/' + AI_BASE[lang] + 'contact/' if slug in AI_SLUGS else '/contact.html',
        contact_label=txt['btn'] if slug in AI_SLUGS else '相談する',
        lang=txt['lang'], locale=txt['locale'], alt=alt, skip=txt['skip'],
        ftr_blurb=txt['ftr_blurb'], ftr_k=txt['ftr_k'], ftr_gps=txt['ftr_gps'], ftr_legal=txt['ftr_legal'],
        # 法務ページは Speak Up LP の脚注から開かれるので、ページ全体(ヘッダー・脚注も)を
        # アプリと同じ書体の決まりにする目印(site.css の body.is-legal)。
        # AI Journey は英語レッスンとは別の話なので、明朝をやめてゴシックで組む
        # (2026-10-04 HARU様「上品すぎる。読みやすいゴシックで」。site.css の body.is-ai)。
        bodyattr=' class="is-legal"' if body_class else (f' class="{page_class}"' if page_class else ''),
        jsonld=JSONLD_HOME if out == 'index.html' else '')
    dest = ROOT / out
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding='utf-8')
    print(f'  {out}')


def build():
    for slug, out, name, title, desc in PAGES:
        render(SRC, slug, out, title, desc,
               page_class='is-ai' if slug in AI_SLUGS else '')
    # 法務ページは本文が長い。追補3 §152 のとおり寸法を落とすので、
    # 目印のクラスを付けて CSS 側で切り替える。
    for slug, out, name, desc in LEGAL:
        render(ROOT / 'content/legal', slug, out,
               f'{name} — Harmony Horizon', desc, body_class='page-legal')

if __name__ == '__main__':
    print('ページを組み立てる')
    build()
