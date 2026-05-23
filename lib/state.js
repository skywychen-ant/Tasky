// ═══════════════════════════════════════════════════════
//  state.js — central state + mutations + pub/sub
//
//  All data writes go through this module so we can:
//   - debounce-save to localStorage
//   - emit "saved" events for the auto-save indicator
//   - notify subscribers (renderers) of changes
//
//  Exposes: window.YTD_State
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const Storage = window.YTD_Storage;
const genId   = Storage.genId;

// ── In-memory state ───────────────────────────────────
const state = {
    store:          Storage.load(),     // { schemaVersion, projects: [...] }
    view:           'dashboard',         // 'dashboard' | 'project' | 'all' | 'stats' | 'calendar'
    currentProjectId: null,
    filter:         'all',               // 'all' | 'active' | 'completed' | 'today' | 'overdue' | 'high'
    search:         '',                  // global search query
    saveStatus:     'idle',              // 'idle' | 'saving' | 'saved' | 'error'
    pendingDelete:  null,                // for undo support
    calendarMonth:  null,                // 'YYYY-MM' for calendar view; null = current month
};

// ── Pub/sub ───────────────────────────────────────────
const subs = new Set();
function subscribe(cb) { subs.add(cb); return () => subs.delete(cb); }
function emit(event)   { for (const cb of subs) try { cb(event, state); } catch (e) { console.error(e); } }

// ── Save flow ─────────────────────────────────────────
function persist(reason = 'change') {
    state.saveStatus = 'saving';
    emit({ type: 'savestate', reason });
    Storage.save(state.store).then(r => {
        state.saveStatus = r.ok ? 'saved' : 'error';
        emit({ type: 'savestate', reason });
        // Reset to idle after 2s
        if (r.ok) setTimeout(() => {
            if (state.saveStatus === 'saved') {
                state.saveStatus = 'idle';
                emit({ type: 'savestate', reason: 'idle' });
            }
        }, 2000);
    });
}

// ── Project mutations ─────────────────────────────────
function addProject(name) {
    const now = new Date().toISOString();
    const p = {
        id:        genId(),
        name:      name.trim(),
        color:     null,
        createdAt: now,
        updatedAt: now,
        todos:     [],
    };
    state.store.projects.push(p);
    persist('add-project');
    emit({ type: 'change', reason: 'add-project', projectId: p.id });
    return p;
}

function updateProject(projectId, updates) {
    const p = state.store.projects.find(x => x.id === projectId);
    if (!p) return null;
    Object.assign(p, updates, { updatedAt: new Date().toISOString() });
    persist('update-project');
    emit({ type: 'change', reason: 'update-project', projectId });
    return p;
}

function deleteProject(projectId) {
    const idx = state.store.projects.findIndex(p => p.id === projectId);
    if (idx < 0) return null;
    const removed = state.store.projects.splice(idx, 1)[0];
    state.pendingDelete = { kind: 'project', data: removed, index: idx };
    // Tombstone (for cross-device sync). Records also tombstones for every
    // todo inside the project so they don't reappear on the other side.
    const now = new Date().toISOString();
    const ts = state.store.tombstones || (state.store.tombstones = { projects: {}, todos: {} });
    ts.projects[projectId] = now;
    (removed.todos || []).forEach(t => { ts.todos[t.id] = now; });
    persist('delete-project');
    emit({ type: 'change', reason: 'delete-project', projectId });
    return removed;
}

// ── Todo mutations ────────────────────────────────────
function projectOf(projectId) {
    return state.store.projects.find(p => p.id === projectId) || null;
}

function addTodo(projectId, fields) {
    const p = projectOf(projectId);
    if (!p) return null;
    const now = new Date().toISOString();
    const todo = {
        id:          genId(),
        text:        (fields.text || '').trim(),
        description: fields.description || '',
        status:      fields.status || 'todo',
        priority:    fields.priority || 'medium',
        tags:        Array.isArray(fields.tags) ? fields.tags : [],
        subtasks:    Array.isArray(fields.subtasks) ? fields.subtasks : [],
        dueDate:     fields.dueDate || null,
        createdAt:   now,
        updatedAt:   now,
        completedAt: null,
        order:       p.todos.length,
        history:     [{ at: now, kind: 'created' }],
    };
    p.todos.push(todo);
    p.updatedAt = now;
    persist('add-todo');
    emit({ type: 'change', reason: 'add-todo', projectId, todoId: todo.id });
    return todo;
}

