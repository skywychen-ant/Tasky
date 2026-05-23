// ═══════════════════════════════════════════════════════
//  sync-gist.js — Minimal GitHub Gist REST API client
//
//  Tasky uses a single SECRET gist to hold the synchronised store JSON.
//  The user supplies a personal access token with `gist` scope; we store
//  it in localStorage on this device only.
//
//  Endpoints used:
//    GET    /gists/{id}                        Read a gist
//    POST   /gists                             Create a new gist
//    PATCH  /gists/{id}                        Update gist files
//    GET    /gists?since=...&per_page=100      List recent gists (for reuse)
//    GET    /user                              Verify token (whoami)
//
//  Exposes: window.YTD_Gist
//
//  All methods return a Promise that either resolves with the parsed
//  response, or rejects with an Error whose message is suitable for UI.
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const API   = 'https://api.github.com';
const FILE  = 'tasky.json';        // canonical filename inside the gist
const DESC  = 'Tasky sync — do not edit manually';

// ── Token storage ─────────────────────────────────────
const KEY_TOKEN   = 'tasky_sync_token';
const KEY_GIST_ID = 'tasky_sync_gist_id';
const KEY_USER    = 'tasky_sync_user';      // cached username (display only)

function getToken()    { return localStorage.getItem(KEY_TOKEN) || ''; }
function setToken(t)   { if (t) localStorage.setItem(KEY_TOKEN, t); else localStorage.removeItem(KEY_TOKEN); }
function getGistId()   { return localStorage.getItem(KEY_GIST_ID) || ''; }
function setGistId(id) { if (id) localStorage.setItem(KEY_GIST_ID, id); else localStorage.removeItem(KEY_GIST_ID); }
function getUser()     { return localStorage.getItem(KEY_USER) || ''; }
function setUser(u)    { if (u) localStorage.setItem(KEY_USER, u); else localStorage.removeItem(KEY_USER); }

function isConfigured() { return !!getToken(); }

// ── Low-level fetch wrapper ───────────────────────────
async function call(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error('No GitHub token configured');

    const headers = Object.assign({
        'Accept':        'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
    }, options.headers || {});
    if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    let res;
    try {
        res = await fetch(API + path, Object.assign({}, options, { headers }));
    } catch (e) {
        // Network error / DNS / offline
        throw new Error('Network error: ' + (e.message || 'fetch failed'));
    }

    // Try to parse JSON regardless; some errors return non-JSON.
    const text = await res.text();
    let data = null;
    if (text) {
        try { data = JSON.parse(text); } catch (e) { /* ignore */ }
    }

    if (!res.ok) {
        const msg = (data && data.message) || `HTTP ${res.status}`;
        const err = new Error(`GitHub API: ${msg}`);
        err.status = res.status;
        err.body = data;
        throw err;
    }
    return data;
}

// ── Public ops ────────────────────────────────────────

// Verify token and return the authenticated user. Throws on failure.
async function whoami() {
    const u = await call('/user');
    if (u && u.login) setUser(u.login);
    return u;
}

// List recent gists owned by the authenticated user. Used to find an
// existing Tasky gist if the user re-installs / wipes localStorage on
// one device but already has a gist set up from another.
async function listMine(perPage = 100) {
    return call(`/gists?per_page=${perPage}`);
}

// Try to find a Tasky gist by description / file name. Returns the gist
// summary or null.
async function findExisting() {
    const list = await listMine(100);
    if (!Array.isArray(list)) return null;
    const found = list.find(g => {
        if (!g.files) return false;
        return Object.keys(g.files).some(name => name === FILE);
    });
    return found || null;
}

// Read the JSON body of the configured gist. Returns { content, gist }.
async function read() {
    const id = getGistId();
    if (!id) throw new Error('No gist id configured');
    const gist = await call(`/gists/${id}`);
    const file = gist.files && gist.files[FILE];
    if (!file) {
        // Could be that the gist exists but the file is named differently —
        // accept any *.json file in the gist as fallback.
        const anyJson = gist.files && Object.values(gist.files).find(f => /\.json$/i.test(f.filename || ''));
        if (!anyJson) throw new Error(`Gist has no ${FILE} file`);
        return { content: parseJsonOrEmpty(anyJson.content), gist };
    }
    return { content: parseJsonOrEmpty(file.content), gist };
}

function parseJsonOrEmpty(text) {
    if (!text || typeof text !== 'string') return null;
    try { return JSON.parse(text); } catch (e) { return null; }
}

// Create a new secret gist with the given store. Persists the new gist id.
async function create(store) {
    const body = {
        description: DESC,
        public: false,
        files: {
            [FILE]: { content: JSON.stringify(store, null, 2) },
        },
    };
    const gist = await call('/gists', { method: 'POST', body: JSON.stringify(body) });
    setGistId(gist.id);
    return gist;
}

// Overwrite the gist file with new store JSON.
async function write(store) {
    const id = getGistId();
    if (!id) throw new Error('No gist id configured');
    const body = {
        files: {
            [FILE]: { content: JSON.stringify(store, null, 2) },
        },
    };
    return call(`/gists/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

// Disconnect: clear all gist-related local state. Token survives unless
// caller passes opts.alsoToken=true.
function disconnect(opts = {}) {
    setGistId('');
    setUser('');
    if (opts.alsoToken) setToken('');
}

window.YTD_Gist = {
    // config
    getToken, setToken,
    getGistId, setGistId,
    getUser,
    isConfigured,
    // ops
    whoami,
    listMine,
    findExisting,
    read,
    create,
    write,
    disconnect,
};
})();
