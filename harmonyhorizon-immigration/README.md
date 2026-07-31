# harmonyhorizon-immigration

**Essential Immigration** — served at **https://app.harmonyhorizon.space/immigration**.

A single static page that reduces anxiety about immigration inspection before any English practice begins. No build step, no framework. No audio, no exercises, no data storage — nothing is collected, stored, or transmitted.

```
harmonyhorizon-immigration/
├── index.html               ← page at app.harmonyhorizon.space (lists the apps)
├── immigration/             ← = app.harmonyhorizon.space/immigration
│   └── index.html           ← the app, single file
├── .gitignore
└── README.md
```

## Roadmap

- **v0.1 (this version)** — Welcome, Before You Fly checklist, the 7 question categories
- **v0.2** — Ear to Voice immigration training module: listening and speaking practice with pre-generated MP3 audio (Audio → Understanding → Speaking → Text)

## Deployment (Vercel)

1. Import this repository into Vercel. Framework preset: **Other**. No build command, no output directory.
2. Confirm the temporary Vercel URL serves the app at `/immigration`.
3. In the Vercel project, add the domain `app.harmonyhorizon.space`. Vercel displays one CNAME record.
4. Add that record in Cloudflare, in the DNS settings for `harmonyhorizon.space`:
   - Type: `CNAME`
   - Name: `app`
   - Target: the value Vercel shows
   - Proxy: **DNS only** (grey cloud, not orange)
5. After propagation, the app is live at `app.harmonyhorizon.space/immigration`. The main `harmonyhorizon.space` site is untouched.

## Adding future apps (one repository per app)

Each app lives in its own repository and its own Vercel project. The domain `app.harmonyhorizon.space` can only point at **one** Vercel project — this one. So a future app is wired in with a rewrite here, and DNS is never touched again:

1. Create the new repo (e.g. `harmonyhorizon-somename`) and import it into Vercel as its own project.
2. In **this** repository, add the path to `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/somename/:path*", "destination": "https://<that-project>.vercel.app/:path*" }
  ]
}
```

3. Add a link to it in `index.html`.

Visitors see `app.harmonyhorizon.space/somename`; Vercel serves it from the other project behind the scenes.

## Rules

- **Lowercase file and folder names only.** macOS treats `Audio/` and `audio/` as the same folder; Vercel's servers do not. A site that works locally and 404s after deploy is almost always this.
- No spaces, Japanese characters, or parentheses in filenames. Underscores or hyphens only.
- All paths inside app pages are **relative** (`audio/file.mp3`, never `/audio/file.mp3`), so an app works from any subpath.
- **No API keys anywhere in this repository.** Audio for v0.2 is generated in advance, outside this repo; the app only plays committed MP3 files.
