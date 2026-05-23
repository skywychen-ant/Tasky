// ═══════════════════════════════════════════════════════
//  snapshots.js — Daily auto-snapshot rolling buffer
//
//  Strategy:
//   - On app boot, check if today's snapshot exists in localStorage
//   - If not, take one (full store JSON, current timestamp)
//   - Prune any snapshot older than KEEP_DAYS days (default 7)
//
//  localStorage layout:
//    youtodo_snapshot_2026-05-25 → JSON.stringify({ ts, schemaVersion, projects })
//    youtodo_snapshot_2026-05-24 → ...
//
//  Exposes: window.YTD_Snapshots = { autoTake, list, restore, deleteOne, deleteAll }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const Storage = window.YTD_Storage;
const State   = window.YTD_State;
const PREFIX    = 'youtodo_snapshot_';
const KEEP_DAYS = 7;

function todayKey() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateFromKey(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// List all snapshots in localStorage, newest first.
//   [{ key: '2026-05-25', size: bytes, ts: epoch, projects: count }, ...]
function list() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(PREFIX)) continue;
        const dateKey = k.slice(PREFIX.length);
        try {
            const raw = localStorage.getItem(k);
            const obj = raw ? JSON.parse(raw) : null;
            out.push({
                key:      dateKey,
                size:     raw ? raw.length : 0,
                ts:       obj?.ts || 0,
                projects: Array.isArray(obj?.projects) ? obj.projects.length : 0,
                todos:    Array.isArray(obj?.projects)
                            ? obj.projects.reduce((s, p) => s + ((p.todos || []).length), 0)
                            : 0,
            });
        } catch (_) {
            out.push({ key: dateKey, size: 0, ts: 0, projects: 0, todos: 0, broken: true });
        }
    }
    return out.sort((a, b) => (b.key > a.key ? 1 : -1));
}

// Take a snapshot of the current store under today's key. Idempotent — if
// today's snapshot exists we leave it alone (avoid trampling the morning
// state with an evening one). Caller can pass force=true to overwrite.
function autoTake(force = false) {
    if (!localStorage) return null;
    const key = PREFIX + todayKey();
    if (!force && localStorage.getItem(key)) return null;

    const store = State?.state?.store;
    if (!store || !Array.isArray(store.projects)) return null;

    const payload = {
        ts:            Date.now(),
        schemaVersion: store.schemaVersion,
        projects:      store.projects,
    };
    try {
        localStorage.setItem(key, JSON.stringify(payload));
        prune();
        return key;
    } catch (e) {
        // Quota exceeded — try pruning everything except today, retry once
        console.warn('Snapshot save failed, pruning aggressively', e);
        deleteAll(key);
        try {
            localStorage.setItem(key, JSON.stringify(payload));
            return key;
        } catch (e2) {
            console.error('Snapshot still failing after prune', e2);
            return null;
        }
    }
}

// Remove snapshots older than KEEP_DAYS.
function prune() {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    list().forEach(s => {
        const d = dateFromKey(s.key);
        if (d && d < cutoff) localStorage.removeItem(PREFIX + s.key);
    });
}

// Restore a snapshot — replaces the live store. Returns the parsed store
// shape so the caller can pipe it through State.replaceStore().
function restore(key) {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (!obj || !Array.isArray(obj.projects)) return null;
        return { schemaVersion: obj.schemaVersion || 2, projects: obj.projects };
    } catch (e) {
        console.error('Snapshot parse failed', e);
        return null;
    }
}

function deleteOne(key) {
    localStorage.removeItem(PREFIX + key);
}

function deleteAll(except = null) {
    list().forEach(s => {
        if (s.key !== (except ? except.replace(PREFIX, '') : null)) {
            localStorage.removeItem(PREFIX + s.key);
        }
    });
}

window.YTD_Snapshots = { autoTake, list, restore, deleteOne, deleteAll, todayKey };
})();
