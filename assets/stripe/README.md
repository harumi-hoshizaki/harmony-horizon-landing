# Stripe の商品画像（飲食店英会話）

Stripe の商品に登録する画像。Checkout・領収書・購入履歴に出ます。

| ファイル | 大きさ | 何に使うか |
|---|---|---|
| `eatout-product-2048.png` | 2048×2048 | **これを Stripe に登録する**（きれいに出ます） |
| `eatout-product-1024.png` | 1024×1024 | 軽い方が良い時（メール等）に |
| `eatout-product.html` | — | 上の2枚の**作り元**。ここを直して撮り直す |

Stripe の決まり: 正方形、128×128px 以上、**2MB 以下**、PNG/JPEG/GIF/WEBP。
どちらも2MB以内に収まっています。

## 中身について

携帯に映っているのは、**コース本体（app 側 `eatout/listening/index.html`）の
画面をそのまま写したもの**です。色・角・部品・文言は、あちらの実測値を
使っています（丸ボタンを使わない／角はゼロ／声・速さは畳む、など）。

**コース本体の見た目が変わったら、この画像も撮り直してください。**
買う前に見る絵と、買った後の画面が違うのが、いちばんいけないことです。

## 撮り直し方

```
# このリポジトリの中で
python3 -m http.server 8000 &
node -e "
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async()=>{const b=await chromium.launch();
for (const [dsf,name] of [[2,'eatout-product-2048.png'],[1,'eatout-product-1024.png']]) {
  const p=await b.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:dsf});
  await p.goto('http://localhost:8000/assets/stripe/eatout-product.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(1200);
  await p.screenshot({path:'assets/stripe/'+name});
  await p.close();
}
await b.close();})()"
```

書体は Google Fonts から読んでいるので、撮る時はネットにつながっている
必要があります。
