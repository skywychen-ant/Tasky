// ═══════════════════════════════════════════════════════
//  sw.js — Tasky service worker
//
//  Strategy:
//   - Cache-first for app shell (HTML/CSS/JS/icons/manifest)
//   - Network-only for GitHub API (we never want stale sync data)
//   - Network-first for everything else (with cache fallback)
//
//  Bump CACHE_NAME on every release so stale assets get swept out.
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tasky-v2.3.1';

// Files that make up the app shell. Listed explicitly so we know we have
// a complete offline copy. Paths are relative to the service worker scope.
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.webmanifest',

    './lib/storage.js',
    './lib/state.js',
    './lib/ui-utils.js',
    './lib/theme.js',
    './lib/tags.js',
    './lib/snapshots.js',
    './lib/history.js',
    './lib/stats.js',
    './lib/modals.js',
    './lib/render.js',
    './lib/actions.js',
    './lib/keyboard.js',
    './lib/help.js',
    './lib/backup.js',
    './lib/sync-gist.js',
    './lib/sync.js',
    './lib/settings.js',

    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-192-maskable.png',
    './icons/icon-512-maskable.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
];

// ── Install: pre-cache the app shell ──────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // addAll fails atomically — if any URL 404s the install fails.
            // Use Promise.allSettled so one missing optional file doesn't
            // block the worker from installing (icons may not exist yet
            // during dev).
            return Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
        }).then(() => self.skipWaiting())
    );
});

// ── Activate: drop old caches ─────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: routing ────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;       // never cache mutations

    const url = new URL(req.url);

    // GitHub API: ALWAYS go to network. Never cache (sync needs fresh data).
    if (url.hostname === 'api.github.com' || url.hostname === 'gist.github.com') {
        return;     // bail — let the browser do its default
    }

    // Same-origin app shell: cache-first
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(req).then(cached => {
                if (cached) {
                    // Background revalidate (stale-while-revalidate) for
                    // the index.html so a fresh app picks up updates next
                    // visit without blocking.
                    if (req.mode === 'navigate' || req.destination === 'document') {
                        fetch(req).then(res => {
                            if (res && res.ok) {
                                caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
                            }
                        }).catch(() => {});
                    }
                    return cached;
                }
                return fetch(req).then(res => {
                    if (res && res.ok && res.type !== 'opaque') {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(req, copy));
                    }
                    return res;
                }).catch(() => {
                    // Last-resort offline fallback for navigations
                    if (req.mode === 'navigate') return caches.match('./index.html');
                });
            })
        );
        return;
    }

    // Cross-origin (CDN / fonts / etc): network-first with cache fallback
    event.respondWith(
        fetch(req).then(res => {
            if (res && res.ok && res.type === 'basic') {
                const copy = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copy));
            }
            return res;
        }).catch(() => caches.match(req))
    );
});

// ── Optional: receive a message to skip waiting ──────
// The page can post {type:'SKIP_WAITING'} to force activation when
// the user clicks a "Reload to update" toast (future feature).
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
