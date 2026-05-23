// ═══════════════════════════════════════════════════════
//  sync.js — Cross-device sync orchestrator (GitHub Gist)
//
//  Strategy:
//    - Single secret gist holds the canonical Tasky store
//    - Every device pulls + merges + pushes
//    - Per-todo `updatedAt` decides who wins (last-write-wins)
//    - Tombstones (store.tombstones.{projects,todos}: { id: deletedAt })
//      survive merges so a delete on device A is not undone by device B
//      pushing an older copy of the same id
//    - Failures don't block local edits — Tasky stays fully usable offline
//
//  Public API (window.YTD_Sync):
//    init()            wire everything up; auto-pull if configured
//    pull()            fetch remote and merge into local
//    push()            send local store to remote
//    syncNow()         pull then push (manual button / shortcut)
//    getStatus()       'unconfigured' | 'idle' | 'syncing' | 'ok' | 'error' | 'offline'
//    getLastError()    last error message or ''
//    getLastSyncedAt() timestamp string or ''
//    onChange(cb)      subscribe to status change events
//
//  Triggers:
//    - boot:                     pull (if configured + online)
//    - state change (debounced): push every 5s
//    - window 'focus':           pull
//    - window 'online':          pull
//    - timer:                    pull every 60s
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const Gist    = window.YTD_Gist;
const State   = window.YTD_State;
const Storage = window.YTD_Storage;
const Backup  = window.YTD_Backup;

// ── Config ────────────────────────────────────────────
const PUSH_DEBOUNCE_MS  = 5000;
const PULL_INTERVAL_MS  = 60_000;
const KEY_LAST_SYNC     = 'tasky_sync_last_synced_at';

// ── State ─────────────────────────────────────────────
let _status     = 'unconfigured';
let _lastError  = '';
let _lastSynced = localStorage.getItem(KEY_LAST_SYNC) || '';
let _pushTimer  = null;
let _pullTimer  = null;
let _initDone   = false;
let _pulling    = false;
let _pushing    = false;
const _subs     = new Set();

function setStatus(s, err = '') {
    _status = s;
    _lastError = err || '';
    if (s === 'ok') {
        _lastSynced = new Date().toISOString();
        localStorage.setItem(KEY_LAST_SYNC, _lastSynced);
    }
    notify();
}

function notify() {
    const evt = { status: _status, error: _lastError, lastSyncedAt: _lastSynced };
    for (const cb of _subs) try { cb(evt); } catch (e) { console.error(e); }
}

function onChange(cb) { _subs.add(cb); return () => _subs.delete(cb); }

// ── Merge helper that respects tombstones ─────────────
//
// Build on top of Backup.mergeStores then prune tombstoned items from the
// merged result. Both stores' tombstones are unioned (latest deletedAt
// wins) and items present in either store but tombstoned at a later
// timestamp are dropped.
function mergeWithTombstones(local, remote) {
    const localTs  = (local.tombstones  || { projects: {}, todos: {} });
    const remoteTs = (remote.tombstones || { projects: {}, todos: {} });
    const tomb = {
        projects: unionLatest(localTs.projects || {}, remoteTs.projects || {}),
        todos:    unionLatest(localTs.todos    || {}, remoteTs.todos    || {}),
    };

    // Delegate item merge to Backup.mergeStores
    const { store: merged, added, updated, skipped } = Backup.mergeStores(local, remote);

    // Drop items that have a tombstone NEWER than the item's updatedAt
    let droppedTodos = 0, droppedProjects = 0;
    merged.projects = (merged.projects || []).filter(p => {
        const tsAt = tomb.projects[p.id];
        if (tsAt && new Date(tsAt).getTime() >= new Date(p.updatedAt || 0).getTime()) {
            droppedProjects++;
            return false;
        }
        // Filter todos within
        p.todos = (p.todos || []).filter(t => {
            const tt = tomb.todos[t.id];
            if (tt && new Date(tt).getTime() >= new Date(t.updatedAt || 0).getTime()) {
                droppedTodos++;
                return false;
            }
            return true;
        });
        return true;
    });

    // Prune stale tombstones (older than 90 days) to bound size
    const cutoff = Date.now() - 90 * 86400_000;
    function prune(obj) {
        for (const k of Object.keys(obj)) {
            if (new Date(obj[k]).getTime() < cutoff) delete obj[k];
        }
    }
    prune(tomb.projects); prune(tomb.todos);
    merged.tombstones = tomb;

    return {
        store: merged,
        added, updated, skipped,
        droppedTodos, droppedProjects,
    };
}