// ── History helper ────────────────────────────────────
//
// Compare an old todo with the updates and record meaningful diff events
// onto t.history. Called from updateTodo so the consumer doesn't worry.
//
// Tracked: status, priority, dueDate, project move, completion, text change,
// tags add/remove, subtasks add/remove (not toggle).
function recordHistory(oldT, newT, now) {
    const events = [];
    if (oldT.status !== newT.status) {
        events.push({ at: now, kind: 'status', from: oldT.status, to: newT.status });
        if (newT.status === 'done')      events.push({ at: now, kind: 'completed' });
        else if (oldT.status === 'done') events.push({ at: now, kind: 'reopened' });
    }
    if (oldT.priority !== newT.priority) {
        events.push({ at: now, kind: 'priority', from: oldT.priority, to: newT.priority });
    }
    if ((oldT.dueDate || null) !== (newT.dueDate || null)) {
        events.push({ at: now, kind: 'dueDate', from: oldT.dueDate, to: newT.dueDate });
    }
    if ((oldT.text || '').trim() !== (newT.text || '').trim()) {
        events.push({ at: now, kind: 'text', from: oldT.text, to: newT.text });
    }
    // Tag diff
    const oldTags = new Set(oldT.tags || []);
    const newTags = new Set(newT.tags || []);
    (newT.tags || []).forEach(tag => { if (!oldTags.has(tag)) events.push({ at: now, kind: 'tag-add',    tag }); });
    (oldT.tags || []).forEach(tag => { if (!newTags.has(tag)) events.push({ at: now, kind: 'tag-remove', tag }); });
    // Subtask add/remove (not toggle, would be too noisy)
    const oldSubs = new Map((oldT.subtasks || []).map(s => [s.id, s.text]));
    const newSubs = new Map((newT.subtasks || []).map(s => [s.id, s.text]));
    newSubs.forEach((text, id) => { if (!oldSubs.has(id)) events.push({ at: now, kind: 'subtask-add',    text }); });
    oldSubs.forEach((text, id) => { if (!newSubs.has(id)) events.push({ at: now, kind: 'subtask-remove', text }); });
    return events;
}

function updateTodo(projectId, todoId, updates) {
    const p = projectOf(projectId);
    if (!p) return null;
    const t = p.todos.find(x => x.id === todoId);
    if (!t) return null;
    const now = new Date().toISOString();
    // Snapshot old shallow copy for history diff
    const before = {
        text:     t.text,
        status:   t.status,
        priority: t.priority,
        dueDate:  t.dueDate,
        tags:     (t.tags || []).slice(),
        subtasks: (t.subtasks || []).slice(),
    };
    Object.assign(t, updates, { updatedAt: now });

    // If status changes to/from 'done', sync completedAt
    if ('status' in updates) {
        if (updates.status === 'done' && !t.completedAt) {
            t.completedAt = now;
        } else if (updates.status !== 'done' && t.completedAt) {
            t.completedAt = null;
        }
    }
    // Record history diff
    const events = recordHistory(before, t, now);
    if (events.length) {
        if (!Array.isArray(t.history)) t.history = [];
        t.history.push(...events);
        // Cap at 200 entries per todo (oldest dropped first)
        if (t.history.length > 200) t.history = t.history.slice(-200);
    }
    p.updatedAt = now;
    persist('update-todo');
    emit({ type: 'change', reason: 'update-todo', projectId, todoId });
    return t;
}

function toggleTodo(projectId, todoId) {
    const p = projectOf(projectId);
    if (!p) return null;
    const t = p.todos.find(x => x.id === todoId);
    if (!t) return null;
    const newStatus = t.status === 'done' ? 'todo' : 'done';
    return updateTodo(projectId, todoId, { status: newStatus });
}

function deleteTodo(projectId, todoId) {
    const p = projectOf(projectId);
    if (!p) return null;
    const idx = p.todos.findIndex(x => x.id === todoId);
    if (idx < 0) return null;
    const removed = p.todos.splice(idx, 1)[0];
    state.pendingDelete = { kind: 'todo', data: removed, projectId, index: idx };
    p.updatedAt = new Date().toISOString();
    // Tombstone for cross-device sync
    const ts = state.store.tombstones || (state.store.tombstones = { projects: {}, todos: {} });
    ts.todos[todoId] = p.updatedAt;
    persist('delete-todo');
    emit({ type: 'change', reason: 'delete-todo', projectId, todoId });
    return removed;
}

