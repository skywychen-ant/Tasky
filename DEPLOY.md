# Tasky — Deployment Guide

Tasky now includes a Progressive Web App (PWA) layer (v2.3.1+).
This means once it's served from an HTTPS URL, you can install it on
**iPhone / iPad / Android / Windows / Mac** straight from the browser
and it behaves like a native app — including offline use.

> Tip: Tasky also keeps working perfectly fine when opened via
> `file://index.html` (double-click). Service worker & install prompt
> are simply skipped in that mode. So you don't *have* to deploy.
> But you will if you want to use it on your phone.

---

## What you need before deploying

1. The whole `youtodo/` folder (now contains `manifest.webmanifest`,
   `sw.js`, `icons/`, etc.)
2. A free hosting account on **Netlify**, **GitHub Pages**, or
   **Cloudflare Pages**.

You do **not** need to set up a backend, database, or server.
All Tasky data lives in `localStorage` per device, plus optional
sync to a private GitHub gist.

---

## Option A — Netlify Drop (≤ 30 seconds, no account needed)

The fastest path. Great for a one-off URL you can install on your
phone today.

1. Open <https://app.netlify.com/drop>
2. Drag the entire `youtodo/` folder onto the page.
3. Wait ~10 seconds. Netlify gives you a URL like
   `https://random-name-12345.netlify.app`.
4. Open that URL on your phone.
5. Add to Home Screen (see **Install** section below).

That's it. The site stays up indefinitely as long as you keep the
browser tab open or sign in to claim it. To redeploy after changes,
drag the folder onto the same page again.

**Pros:** zero config, instant URL, free.
**Cons:** the URL is random; a free site can be deleted if unclaimed
for a long time.

---

## Option B — GitHub Pages (recommended for long-term use)

1. Create a new public **or** private repo on GitHub, e.g. `tasky`.
2. Push the `youtodo/` contents into it (or copy into a `docs/`
   folder if you prefer).
3. In repo Settings → Pages:
   - Source: `main` branch, root (`/`) — or `/docs` if you used that.
4. Wait ~30 seconds. Your site is live at
   `https://<your-username>.github.io/<repo-name>/`.
5. Open that URL on your phone and install.

> Private repos work for free for personal use, but the published Pages
> site is always **publicly accessible** at the URL — that's how Pages
> works. Anyone with the URL can view the *app shell*. Your task data
> still lives only in your browser's localStorage / your private gist;
> the public URL only exposes the HTML/CSS/JS.

**Pros:** stable URL, version-controlled, free, supports custom domain.
**Cons:** requires a Git push for every update.

---

## Option C — Cloudflare Pages (fast CDN, custom domain easy)

1. Push the folder to a GitHub repo (same as Option B step 2).
2. Sign in to <https://dash.cloudflare.com/>.
3. Pages → Create a project → Connect to Git → pick the repo.
4. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/` (or `youtodo` if not at the repo root)
5. Deploy. You get a URL like `https://tasky.pages.dev`.

**Pros:** fast global CDN, easy custom domain, instant rebuilds on push.
**Cons:** marginally more setup than Netlify Drop.

---

## Installing on your phone

After Tasky is live at an HTTPS URL:

### iOS (Safari)

1. Open the URL in Safari (must be Safari, not Chrome on iOS).
2. Tap the **Share** button (square with arrow).
3. Scroll down → **Add to Home Screen**.
4. Confirm. Tasky's icon appears on your home screen.
5. Launch it. It opens fullscreen, no browser chrome.

### Android (Chrome)

1. Open the URL in Chrome.
2. Tap the ⋮ menu → **Add to Home screen** (or **Install app**).
3. Confirm. Tasky becomes a launchable app from the app drawer.

### Desktop (Chrome / Edge)

1. Open the URL.
2. Look for the **install** icon (usually a small computer or `+` icon
   in the address bar).
3. Click → Install. Tasky becomes a desktop app.

---

## Setting up sync after install

After installing on each device:

1. Tap the **☁️ Sync** button (or press `S`).
2. Paste a GitHub Personal Access Token with the `gist` scope.
   - Generate at <https://github.com/settings/tokens/new?description=Tasky+sync&scopes=gist>
3. Tasky finds (or creates) a private gist named `tasky.json`.
4. Done. All devices using the same token now share your task data.

The same gist is used by every device — first device creates it,
subsequent devices auto-discover it.

---

## Updating after you change Tasky

Whenever you change `index.html`, `app.js`, any `lib/*.js` etc:

1. **Bump `CACHE_NAME` in `sw.js`** (e.g. `tasky-v2.3.1` → `tasky-v2.3.2`).
   This is essential — without it, the service worker keeps serving
   the old cached files even after redeploy.
2. Re-upload (Netlify Drop), commit & push (GitHub Pages / Cloudflare),
   etc.
3. On each installed device, the next launch detects the update and
   shows a "A new version is available — Reload to update" toast.
   Tap **Reload** to pick up the new version.

If you forget to bump `CACHE_NAME`, force-quit the PWA and re-open it
to clear the worker cache, or delete site data in the device's
browser settings.

---

## Storage limits & data safety

- **localStorage** in a PWA can hold ~5–10 MB depending on the platform.
  Tasky's typical footprint is well under 1 MB even with thousands of
  tasks.
- **iOS Safari** can clear localStorage if a PWA hasn't been launched
  for ~7 days. → That's why we have GitHub gist sync. As long as
  you sign in once, your data is safe on GitHub even if the local
  cache is wiped.
- **The gist** is your durable backup. Set up sync on every device
  you care about and you're protected against any single device
  wiping its cache.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Add to Home Screen" missing on iOS | Opened in Chrome on iOS instead of Safari | Re-open URL in Safari |
| App opens with browser chrome instead of fullscreen | manifest not picked up | Hard-refresh once, then re-install |
| Old version keeps showing after redeploy | service worker cache | Bump `CACHE_NAME` in `sw.js`, redeploy, reload twice |
| Token rejected | Token without `gist` scope, or expired | Generate a new one with `gist` scope only |
| Sync stuck "Syncing…" | Network blocked / VPN issue | Check connection; manual ⟳ Sync Now |
| Two devices have different data | Both edited offline, neither has synced yet | Bring both online, hit ⟳ Sync Now on each |

---

© Sky · Tasky
