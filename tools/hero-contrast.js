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
    await pg.goto('http://localhost:8105/', { waitUntil:'networkidle' });
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
      return { h1:g('.hero h1'), lede:g('.hero .lede'), eyebrow:g('.hero .eyebrow') };
    });
    // 文字を消す。合わせて**手前に浮くもの**も消す。固定バーは石色で、
    // 文字範囲に重なると地色として拾われ、1.18 のような偽の値になる。
    await pg.evaluate(() => {
      document.querySelectorAll('.hero h1, .hero .lede, .hero .eyebrow, .hero .row')
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
      return { h1:worst(boxes.h1), lede:worst(boxes.lede), eyebrow:worst(boxes.eyebrow) };
    }, { b64, boxes });
    console.log(n,
      'h1(白)', cr([255,255,255], out.h1),
      '| 導入文(rgba .9→近似 #E9E6E1)', cr([233,230,225], out.lede),
      '| 前書き(#E9B98C)', cr([233,185,140], out.eyebrow));
    await ctx.close();
  }
  await b.close();
})();
