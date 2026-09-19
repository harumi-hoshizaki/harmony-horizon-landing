# Stripe の商品画像（飲食店英会話）

Stripe の商品に登録する画像。Checkout・領収書・購入履歴に出ます。

| ファイル | 大きさ | 何に使うか |
|---|---|---|
| `eatout-product-2048.png` | 2048×2048 | **これを Stripe に登録する** |
| `eatout-product-1024.png` | 1024×1024 | 軽い方が良い時（メール等）に |
| `app-screen.png` | 1170×2352 | 携帯に映っている**コース本体の画面写真** |
| `eatout-product.html` | — | 上の2枚の**組み立て元**（携帯の枠・背景・ロゴ） |

Stripe の決まり: 正方形、128×128px 以上、**2MB 以下**、PNG/JPEG/GIF/WEBP。
どちらも2MB以内です。

## 映っているもの

**作り物ではありません。** `app-screen.png` は、コース本体
（app 側リポジトリ `harmony-horizon` の `eatout/listening/index.html`）を
実際に動かして撮った画面です。

場面は **「注文④」のリスニング**。店員の `What can I get for you?` を
聞いて、3択から選んだ直後の画面です。写真・選択肢・正解の緑まで、
コースで実際に出るものがそのまま写っています。

携帯の枠・背景・下のロゴ・**上の時刻の帯だけ**が、こちらで描いたものです
（時刻の帯はブラウザの画面写真には写らないため）。帯の地を白にしてあるのは、
アプリのヘッダーが白で、継ぎ目が見えないようにするためです。

## 撮り直し方

**コース本体の見た目が変わったら、撮り直してください。**
買う前に見る絵と、買った後の画面が違うのが、いちばんいけないことです。

### ① コース本体の画面を撮る（app 側リポジトリで）

```
cd <harmony-horizon のある場所>
python3 -m http.server 8241 &
PASSWORD=〇〇 node scripts/shot-app-screen.js
```

`〇〇` はコースのパスワード。**ファイルには書かない**ので、毎回ここで渡します。

3択が画面の下で切れていたら、撮らずにその場で止まります（切れた絵が
そのまま商品画像になるのを防ぐため）。出来た `app-screen.png` を、
このフォルダへコピーしてください。

### ② 商品画像に組み直す（このリポジトリで）

```
node -e "
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const OUT='assets/stripe/';
(async()=>{const b=await chromium.launch();
for (const [dsf,name] of [[2,'eatout-product-2048.png'],[1,'eatout-product-1024.png']]) {
  const p=await b.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:dsf});
  await p.goto('file://'+process.cwd()+'/'+OUT+'eatout-product.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(1500);
  await p.screenshot({path:OUT+name}); await p.close();
}
await b.close();})()"
```

書体は Google Fonts から読むので、組む時はネットにつながっている必要があります。