// Restore the most recent delete (project or todo). Returns the restored item
// or null if nothing pending or expired.
function undoDelete() {
    const pd = state.pendingDelete;
    if (!pd) return null;
    state.pendingDelete = null;

    const ts = state.store.tombstones || (state.store.tombstones = { projects: {}, todos: {} });

    if (pd.kind === 'project') {
        state.store.projects.splice(pd.index, 0, pd.data);
        // Lift tombstones for the project AND all of its todos
        delete ts.projects[pd.data.id];
        (pd.data.todos || []).forEach(t => delete ts.todos[t.id]);
        persist('undo-delete-project');
        emit({ type: 'change', reason: 'undo-delete-project', projectId: pd.data.id });
        return { kind: 'project', data: pd.data };
    }
    if (pd.kind === 'todo') {
        const p = projectOf(pd.projectId);
        if (!p) return null;
        p.todos.splice(pd.index, 0, pd.data);
        p.updatedAt = new Date().toISOString();
        delete ts.todos[pd.data.id];
        persist('undo-delete-todo');
        emit({ type: 'change', reason: 'undo-delete-todo', projectId: pd.projectId, todoId: pd.data.id });
        return { kind: 'todo', data: pd.data, projectId: pd.projectId };
    }
    return null;
}

// Reorder todos within a project. `newOrder` is an array of todo IDs in the
// desired display order.
function reorderTodos(projectId, newOrder) {
    const p = projectOf(projectId);
    if (!p) return false;
    const byId = new Map(p.todos.map(t => [t.id, t]));
    const reordered = [];
    for (const id of newOrder) {
        if (byId.has(id)) {
            reordered.push(byId.get(id));
            byId.delete(id);
        }
    }
    // Append any todos missing from newOrder (shouldn't happen but safe)
    for (const t of byId.values()) reordered.push(t);
    reordered.forEach((t, i) => { t.order = i; });
    p.todos = reordered;
    p.updatedAt = new Date().toISOString();
    persist('reorder-todos');
    emit({ type: 'change', reason: 'reorder-todos', projectId });
    return true;
}

// Move a single todo between projects (drag across project cards).
function moveTodo(fromProjectId, toProjectId, todoId, insertIndex = -1) {
    const from = projectOf(fromProjectId);
    const to   = projectOf(toProjectId);
    if (!from || !to || from === to) return false;
    const idx = from.todos.findIndex(t => t.id === todoId);
    if (idx < 0) return false;
    const [removed] = from.todos.splice(idx, 1);
    if (insertIndex < 0 || insertIndex > to.todos.length) {
        to.todos.push(removed);
    } else {
        to.todos.splice(insertIndex, 0, removed);
    }
    const now = new Date().toISOString();
    removed.updatedAt = now;
    // Record history event
    if (!Array.isArray(removed.history)) removed.history = [];
    removed.history.push({ at: now, kind: 'project-move', from: from.name, to: to.name });
    if (removed.history.length > 200) removed.history = removed.history.slice(-200);
    from.todos.forEach((t, i) => { t.order = i; });
    to.todos.forEach((t, i) => { t.order = i; });
    from.updatedAt = now;
    to.updatedAt   = now;
    persist('move-todo');
    emit({ type: 'change', reason: 'move-todo', fromProjectId, toProjectId, todoId });
    return true;
}

// ── View / filter / search mutations ──────────────────
function setView(view, projectId = null) {
    state.view = view;
    state.currentProjectId = projectId;
    state.filter = 'all';   // reset filter when changing view
    emit({ type: 'view', view, projectId });
}
function setFilter(filter) {
    state.filter = filter;
    emit({ type: 'filter', filter });
}
function setSearch(query) {
    state.search = query || '';
    emit({ type: 'search', query: state.search });
}

function setCalendarMonth(yyyymm) {
    state.calendarMonth = yyyymm;
    emit({ type: 'calendar-month', value: yyyymm });
}

// ── Replace store wholesale (used by import) ──────────
function replaceStore(newStore) {
    state.store = newStore;
    persist('replace-store');
    emit({ type: 'change', reason: 'replace-store' });
}

// ── Public API ────────────────────────────────────────
window.YTD_State = {
    state,
    subscribe,
    emit,
    addProject, updateProject, deleteProject,
    addTodo, updateTodo, toggleTodo, deleteTodo,
    reorderTodos, moveTodo,
    undoDelete,
    setView, setFilter, setSearch,
    setCalendarMonth,
    replaceStore,
    // Convenience accessors
    projectOf,
    todoOf: (projectId, todoId) => {
        const p = projectOf(projectId);
        return p ? p.todos.find(t => t.id === todoId) || null : null;
    },
};
})();
