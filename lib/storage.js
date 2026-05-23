// ═══════════════════════════════════════════════════════
//  storage.js — LocalStorage I/O + v1 → v2 migration
//
//  Schema v2 (current):
//    {
//      schemaVersion: 2,
//      projects: [{
//        id, name, color, createdAt, updatedAt, archivedAt?,
//        todos: [{
//          id, text, description?, status, priority, tags[], subtasks[],
//          dueDate?, createdAt, updatedAt, completedAt?, order
//        }]
//      }]
//    }
//
//  Schema v1 (legacy):
//    Array<{ id, name, todos: [{ id, text, completed, priority, dueDate, createdAt }] }>
//
//  Exposes: window.YTD_Storage = { load, save, exportSnapshot, importJson }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const KEY      = 'youtodo_v2';
const KEY_V1   = 'youtodo_projects';            // legacy
const KEY_LAST = 'youtodo_last_backup';
const SCHEMA   = 2;

// Defensive default — empty store.
function emptyStore() {
    return { schemaVersion: SCHEMA, projects: [], tombstones: { projects: {}, todos: {} } };
}

// ── Generate ID ───────────────────────────────────────
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── v1 → v2 migration ─────────────────────────────────
// v1 todos had `completed: bool`. v2 uses `status: 'todo'|'doing'|'blocked'|'done'`.
// We map `completed === true` → 'done', else → 'todo'.
function migrateV1(v1ProjectsArr) {
    const projects = v1ProjectsArr.map((p, pi) => ({
        id: p.id || genId(),
        name: p.name || 'Untitled',
        color: null,
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.createdAt || new Date().toISOString(),
        todos: (p.todos || []).map((t, ti) => ({
            id: t.id || genId(),
            text: t.text || '',
            description: '',
            status: t.completed ? 'done' : 'todo',
            priority: t.priority || 'medium',
            tags: [],
            subtasks: [],
            dueDate: t.dueDate || null,
            createdAt: t.createdAt || new Date().toISOString(),
            updatedAt: t.createdAt || new Date().toISOString(),
            completedAt: t.completed ? (t.createdAt || new Date().toISOString()) : null,
            order: ti,
            history: [],
        })),
    }));
    return { schemaVersion: SCHEMA, projects };
}

// Validate any in-coming v2 store shape, fix missing fields.
function normalize(store) {
    if (!store || typeof store !== 'object') return emptyStore();
    if (!Array.isArray(store.projects)) return emptyStore();

    const now = new Date().toISOString();
    store.schemaVersion = SCHEMA;
    // Tombstones — used by cross-device sync to remember deletes
    if (!store.tombstones || typeof store.tombstones !== 'object') {
        store.tombstones = { projects: {}, todos: {} };
    }
    if (!store.tombstones.projects || typeof store.tombstones.projects !== 'object') store.tombstones.projects = {};
    if (!store.tombstones.todos    || typeof store.tombstones.todos    !== 'object') store.tombstones.todos = {};
    store.projects.forEach(p => {
        p.id        = p.id || genId();
        p.name      = p.name || 'Untitled';
        p.color     = p.color || null;
        p.createdAt = p.createdAt || now;
        p.updatedAt = p.updatedAt || p.createdAt;
        if (!Array.isArray(p.todos)) p.todos = [];
        p.todos.forEach((t, ti) => {
            t.id          = t.id || genId();
            t.text        = t.text || '';
            t.description = t.description || '';
            t.status      = t.status || (t.completed ? 'done' : 'todo');
            t.priority    = t.priority || 'medium';
            t.tags        = Array.isArray(t.tags) ? t.tags : [];
            t.subtasks    = Array.isArray(t.subtasks) ? t.subtasks : [];
            t.dueDate     = t.dueDate || null;
            t.createdAt   = t.createdAt || now;
            t.updatedAt   = t.updatedAt || t.createdAt;
            t.completedAt = t.completedAt || (t.status === 'done' ? t.createdAt : null);
            if (typeof t.order !== 'number') t.order = ti;
            // History (Phase C): array of activity events
            if (!Array.isArray(t.history)) t.history = [];
            // Strip legacy `completed` field — superseded by `status`
            delete t.completed;
        });
    });
    return store;
}

// ── Load ──────────────────────────────────────────────
function load() {
    // First try v2 key
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return normalize(parsed);
        }
    } catch (e) {
        console.warn('Failed to parse v2 store; falling back to v1', e);
    }
    // Fallback: v1 key
    try {
        const rawV1 = localStorage.getItem(KEY_V1);
        if (rawV1) {
            const arr = JSON.parse(rawV1);
            if (Array.isArray(arr)) {
                const migrated = migrateV1(arr);
                // Persist the migrated store IMMEDIATELY (skip debounce) so
                // we don't re-migrate on next load even if the user reloads
                // within the 150ms debounce window.
                saveSync(migrated);
                console.info('Migrated v1 → v2 store with', migrated.projects.length, 'projects');
                return migrated;
            }
        }
    } catch (e) {
        console.warn('Failed to migrate v1 store', e);
    }
    return emptyStore();
}

// ── Save ──────────────────────────────────────────────
//
// Debounced write — multiple set() calls in the same tick coalesce into one
// localStorage.setItem call. Returns a promise that resolves once the write
// happens so UI can show "Saved" indicator.
let _saveTimer = null;
let _saveResolvers = [];

function save(store) {
    return new Promise(resolve => {
        _saveResolvers.push(resolve);
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            try {
                localStorage.setItem(KEY, JSON.stringify(store));
                _saveResolvers.forEach(r => r({ ok: true }));
            } catch (e) {
                console.error('localStorage write failed', e);
                _saveResolvers.forEach(r => r({ ok: false, error: e }));
            } finally {
                _saveResolvers = [];
                _saveTimer = null;
            }
        }, 150);
    });
}

// Write immediately (skip debounce) — used by export / migration.
function saveSync(store) {
    try {
        localStorage.setItem(KEY, JSON.stringify(store));
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e };
    }
}

// ── Backup helpers ────────────────────────────────────
function getLastBackupTimestamp() {
    const v = localStorage.getItem(KEY_LAST);
    return v ? parseInt(v, 10) : null;
}
function markBackedUp() {
    localStorage.setItem(KEY_LAST, Date.now().toString());
}

// Pretty-print snapshot for export.
function exportSnapshot(store) {
    return JSON.stringify({
        schemaVersion: store.schemaVersion,
        exportedAt: new Date().toISOString(),
        projects: store.projects,
    }, null, 2);
}

// Parse + normalize an imported JSON string. Throws on invalid.
function importJson(jsonText) {
    const parsed = JSON.parse(jsonText);
    // Accept either { schemaVersion, projects } or a bare array (v1)
    if (Array.isArray(parsed)) {
        return migrateV1(parsed);
    }
    if (parsed && Array.isArray(parsed.projects)) {
        return normalize(parsed);
    }
    throw new Error('Unrecognised backup format — expected v1 array or v2 store');
}

window.YTD_Storage = {
    load,
    save,
    saveSync,
    exportSnapshot,
    importJson,
    getLastBackupTimestamp,
    markBackedUp,
    genId,
};
})();
