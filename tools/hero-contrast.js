// URL を引数で受ける。トップページだけでなく、写真を重ねる全ページで測る。
//   node tools/hero-contrast.js http://127.0.0.1:8802/eatout/index.html
const URL = process.argv[2] || 'http://localhost:8105/';
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const lin = c => { c/=255; return c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
const L = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const cr = (a,b) => { const x=L(a),y=L(b); return +(((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)); };
(async () => {
  const b = await chromium.launch();
    // 実機の Safari は下に操作バーが出る。852 ではなく 659 しか見えない。
  // 帯の高さが変わると文字の下の地色も変わるので、必ず両方測る。
  for (const [w,h,n] of [[1440,900,'卓上'],[393,852,'携帯'],[393,659,'携帯(バー有)'],[430,690,'大(バー有)'],[320,568,'小']]) {
    const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1, reducedMotion:'reduce' });
    const pg = await ctx.newPage();
    await pg.goto(URL, { waitUntil:'networkidle' });
    await pg.waitForTimeout(800);
    // 文字を消して、その真下の地色を採る（最も明るい点＝最悪ケース）
    const boxes = await pg.evaluate(() => {
      // 箱ではなく*文字*の範囲。ブロック要素の箱は横幅いっぱいなので、
      // 箱で測ると文字のない明るい場所まで拾い、不当に厳しい値が出る。
      const g = s => { const e=document.querySelector(s); if(!e) return null;
        const rg=document.createRange(); rg.selectNodeContents(e);
        const rs=[...rg.getClientRects()].filter(r=>r.width>1&&r.height>1);
        if(!rs.length) return null;
        const x=Math.min(...rs.map(r=>r.left)), y=Math.min(...rs.map(r=>r.top));
        const x2=Math.max(...rs.map(r=>r.right)), y2=Math.max(...rs.map(r=>r.bottom));
        // 撮影は表示領域の分だけ。はみ出した範囲を採ると、
        // 画布の外＝別のもの（固定バーなど）を拾って嘘の値が出る。
        const X=Math.max(0,Math.round(x)), Y=Math.max(0,Math.round(y));
        const X2=Math.min(innerWidth,Math.round(x2)), Y2=Math.min(innerHeight,Math.round(y2));
        if (X2<=X || Y2<=Y) return null;
        return {x:X,y:Y,w:X2-X,h:Y2-Y}; };
      // 見出しの中の強調（em）も別に測る。ここに濃い色を置くと、
      // 見出し全体は通っているのに強調部分だけ 1.4:1 になる。
      /* ★2026-10-02 em は querySelector で**最初の1つ**を取っていたが、
         画面幅で見出しを出し分けるページ(携帯3行／卓上2行)では、最初の em が
         display:none の側に入っていて測れず「—」になった。**見えている方**を
         選ぶ。見えている em が無ければ今まで通り null。 */
      const visEm = [...document.querySelectorAll('.hero h1 em')].find(e => e.offsetParent !== null);
      const gEl = el => { if (!el) return null; const r = el.getBoundingClientRect();
        const X=Math.max(0,Math.round(r.x)), Y=Math.max(0,Math.round(r.y));
        const X2=Math.min(innerWidth,Math.round(r.right)), Y2=Math.min(innerHeight,Math.round(r.bottom));
        return (X2<=X||Y2<=Y) ? null : {x:X,y:Y,w:X2-X,h:Y2-Y}; };
      return { h1:g('.hero h1'), em:gEl(visEm), lede:g('.hero .lede'), eyebrow:g('.hero .eyebrow') };
    });
    // 文字を消す。合わせて**手前に浮くもの**も消す。固定バーは石色で、
    // 文字範囲に重なると地色として拾われ、1.18 のような偽の値になる。
    await pg.evaluate(() => {
      document.querySelectorAll('.hero__in, .hero h1, .hero .lede, .hero .eyebrow, .hero .row, .hero-note')
        .forEach(e => e.style.visibility = 'hidden');
      document.querySelectorAll('body *').forEach(e => {
        const p = getComputedStyle(e).position;
        if ((p === 'fixed' || p === 'sticky') && !e.closest('.hero')) e.style.visibility = 'hidden';
      });
    });
    await pg.waitForTimeout(200);
    const shot = await pg.screenshot({ clip: { x:0, y:0, width:w, height:h } });
    const { createCanvas, loadImage } = { createCanvas:null, loadImage:null };
    // canvas はブラウザ側で処理する
    const b64 = shot.toString('base64');
    const out = await pg.evaluate(async ({ b64, boxes }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas'); c.width=img.width; c.height=img.height;
      const cx = c.getContext('2d'); cx.drawImage(img,0,0);
      const worst = box => {
        if (!box) return null;
        const d = cx.getImageData(box.x, box.y, Math.max(1,box.w), Math.max(1,box.h)).data;
        let best=[0,0,0], bestL=-1;
        for (let i=0;i<d.length;i+=4*7) {
          const p=[d[i],d[i+1],d[i+2]];
          const l=0.2126*p[0]+0.7152*p[1]+0.0722*p[2];
          if (l>bestL){bestL=l;best=p;}
        }
        return best;
      };
      return { h1:worst(boxes.h1), em:worst(boxes.em), lede:worst(boxes.lede), eyebrow:worst(boxes.eyebrow) };
    }, { b64, boxes });
    /* ★2026-10-02 文字の色を**白と決め打ち**していた。携帯だけ明るい地に
       変えたページ(/eatout/lesson/)では、実際は濃い文字なのに白で測って
       1.05 という嘘の値が出る。**実際の色を読む**ようにした。
       rgba の半透明は、下の地と混ぜずそのままの色で見る(従来と同じ近似)。 */
    const colors = await pg.evaluate(() => {
      const g = s => { const e = [...document.querySelectorAll(s)].find(e => e.offsetParent !== null);
        return e ? getComputedStyle(e).color : null; };
      return { h1: g('.hero h1'), em: g('.hero h1 em'), lede: g('.hero .lede'), eyebrow: g('.hero .eyebrow') };
    });
    const emc = colors.em;
    const rgb = c => c.match(/[\d.]+/g).slice(0,3).map(Number);
    const show = (name, col, box) => '| ' + name + (col ? ' ' + col : '') + ' ' + (col && box ? cr(rgb(col), box) : '—');
    console.log(n,
      show('h1', colors.h1, out.h1).slice(2),
      show('強調', emc, out.em),
      show('導入文', colors.lede, out.lede),
      show('前書き', colors.eyebrow, out.eyebrow));
    await ctx.close();
  }
  await b.close();
})();
