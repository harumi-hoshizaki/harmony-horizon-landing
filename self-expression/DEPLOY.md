# Deploy: Ear to Voice Self Expression LP

**Goal:** serve this landing page at `https://www.harmonyhorizon.space/self-expression`
Host: **Vercel**. Domain `harmonyhorizon.space` is already managed there.

## What's in this folder

```
index.html                                  the landing page (self-contained markup + logic)
support.js                                  runtime the page loads (required, same directory)
image-slot.js                               small helper the page loads (required, same directory)
uploads/mockup_hero-transparent-web.png     hero phone mockup (transparent PNG)
uploads/mockup_trio-transparent-web.png     three-phone mockup (transparent PNG)
```

It is a **static site** — no build step, no framework, no npm install. `index.html`
references `./support.js`, `./image-slot.js` and `./uploads/*.png` with relative paths,
so the whole folder must be deployed together with its structure preserved.
Fonts (Lora, Noto Sans JP) load from Google Fonts over CDN.

## Preferred option — add it to the existing harmonyhorizon.space Vercel project

If the main site is already a Vercel project, keep one deployment and just add this
page as a static route:

1. In the site repo, create the directory that Vercel serves statically
   (`public/` for Next.js / Vite / CRA, or the repo root for a plain static site).
2. Copy this folder's contents into `public/self-expression/`, i.e.
   `public/self-expression/index.html`, `public/self-expression/support.js`,
   `public/self-expression/image-slot.js`, `public/self-expression/uploads/*.png`.
3. Commit and push. Vercel builds and `https://www.harmonyhorizon.space/self-expression`
   serves `index.html` automatically.
4. Verify the two PNGs load (network tab, 200 not 404) — a wrong nested path is the
   usual failure here.

If the framework does not serve `public/` verbatim, add a rewrite in `vercel.json` instead:

```json
{
  "rewrites": [
    { "source": "/self-expression", "destination": "/self-expression/index.html" }
  ]
}
```

## Alternative — deploy as its own Vercel project

Use this only if the main site is NOT on Vercel or cannot be modified.

```bash
npm i -g vercel
cd deploy_self_expression
vercel --prod            # deploys this folder as a static site
```

Then in the Vercel dashboard the page lives at the project's own domain, and
`harmonyhorizon.space/self-expression` has to be pointed at it from wherever the
main site is hosted (a proxy/rewrite rule on the main site, not a DNS record —
DNS cannot route a path). Because that is fragile, prefer the first option.

## Do not change

- The Stripe checkout URL: `https://buy.stripe.com/dRm28rcLccvK73240ieEo01`
  It appears on 5 buttons (top nav, hero, mid-page CTA, pricing card, final CTA,
  plus the sticky mobile bar). All must keep pointing there.
- Copy, colors, and type — the page is final and approved. No AI-related wording
  anywhere on the page; that was removed deliberately.
- The transparent PNGs — their backgrounds were cut out on purpose so the phones sit
  flush on the cream page background. Do not swap in the original opaque versions.

## Checks after deploy

- Loads at the target URL, no console errors.
- Mobile (390px wide): sticky ¥980 bar pinned to the bottom, tap targets ≥44px,
  no horizontal scroll.
- All 6 purchase buttons open Stripe checkout in a new tab.
- FAQ items expand/collapse on tap (3 questions, first one open by default).
- Both phone mockups render with no visible rectangle/box around them.