// Merge two { id: timestamp } maps; later timestamp wins.
function unionLatest(a, b) {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b)) {
        if (!out[k] || new Date(b[k]).getTime() > new Date(out[k]).getTime()) {
            out[k] = b[k];
        }
    }
    return out;
}

// Compare two stores quickly to decide whether a push is even necessary
function storesEqual(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}

// ── Pull ──────────────────────────────────────────────
async function pull() {
    if (!Gist.isConfigured() || !Gist.getGistId()) return { ok: false, reason: 'unconfigured' };
    if (!navigator.onLine) {
        setStatus('offline');
        return { ok: false, reason: 'offline' };
    }
    if (_pulling) return { ok: false, reason: 'busy' };
    _pulling = true;
    setStatus('syncing');
    try {
        const { content } = await Gist.read();
        if (!content || !Array.isArray(content.projects)) {
            // First time: gist exists but empty → treat as no-op
            setStatus('ok');
            return { ok: true, noop: true };
        }
        const remote = content;
        const local  = State.state.store;
        const result = mergeWithTombstones(local, remote);
        if (!storesEqual(local, result.store)) {
            State.replaceStore(result.store);
        }
        setStatus('ok');
        return { ok: true, ...result };
    } catch (e) {
        console.error('[sync] pull failed', e);
        setStatus('error', e.message || 'Pull failed');
        return { ok: false, error: e };
    } finally {
        _pulling = false;
    }
}

// ── Push ──────────────────────────────────────────────
async function push() {
    if (!Gist.isConfigured() || !Gist.getGistId()) return { ok: false, reason: 'unconfigured' };
    if (!navigator.onLine) {
        setStatus('offline');
        return { ok: false, reason: 'offline' };
    }
    if (_pushing) return { ok: false, reason: 'busy' };
    _pushing = true;
    setStatus('syncing');
    try {
        await Gist.write(State.state.store);
        setStatus('ok');
        return { ok: true };
    } catch (e) {
        console.error('[sync] push failed', e);
        setStatus('error', e.message || 'Push failed');
        return { ok: false, error: e };
    } finally {
        _pushing = false;
    }
}

// ── Pull then Push ────────────────────────────────────
async function syncNow() {
    if (!Gist.isConfigured() || !Gist.getGistId()) {
        setStatus('unconfigured');
        return { ok: false, reason: 'unconfigured' };
    }
    const r1 = await pull();
    if (!r1.ok) return r1;
    const r2 = await push();
    return r2;
}

// ── Push debounce (called from state change subscriber) ───
function scheduleAutoPush() {
    if (!Gist.isConfigured() || !Gist.getGistId()) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
        _pushTimer = null;
        push();
    }, PUSH_DEBOUNCE_MS);
}

// ── Status string helpers ─────────────────────────────
function getStatus()        { return _status; }
function getLastError()     { return _lastError; }
function getLastSyncedAt()  { return _lastSynced; }

// Initial status decision (called at boot / after settings change).
function refreshConfiguredStatus() {
    if (!Gist.isConfigured() || !Gist.getGistId()) {
        setStatus('unconfigured');
    } else if (!navigator.onLine) {
        setStatus('offline');
    } else if (_status === 'unconfigured') {
        setStatus('idle');
    }
}

// ── Init / lifecycle ──────────────────────────────────
function init() {
    if (_initDone) return;
    _initDone = true;

    refreshConfiguredStatus();

    // Subscribe to local state changes → trigger debounced push
    State.subscribe((evt) => {
        if (evt.type !== 'change') return;
        // Skip the change-event triggered by sync itself (replace-store)
        if (evt.reason === 'replace-store') return;
        scheduleAutoPush();
    });

    // Pull when window regains focus
    window.addEventListener('focus', () => {
        if (Gist.isConfigured() && Gist.getGistId()) pull();
    });
    // Pull when network comes back
    window.addEventListener('online', () => {
        refreshConfiguredStatus();
        if (Gist.isConfigured() && Gist.getGistId()) pull();
    });
    window.addEventListener('offline', () => setStatus('offline'));

    // Periodic pull
    if (_pullTimer) clearInterval(_pullTimer);
    _pullTimer = setInterval(() => {
        if (Gist.isConfigured() && Gist.getGistId() && navigator.onLine && !_pulling && !_pushing) pull();
    }, PULL_INTERVAL_MS);

    // First boot pull (delayed slightly so render finishes first)
    if (Gist.isConfigured() && Gist.getGistId() && navigator.onLine) {
        setTimeout(() => pull(), 800);
    }
}

window.YTD_Sync = {
    init,
    pull,
    push,
    syncNow,
    getStatus,
    getLastError,
    getLastSyncedAt,
    onChange,
    refreshConfiguredStatus,
    // expose for settings flow
    mergeWithTombstones,
};
})();
