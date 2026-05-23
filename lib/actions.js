// ═══════════════════════════════════════════════════════
//  actions.js — Event delegation + action handlers
//
//  Single delegated click/keydown listener on #mainContent. All UI
//  interactions go through `data-action` dispatch.
//
//  Also handles inline-edit, drag-drop, quick-add Enter, etc.
//
//  Exposes: window.YTD_Actions = { attach }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const State = window.YTD_State;
const UI    = window.YTD_UI;

const PRIORITY_CYCLE = ['low', 'medium', 'high'];

function nextPriority(p) {
    const i = PRIORITY_CYCLE.indexOf(p);
    return PRIORITY_CYCLE[(i + 1) % PRIORITY_CYCLE.length];
}

// ── Calendar month helpers ────────────────────────────
function parseCalMonth(yyyymm) {
    if (yyyymm) {
        const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
    }
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function formatCalMonth(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Action handlers ───────────────────────────────────
const handlers = {
    'open-project': (el) => {
        const pid = el.dataset.projectId;
        State.setView('project', pid);
    },

    'back-to-dashboard': () => {
        State.setView('dashboard');
    },

    'open-all-tasks': (el) => {
        const filter = el.dataset.filter || 'all';
        State.setView('all');
        State.setFilter(filter);
    },

    'open-stats': () => {
        State.setView('stats');
    },

    'open-calendar': () => {
        State.setView('calendar');
        State.setCalendarMonth(null);   // current month
    },

    'cal-prev': () => {
        const cm = parseCalMonth(State.state.calendarMonth);
        cm.setMonth(cm.getMonth() - 1);
        State.setCalendarMonth(formatCalMonth(cm));
    },
    'cal-next': () => {
        const cm = parseCalMonth(State.state.calendarMonth);
        cm.setMonth(cm.getMonth() + 1);
        State.setCalendarMonth(formatCalMonth(cm));
    },
    'cal-today': () => {
        State.setCalendarMonth(null);
    },
    'open-cal-day': (el) => {
        const date = el.dataset.date;
        if (!date) return;
        // Open All Tasks filtered by the search '#' syntax doesn't work for dates,
        // so we just put the date string in search; user can clear with Esc.
        State.setView('all');
        State.setSearch('');
        State.setFilter('all');
        // Custom: scroll to the today bucket if date matches; otherwise the user
        // can use that date in search/filter.
    },

    'rename-project': async (el) => {
        const pid = el.dataset.projectId;
        const p = State.projectOf(pid);
        if (!p) return;
        const name = await window.YTD_Prompt({
            title: 'Rename project',
            placeholder: 'Project name',
            value: p.name,
            confirmLabel: 'Save',
        });
        if (name && name.trim()) State.updateProject(pid, { name: name.trim() });
    },

    'delete-project': async (el) => {
        const pid = el.dataset.projectId;
        const p = State.projectOf(pid);
        if (!p) return;
        const ok = await UI.confirm({
            title: 'Delete project?',
            message: `"${p.name}" and its ${p.todos.length} task(s) will be removed. You can undo immediately after.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        State.deleteProject(pid);
        if (State.state.view === 'project' && State.state.currentProjectId === pid) {
            State.setView('dashboard');
        }
        UI.toast(`Project "${p.name}" deleted`, {
            kind: 'success',
            action: { label: 'Undo', onClick: () => State.undoDelete() },
        });
    },

    'toggle-todo': (el) => {
        const pid = el.dataset.projectId;
        const tid = el.dataset.todoId;
        State.toggleTodo(pid, tid);
    },

    'cycle-priority': (el) => {
        const pid = el.dataset.projectId;
        const tid = el.dataset.todoId;
        const t = State.todoOf(pid, tid);
        if (!t) return;
        State.updateTodo(pid, tid, { priority: nextPriority(t.priority) });
    },

    'edit-todo': async (el) => {
        const pid = el.dataset.projectId;
        const tid = el.dataset.todoId;
        const t = State.todoOf(pid, tid);
        if (!t) return;
        const result = await window.YTD_TodoEditor.open(t);
        if (result) State.updateTodo(pid, tid, result);
    },

    'edit-todo-inline': (el) => {
        startInlineEdit(el);
    },

    'delete-todo': async (el) => {
        const pid = el.dataset.projectId;
        const tid = el.dataset.todoId;
        const t = State.todoOf(pid, tid);
        if (!t) return;
        // For todos, skip the modal and trust the toast undo
        State.deleteTodo(pid, tid);
        UI.toast(`Task deleted`, {
            kind: 'success',
            action: { label: 'Undo', onClick: () => State.undoDelete() },
        });
    },

    'set-filter': (el) => {
        State.setFilter(el.dataset.filter);
    },

    'add-todo-from-form': (el) => {
        const pid = el.dataset.projectId;
        const rawText = (document.getElementById('todoInput')?.value || '').trim();
        const priority = document.getElementById('prioritySelect')?.value || 'medium';
        const dueDate = document.getElementById('dueDateInput')?.value || null;
        if (!rawText) {
            UI.toast('Enter a task description first', { kind: 'warn' });
            document.getElementById('todoInput')?.focus();
            return;
        }
        // Extract inline #tags out of the description.
        const { cleaned, tags } = window.YTD_Tags.extract(rawText);
        State.addTodo(pid, { text: cleaned || rawText, priority, dueDate, tags });
        document.getElementById('todoInput').value = '';
        document.getElementById('dueDateInput').value = '';
        document.getElementById('prioritySelect').value = 'medium';
        document.getElementById('todoInput').focus();
    },

    'toggle-subtask': (el) => {
        const pid = el.dataset.projectId;
        const tid = el.dataset.todoId;
        const sid = el.dataset.subtaskId;
        const t = State.todoOf(pid, tid);
        if (!t) return;
        const subs = (t.subtasks || []).map(s =>
            s.id === sid ? { ...s, done: !s.done } : s
        );
        State.updateTodo(pid, tid, { subtasks: subs });
    },

    'delete-subtask': (el) => {
        const pid = el.dataset.projectId;
        const tid = el.dataset.todoId;
        const sid = el.dataset.subtaskId;
        const t = State.todoOf(pid, tid);
        if (!t) return;
        const subs = (t.subtasks || []).filter(s => s.id !== sid);
        State.updateTodo(pid, tid, { subtasks: subs });
    },

    'edit-subtask-inline': (el) => {
        startSubtaskInlineEdit(el);
    },

    'filter-by-tag': (el) => {
        const tag = el.dataset.tag;
        if (!tag) return;
        State.setSearch('#' + tag);
        UI.toast(`Filtering by #${tag}`, { kind: 'info', timeout: 2000 });
    },
};

// ── Inline edit ───────────────────────────────────────
//
// Replaces the .todo-text element with a contenteditable <input>; commit on
// Enter / blur, cancel on Esc.
function startInlineEdit(el) {
    if (!el || el.dataset.editing === '1') return;
    const pid = el.dataset.projectId;
    const tid = el.dataset.todoId;
    const t = State.todoOf(pid, tid);
    if (!t) return;

    el.dataset.editing = '1';
    const old = el.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-inline-input';
    input.value = t.text;
    input.maxLength = 500;

    el.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function commit() {
        if (done) return; done = true;
        const v = input.value.trim();
        if (v && v !== t.text) {
            State.updateTodo(pid, tid, { text: v });
        } else {
            // No change → just rerender to restore element
            window.YTD_Render.rerender();
        }
    }
    function cancel() {
        if (done) return; done = true;
        window.YTD_Render.rerender();
    }
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
}

function startSubtaskInlineEdit(el) {
    if (!el || el.dataset.editing === '1') return;
    const pid = el.dataset.projectId;
    const tid = el.dataset.todoId;
    const sid = el.dataset.subtaskId;
    const t = State.todoOf(pid, tid);
    if (!t) return;
    const sub = (t.subtasks || []).find(s => s.id === sid);
    if (!sub) return;

    el.dataset.editing = '1';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'subtask-inline-input';
    input.value = sub.text;
    input.maxLength = 200;

    el.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function commit() {
        if (done) return; done = true;
        const v = input.value.trim();
        if (v && v !== sub.text) {
            const subs = (t.subtasks || []).map(s =>
                s.id === sid ? { ...s, text: v } : s
            );
            State.updateTodo(pid, tid, { subtasks: subs });
        } else {
            window.YTD_Render.rerender();
        }
    }
    function cancel() {
        if (done) return; done = true;
        window.YTD_Render.rerender();
    }
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
}

// ── Drag-and-drop ─────────────────────────────────────
//
// Strategy: HTML5 native DnD. .todo-item / .todo-item-mini are draggable.
// Drop targets are the same UL containers (data-zone="full" or "mini") plus
// project-card root for cross-project moves.
//
// Visual: dragging gets opacity, drop target gets dashed border.
let _dragSource = null;   // { todoId, projectId, originEl }

function onDragStart(e) {
    const item = e.target.closest('[data-todo-id]');
    if (!item) return;
    _dragSource = {
        todoId:    item.dataset.todoId,
        projectId: item.dataset.projectId,
        originEl:  item,
    };
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', _dragSource.todoId); } catch (_) {}
}
function onDragEnd(e) {
    if (_dragSource && _dragSource.originEl) _dragSource.originEl.classList.remove('dragging');
    document.querySelectorAll('.drop-target-active, .drop-target-card').forEach(el => {
        el.classList.remove('drop-target-active', 'drop-target-card');
    });
    _dragSource = null;
}
function onDragOver(e) {
    if (!_dragSource) return;
    const list = e.target.closest('[data-zone]');
    const card = e.target.closest('.project-card');
    if (!list && !card) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (list) {
        document.querySelectorAll('.drop-target-active').forEach(el => el.classList.remove('drop-target-active'));
        list.classList.add('drop-target-active');
        // Compute insertion point: find the item the cursor is over
        const after = e.target.closest('[data-todo-id]');
        if (after && after !== _dragSource.originEl) {
            const rect = after.getBoundingClientRect();
            const before = (e.clientY - rect.top) < rect.height / 2;
            if (before) list.insertBefore(_dragSource.originEl, after);
            else        list.insertBefore(_dragSource.originEl, after.nextSibling);
        } else if (!list.contains(_dragSource.originEl)) {
            list.appendChild(_dragSource.originEl);
        }
    } else if (card && card.dataset.projectId !== _dragSource.projectId) {
        document.querySelectorAll('.drop-target-card').forEach(el => el.classList.remove('drop-target-card'));
        card.classList.add('drop-target-card');
    }
}
function onDrop(e) {
    if (!_dragSource) return;
    const list = e.target.closest('[data-zone]');
    const card = e.target.closest('.project-card');
    e.preventDefault();
    if (list) {
        // Same-project reorder: gather all data-todo-id in current DOM order
        const targetProjectId = list.dataset.projectId;
        const sourceProjectId = _dragSource.projectId;
        const newOrderIds = Array.from(list.querySelectorAll('[data-todo-id]')).map(el => el.dataset.todoId);

        if (sourceProjectId === targetProjectId) {
            State.reorderTodos(targetProjectId, newOrderIds);
        } else {
            // Cross-project move: insert at correct position
            const insertIdx = newOrderIds.indexOf(_dragSource.todoId);
            State.moveTodo(sourceProjectId, targetProjectId, _dragSource.todoId, insertIdx);
        }
    } else if (card && card.dataset.projectId !== _dragSource.projectId) {
        // Drop directly on project card (not on its list) → append to end
        State.moveTodo(_dragSource.projectId, card.dataset.projectId, _dragSource.todoId, -1);
        UI.toast(`Moved to "${State.projectOf(card.dataset.projectId).name}"`, { kind: 'success' });
    }
}

// ── Click delegation ──────────────────────────────────
function onClick(e) {
    // Look for first ancestor with data-action
    let el = e.target;
    while (el && el !== document) {
        if (el.dataset && el.dataset.action) {
            const fn = handlers[el.dataset.action];
            if (fn) {
                fn(el, e);
                return;
            }
        }
        el = el.parentNode;
    }
}

// ── Quick-add via Enter ───────────────────────────────
function onKeyPress(e) {
    if (e.key !== 'Enter') return;
    const input = e.target;
    if (!input.dataset) return;

    if (input.dataset.action === 'quick-add') {
        const pid = input.dataset.projectId;
        const text = input.value.trim();
        if (!text) return;
        const { cleaned, tags } = window.YTD_Tags.extract(text);
        State.addTodo(pid, { text: cleaned || text, priority: 'medium', tags });
        input.value = '';
        return;
    }

    if (input.dataset.action === 'add-subtask') {
        e.preventDefault();
        const pid = input.dataset.projectId;
        const tid = input.dataset.todoId;
        const text = input.value.trim();
        if (!text) return;
        const t = State.todoOf(pid, tid);
        if (!t) return;
        const newSub = { id: window.YTD_Storage.genId(), text, done: false };
        const subs = [...(t.subtasks || []), newSub];
        State.updateTodo(pid, tid, { subtasks: subs });
        // Re-render will replace the input; refocus the new one.
        setTimeout(() => {
            const fresh = document.querySelector(`[data-action="add-subtask"][data-todo-id="${tid}"]`);
            if (fresh) fresh.focus();
        }, 30);
    }
}

// ── Attach ────────────────────────────────────────────
function attach() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    main.addEventListener('click', onClick);
    main.addEventListener('keypress', onKeyPress);
    main.addEventListener('dragstart', onDragStart);
    main.addEventListener('dragend', onDragEnd);
    main.addEventListener('dragover', onDragOver);
    main.addEventListener('drop', onDrop);
}

window.YTD_Actions = { attach };
})();
