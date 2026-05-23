// ═══════════════════════════════════════════════════════
//  render.js — Dashboard + Project view rendering, event delegation
//
//  No inline onclick="..." anywhere. All interactions are bound via a
//  single delegated click handler on #mainContent that dispatches
//  on `data-action` attributes.
//
//  Exposes: window.YTD_Render = { rerender, attachDelegation }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const State    = window.YTD_State;
const UI       = window.YTD_UI;
const Tags     = window.YTD_Tags;
const escapeHtml = UI.escapeHtml;
const fmtDate    = UI.formatRelativeDate;

const PRIORITY_LABEL = { high: 'High', medium: 'Med', low: 'Low' };
const STATUS_LABEL   = { todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done' };

// Render an inline list of tag chips for a todo.
function renderTagsHtml(tags) {
    if (!tags || !tags.length) return '';
    return tags.slice(0, 6).map(tag => {
        const c = Tags.colorFor(tag);
        return `<span class="tag-chip" style="background:${c.bg};color:${c.fg};border-color:${c.border}" data-action="filter-by-tag" data-tag="${escapeHtml(tag)}" title="Click to filter by #${escapeHtml(tag)}">#${escapeHtml(tag)}</span>`;
    }).join('') + (tags.length > 6 ? `<span class="tag-chip tag-chip-more">+${tags.length - 6}</span>` : '');
}

// Render subtask progress badge "3/5"
function renderSubtaskBadge(subtasks) {
    if (!subtasks || !subtasks.length) return '';
    const done = subtasks.filter(s => s.done).length;
    const total = subtasks.length;
    const complete = done === total;
    return `<span class="subtask-badge${complete ? ' complete' : ''}" title="${done} of ${total} subtasks done">▣ ${done}/${total}</span>`;
}

function getMain() { return document.getElementById('mainContent'); }

// ── Filter helper ─────────────────────────────────────
function applyFilter(todos) {
    const f = State.state.filter;
    const search = (State.state.search || '').trim().toLowerCase();

    let list = todos.slice();
    if (f === 'active')    list = list.filter(t => t.status !== 'done');
    else if (f === 'completed') list = list.filter(t => t.status === 'done');
    else if (f === 'today')     list = list.filter(t => isDueToday(t));
    else if (f === 'overdue')   list = list.filter(t => isOverdue(t));

    if (search) {
        // Special syntax: "#tag" → match if the todo has that tag (exact)
        if (search.startsWith('#') && search.length > 1) {
            const wanted = search.slice(1).toLowerCase();
            list = list.filter(t => (t.tags || []).some(x => x.toLowerCase() === wanted));
        } else {
            list = list.filter(t =>
                (t.text + ' ' + (t.description || '') + ' ' + (t.tags || []).map(x => '#' + x).join(' '))
                    .toLowerCase().includes(search)
            );
        }
    }
    return list;
}

function isDueToday(t) {
    if (!t.dueDate || t.status === 'done') return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(t.dueDate + 'T00:00:00');
    return d.getTime() === today.getTime();
}
function isOverdue(t) {
    if (!t.dueDate || t.status === 'done') return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(t.dueDate + 'T00:00:00');
    return d < today;
}

// ── Rerender entry point ──────────────────────────────
function rerender() {
    const view = State.state.view;
    if (view === 'project')        renderProjectView();
    else if (view === 'all')       renderAllTasksView();
    else if (view === 'stats')     renderStatsView();
    else if (view === 'calendar')  renderCalendarView();
    else                            renderDashboard();
    updateGlobalSearch();
}

function updateGlobalSearch() {
    const s = document.getElementById('globalSearch');
    if (s && s.value !== State.state.search) s.value = State.state.search;
}

// ── Dashboard ─────────────────────────────────────────
function renderDashboard() {
    const main = getMain();
    const projects = State.state.store.projects;

    if (!projects.length) {
        main.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <h2>Welcome to Tasky</h2>
                <p>Click <strong>+ New Project</strong> in the top right to start.</p>
                <p style="margin-top:8px;font-size:0.85em;color:var(--text-muted)">
                    Tip: press <kbd>N</kbd> for a new project, <kbd>n</kbd> for a new task, <kbd>?</kbd> for help.
                </p>
            </div>`;
        return;
    }

    const totalTodos = projects.reduce((s, p) => s + p.todos.length, 0);
    const totalActive = projects.reduce((s, p) => s + p.todos.filter(t => t.status !== 'done').length, 0);
    const totalCompleted = totalTodos - totalActive;
    const todayCount = projects.reduce((s, p) => s + p.todos.filter(isDueToday).length, 0);
    const overdueCount = projects.reduce((s, p) => s + p.todos.filter(isOverdue).length, 0);
    const highCount = projects.reduce((s, p) => s + p.todos.filter(t => t.status !== 'done' && t.priority === 'high').length, 0);

    let html = '<div class="dashboard">';
    html += `
        <div class="dashboard-header">
            <h2>📊 Overview</h2>
            <div class="dashboard-stats">
                ${statCard(projects.length, 'Projects')}
                ${statCard(totalTodos, 'Total Tasks')}
                ${statCard(totalActive, 'Active')}
                ${statCard(totalCompleted, 'Completed')}
                ${statCard(todayCount, 'Today', todayCount > 0 ? 'today' : '')}
                ${statCard(overdueCount, 'Overdue', overdueCount > 0 ? 'overdue' : '')}
            </div>
        </div>`;

    // Quick filter chips → jump straight into the All Tasks view with that filter applied
    html += `
        <div class="dashboard-chips">
            <button class="dash-chip" data-action="open-all-tasks" data-filter="all">📥 All Tasks <span class="chip-count">${totalTodos}</span></button>
            <button class="dash-chip" data-action="open-all-tasks" data-filter="today" ${todayCount === 0 ? 'disabled' : ''}>📅 Today <span class="chip-count">${todayCount}</span></button>
            <button class="dash-chip${overdueCount > 0 ? ' chip-danger' : ''}" data-action="open-all-tasks" data-filter="overdue" ${overdueCount === 0 ? 'disabled' : ''}>⚠️ Overdue <span class="chip-count">${overdueCount}</span></button>
            <button class="dash-chip" data-action="open-all-tasks" data-filter="high" ${highCount === 0 ? 'disabled' : ''}>🔴 High Priority <span class="chip-count">${highCount}</span></button>
            <button class="dash-chip" data-action="open-all-tasks" data-filter="active">⏳ Active <span class="chip-count">${totalActive}</span></button>
            <button class="dash-chip dash-chip-alt" data-action="open-calendar">📆 Calendar</button>
            <button class="dash-chip dash-chip-alt" data-action="open-stats">📊 Stats</button>
        </div>`;

    // Tag cloud — clickable, filters via search
    const tagsList = (window.YTD_Tags?.allTags(State.state.store) || []).slice(0, 14);
    if (tagsList.length) {
        html += `<div class="dashboard-tags">
            <span class="dash-tags-label">Tags:</span>
            ${tagsList.map(({ tag, count }) => {
                const c = window.YTD_Tags.colorFor(tag);
                return `<span class="tag-chip" style="background:${c.bg};color:${c.fg};border-color:${c.border}" data-action="filter-by-tag" data-tag="${escapeHtml(tag)}" title="Click to filter All Tasks by #${escapeHtml(tag)}">#${escapeHtml(tag)} <span class="tag-count">${count}</span></span>`;
            }).join('')}
        </div>`;
    }

    html += '<div class="projects-grid" data-zone="dashboard">';
    projects.forEach(p => { html += projectCard(p); });
    html += '</div></div>';

    main.innerHTML = html;
}

function statCard(value, label, tone = '') {
    return `<div class="stat-card${tone ? ' tone-' + tone : ''}">
        <div class="stat-value">${value}</div>
        <div class="stat-label">${escapeHtml(label)}</div>
    </div>`;
}

function projectCard(project) {
    const active = project.todos.filter(t => t.status !== 'done');
    const completed = project.todos.length - active.length;
    const progress = project.todos.length > 0
        ? Math.round((completed / project.todos.length) * 100)
        : 0;

    const top = active
        .slice()
        .sort((a, b) => {
            const pri = { high: 0, medium: 1, low: 2 };
            return (pri[a.priority] - pri[b.priority]) || (a.order - b.order);
        })
        .slice(0, 5);

    let todoHtml = '';
    if (top.length === 0) {
        todoHtml = '<div class="no-todos">No active tasks</div>';
    } else {
        todoHtml = '<ul class="todo-list-mini" data-project-id="' + escapeHtml(project.id) + '" data-zone="mini">';
        top.forEach(t => { todoHtml += todoMiniRow(t, project.id); });
        todoHtml += '</ul>';
        if (active.length > 5) {
            todoHtml += `<div class="more-todos">${active.length - 5} more…</div>`;
        }
    }

    return `
        <div class="project-card" data-project-id="${escapeHtml(project.id)}">
            <div class="project-card-header">
                <h3 class="project-card-title" data-action="open-project" data-project-id="${escapeHtml(project.id)}" tabindex="0">
                    ${escapeHtml(project.name)}
                </h3>
                <div class="project-card-actions">
                    <button class="btn-icon" data-action="rename-project" data-project-id="${escapeHtml(project.id)}" title="Rename">✏️</button>
                    <button class="btn-icon" data-action="delete-project" data-project-id="${escapeHtml(project.id)}" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="project-stats-mini">
                <span>📝 ${project.todos.length} total</span>
                <span>⏳ ${active.length} active</span>
                <span>✅ ${completed} done</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
            <div class="progress-text">${progress}% complete</div>
            <div class="quick-add">
                <input type="text" class="quick-input" data-action="quick-add" data-project-id="${escapeHtml(project.id)}" placeholder="Quick add task… (Enter)" />
            </div>
            <div class="project-todos">${todoHtml}</div>
            <button class="btn-view-all" data-action="open-project" data-project-id="${escapeHtml(project.id)}">View All →</button>
        </div>`;
}

function todoMiniRow(t, projectId) {
    const due = t.dueDate ? fmtDate(t.dueDate) : null;
    let dueHtml = '';
    if (due) {
        dueHtml = `<span class="due-date-mini ${due.overdue ? 'overdue' : ''}" title="${escapeHtml(t.dueDate)}">📅 ${escapeHtml(due.label)}</span>`;
    }
    const subBadge = renderSubtaskBadge(t.subtasks);
    return `
        <li class="todo-item-mini" draggable="true" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}">
            <input type="checkbox" data-action="toggle-todo" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" ${t.status === 'done' ? 'checked' : ''}>
            <span class="todo-text-mini" data-action="edit-todo-inline" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" tabindex="0">${escapeHtml(t.text)}</span>
            <span class="priority-badge-mini priority-${escapeHtml(t.priority)}" data-action="cycle-priority" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" title="Click to cycle priority">
                ${PRIORITY_LABEL[t.priority] || ''}
            </span>
            ${subBadge}
            ${dueHtml}
        </li>`;
}

// ── Project view ──────────────────────────────────────
function renderProjectView() {
    const main = getMain();
    const project = State.projectOf(State.state.currentProjectId);
    if (!project) {
        State.setView('dashboard');
        return;
    }

    const list = applyFilter(project.todos);
    list.sort((a, b) => {
        if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
        return (a.order || 0) - (b.order || 0);
    });

    const active = project.todos.filter(t => t.status !== 'done').length;
    const completed = project.todos.length - active;

    let html = `
        <div class="project-view">
            <div class="project-view-header">
                <button class="btn-back" data-action="back-to-dashboard">← Dashboard</button>
                <div class="project-title-section">
                    <h2 class="project-title-display" data-action="rename-project" data-project-id="${escapeHtml(project.id)}" tabindex="0">${escapeHtml(project.name)}</h2>
                    <button class="btn-edit-title" data-action="rename-project" data-project-id="${escapeHtml(project.id)}" title="Rename">✏️</button>
                </div>
                <button class="btn-delete-project" data-action="delete-project" data-project-id="${escapeHtml(project.id)}">🗑️ Delete Project</button>
            </div>

            <div class="add-todo-section">
                <input type="text" id="todoInput" placeholder="Enter task… (Enter to add)" />
                <select id="prioritySelect">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                </select>
                <input type="date" id="dueDateInput" />
                <button id="addTodoBtn" data-action="add-todo-from-form" data-project-id="${escapeHtml(project.id)}">➕ Add</button>
            </div>

            <div class="filter-section">
                ${filterBtn('all',       'All',       project.todos.length)}
                ${filterBtn('active',    'Active',    active)}
                ${filterBtn('completed', 'Completed', completed)}
                ${filterBtn('today',     'Today',     project.todos.filter(isDueToday).length)}
                ${filterBtn('overdue',   'Overdue',   project.todos.filter(isOverdue).length)}
            </div>

            <ul class="todo-list" data-project-id="${escapeHtml(project.id)}" data-zone="full">
                ${list.length === 0 ? '<li class="no-todos-row">No tasks match the current filter</li>' : list.map(t => todoFullRow(t, project.id)).join('')}
            </ul>
        </div>`;

    main.innerHTML = html;

    // Wire the form's Enter key + add button focus.
    const inp = document.getElementById('todoInput');
    if (inp) {
        inp.focus();
        inp.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                document.getElementById('addTodoBtn').click();
            }
        });
    }
}

function filterBtn(key, label, count) {
    const active = State.state.filter === key;
    return `<button class="filter-btn${active ? ' active' : ''}" data-action="set-filter" data-filter="${key}">
        ${escapeHtml(label)} <span class="filter-count">${count}</span>
    </button>`;
}

// ── All Tasks view ────────────────────────────────────
//
// Flattens every todo across every project into a single list, then
// groups them by smart due-date bucket: Overdue / Today / Tomorrow /
// This week / Later / No date / Done.
function renderAllTasksView() {
    const main = getMain();
    const projects = State.state.store.projects;

    // Flatten — keep a reference to the parent project for each todo
    const allWithProject = [];
    projects.forEach(p => {
        (p.todos || []).forEach(t => {
            allWithProject.push({ todo: t, project: p });
        });
    });

    // Apply filter (using state.filter) + search
    const f = State.state.filter;
    const search = (State.state.search || '').trim().toLowerCase();
    let list = allWithProject.filter(({ todo }) => {
        if (f === 'active'    && todo.status === 'done') return false;
        if (f === 'completed' && todo.status !== 'done') return false;
        if (f === 'today'     && !isDueToday(todo))      return false;
        if (f === 'overdue'   && !isOverdue(todo))       return false;
        if (f === 'high' && (todo.priority !== 'high' || todo.status === 'done')) return false;
        return true;
    });
    if (search) {
        if (search.startsWith('#') && search.length > 1) {
            const wanted = search.slice(1).toLowerCase();
            list = list.filter(({ todo }) =>
                (todo.tags || []).some(x => x.toLowerCase() === wanted)
            );
        } else {
            list = list.filter(({ todo, project }) =>
                (todo.text + ' ' + (todo.description || '') + ' ' + project.name + ' ' +
                 (todo.tags || []).map(x => '#' + x).join(' '))
                    .toLowerCase().includes(search)
            );
        }
    }

    // Group by bucket
    const buckets = {
        overdue:  { label: '⚠️ Overdue',   tone: 'overdue', items: [] },
        today:    { label: '📅 Today',     tone: 'today',   items: [] },
        tomorrow: { label: '☀️ Tomorrow',  tone: 'soon',    items: [] },
        thisweek: { label: '📆 This week', tone: 'soon',    items: [] },
        later:    { label: '📋 Later',     tone: 'later',   items: [] },
        nodate:   { label: '🌫 No due date', tone: '',       items: [] },
        done:     { label: '✅ Completed', tone: 'done',    items: [] },
    };

    const today = new Date(); today.setHours(0, 0, 0, 0);
    list.forEach(entry => {
        const t = entry.todo;
        if (t.status === 'done') { buckets.done.items.push(entry); return; }
        if (!t.dueDate)          { buckets.nodate.items.push(entry); return; }
        const d = new Date(t.dueDate + 'T00:00:00');
        if (isNaN(d.getTime()))  { buckets.nodate.items.push(entry); return; }
        const diff = Math.round((d - today) / 86400000);
        if (diff < 0)            buckets.overdue.items.push(entry);
        else if (diff === 0)     buckets.today.items.push(entry);
        else if (diff === 1)     buckets.tomorrow.items.push(entry);
        else if (diff <= 7)      buckets.thisweek.items.push(entry);
        else                     buckets.later.items.push(entry);
    });

    // Sort each bucket: priority high → low, then due-date asc
    const priOrder = { high: 0, medium: 1, low: 2 };
    Object.values(buckets).forEach(b => {
        b.items.sort((a, c) => {
            const dp = priOrder[a.todo.priority] - priOrder[c.todo.priority];
            if (dp !== 0) return dp;
            const ad = a.todo.dueDate || '9999-12-31';
            const bd = c.todo.dueDate || '9999-12-31';
            return ad.localeCompare(bd);
        });
    });

    // Counts for filter chips at top
    const totalTodos     = allWithProject.length;
    const activeCount    = allWithProject.filter(({ todo }) => todo.status !== 'done').length;
    const completedCount = allWithProject.length - activeCount;
    const todayCount     = allWithProject.filter(({ todo }) => isDueToday(todo)).length;
    const overdueCount   = allWithProject.filter(({ todo }) => isOverdue(todo)).length;
    const highCount      = allWithProject.filter(({ todo }) => todo.priority === 'high' && todo.status !== 'done').length;

    let html = `
        <div class="all-tasks-view">
            <div class="project-view-header">
                <button class="btn-back" data-action="back-to-dashboard">← Dashboard</button>
                <h2 class="all-tasks-title">📥 All Tasks <span class="all-tasks-count">${list.length}</span></h2>
                <span></span>
            </div>

            <div class="filter-section">
                ${filterBtn('all',       'All',       totalTodos)}
                ${filterBtn('active',    'Active',    activeCount)}
                ${filterBtn('completed', 'Completed', completedCount)}
                ${filterBtn('today',     'Today',     todayCount)}
                ${filterBtn('overdue',   'Overdue',   overdueCount)}
                ${filterBtn('high',      'High pri',  highCount)}
            </div>

            ${list.length === 0
                ? '<div class="empty-state" style="padding:60px 20px"><div class="empty-icon" style="font-size:3em">🎉</div><h2>No matching tasks</h2><p style="color:var(--text-muted)">Try a different filter or clear the search.</p></div>'
                : Object.entries(buckets)
                    .filter(([, b]) => b.items.length > 0)
                    .map(([key, b]) => `
                        <div class="bucket-group bucket-${b.tone || 'plain'}">
                            <div class="bucket-header">
                                <span class="bucket-label">${b.label}</span>
                                <span class="bucket-count">${b.items.length}</span>
                            </div>
                            <ul class="todo-list bucket-list">
                                ${b.items.map(({ todo, project }) => allTaskRow(todo, project)).join('')}
                            </ul>
                        </div>
                    `).join('')
            }
        </div>`;

    main.innerHTML = html;
}

// Row renderer for All Tasks view — adds a project tag, otherwise same as full row.
function allTaskRow(t, project) {
    const due = t.dueDate ? fmtDate(t.dueDate) : null;
    let dueHtml = '';
    if (due) {
        dueHtml = `<span class="due-date ${due.overdue ? 'overdue' : ''}" title="${escapeHtml(t.dueDate)}">📅 ${escapeHtml(due.label)}</span>`;
    }
    const tagsHtml = renderTagsHtml(t.tags);
    const subBadge = renderSubtaskBadge(t.subtasks);

    return `
        <li class="todo-item${t.status === 'done' ? ' completed' : ''}" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(project.id)}">
            <input type="checkbox" class="todo-checkbox" data-action="toggle-todo" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(project.id)}" ${t.status === 'done' ? 'checked' : ''}>
            <div class="todo-content">
                <div class="todo-text-row">
                    <span class="todo-text" data-action="edit-todo-inline" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(project.id)}" tabindex="0">${escapeHtml(t.text)}</span>
                </div>
                <div class="todo-meta">
                    <span class="project-tag" data-action="open-project" data-project-id="${escapeHtml(project.id)}" title="Open project">📁 ${escapeHtml(project.name)}</span>
                    <span class="priority-badge priority-${escapeHtml(t.priority)}" data-action="cycle-priority" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(project.id)}" title="Click to cycle priority">${PRIORITY_LABEL[t.priority] || ''} priority</span>
                    ${dueHtml}
                    ${subBadge}
                    ${tagsHtml}
                </div>
            </div>
            <div class="todo-actions">
                <button class="btn-edit" data-action="edit-todo" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(project.id)}" title="Edit details">✏️</button>
                <button class="btn-delete" data-action="delete-todo" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(project.id)}" title="Delete">🗑️</button>
            </div>
        </li>`;
}

function todoFullRow(t, projectId) {
    const due = t.dueDate ? fmtDate(t.dueDate) : null;
    let dueHtml = '';
    if (due) {
        dueHtml = `<span class="due-date ${due.overdue ? 'overdue' : ''}" title="${escapeHtml(t.dueDate)}">📅 ${escapeHtml(due.label)}${due.overdue ? ' (Overdue)' : ''}</span>`;
    }
    const tagsHtml = renderTagsHtml(t.tags);
    const subBadge = renderSubtaskBadge(t.subtasks);
    const subListHtml = renderSubtaskList(t, projectId);

    return `
        <li class="todo-item${t.status === 'done' ? ' completed' : ''}" draggable="true" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}">
            <input type="checkbox" class="todo-checkbox" data-action="toggle-todo" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" ${t.status === 'done' ? 'checked' : ''}>
            <div class="todo-content">
                <div class="todo-text-row">
                    <span class="todo-text" data-action="edit-todo-inline" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" tabindex="0">${escapeHtml(t.text)}</span>
                </div>
                <div class="todo-meta">
                    <span class="priority-badge priority-${escapeHtml(t.priority)}" data-action="cycle-priority" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" title="Click to cycle priority">${PRIORITY_LABEL[t.priority] || ''} priority</span>
                    ${dueHtml}
                    ${subBadge}
                    ${tagsHtml}
                </div>
                ${subListHtml}
            </div>
            <div class="todo-actions">
                <button class="btn-edit" data-action="edit-todo" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" title="Edit details">✏️</button>
                <button class="btn-delete" data-action="delete-todo" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" title="Delete">🗑️</button>
            </div>
        </li>`;
}

// Subtask checklist — inline, expandable. Click any subtask to toggle done.
// "+ Add subtask" input at the bottom.
function renderSubtaskList(t, projectId) {
    const subs = t.subtasks || [];
    const items = subs.map(s => `
        <li class="subtask-item${s.done ? ' done' : ''}">
            <input type="checkbox" data-action="toggle-subtask" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" data-subtask-id="${escapeHtml(s.id)}" ${s.done ? 'checked' : ''}>
            <span class="subtask-text" data-action="edit-subtask-inline" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" data-subtask-id="${escapeHtml(s.id)}" tabindex="0">${escapeHtml(s.text)}</span>
            <button class="btn-subtask-remove" data-action="delete-subtask" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" data-subtask-id="${escapeHtml(s.id)}" title="Remove subtask">✕</button>
        </li>`).join('');

    return `
        <ul class="subtask-list">
            ${items}
            <li class="subtask-add">
                <input type="text" class="subtask-input" data-action="add-subtask" data-todo-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(projectId)}" placeholder="+ Add subtask… (Enter)">
            </li>
        </ul>`;
}

// ═══════════════════════════════════════════════════════
//  Phase C — Calendar view (month grid)
// ═══════════════════════════════════════════════════════
//
// State: state.calendarMonth = ISO 'YYYY-MM' (first day of the displayed
// month). When undefined we show the current month.
function getCalendarMonth() {
    const cm = State.state.calendarMonth;
    if (cm) {
        const m = /^(\d{4})-(\d{2})$/.exec(cm);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

function renderCalendarView() {
    const main = getMain();
    const monthStart = getCalendarMonth();
    const year       = monthStart.getFullYear();
    const month      = monthStart.getMonth();
    const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const firstWeekday = monthStart.getDay();        // 0=Sun
    const daysInMonth  = new Date(year, month + 1, 0).getDate();

    const today = new Date(); today.setHours(0,0,0,0);
    const todayKey = `${year}-${String(month+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const todayMonthMatches = today.getFullYear() === year && today.getMonth() === month;

    // Group todos by due date
    const byDate = {};
    State.state.store.projects.forEach(p => {
        (p.todos || []).forEach(t => {
            if (!t.dueDate) return;
            (byDate[t.dueDate] ??= []).push({ todo: t, project: p });
        });
    });

    // Build cell list: 7 cols × N rows. Pad start with blank, end too.
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
        const k = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const items = byDate[k] || [];
        cells.push({
            d, key: k,
            isToday: k === (todayMonthMatches ? todayKey : null),
            items,
            doneCount:    items.filter(({ todo }) => todo.status === 'done').length,
            overdueCount: items.filter(({ todo }) => todo.status !== 'done' && new Date(k + 'T00:00:00') < today).length,
            activeCount:  items.filter(({ todo }) => todo.status !== 'done').length,
        });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let cellsHtml = '';
    cells.forEach(c => {
        if (!c) {
            cellsHtml += '<div class="cal-cell cal-cell-empty"></div>';
            return;
        }
        const cls = [
            'cal-cell',
            c.isToday      ? 'cal-cell-today'   : '',
            c.overdueCount ? 'cal-cell-overdue' : '',
        ].filter(Boolean).join(' ');

        const items = c.items.slice(0, 3);
        const itemsHtml = items.map(({ todo, project }) => {
            const cls2 = [
                'cal-item',
                todo.status === 'done' ? 'cal-item-done' : '',
                todo.priority === 'high' ? 'cal-item-high' : '',
            ].filter(Boolean).join(' ');
            return `<div class="${cls2}" data-action="edit-todo" data-todo-id="${escapeHtml(todo.id)}" data-project-id="${escapeHtml(project.id)}" title="${escapeHtml(project.name)} · ${escapeHtml(todo.text)}">
                <span class="cal-item-pri pri-${escapeHtml(todo.priority)}"></span>
                <span class="cal-item-text">${escapeHtml(todo.text)}</span>
            </div>`;
        }).join('');
        const more = c.items.length > 3
            ? `<div class="cal-more" data-action="open-cal-day" data-date="${escapeHtml(c.key)}">+${c.items.length - 3} more</div>`
            : '';

        cellsHtml += `<div class="${cls}" data-action="open-cal-day" data-date="${escapeHtml(c.key)}">
            <div class="cal-day-num${c.activeCount ? ' has-tasks' : ''}">${c.d}</div>
            ${itemsHtml}
            ${more}
        </div>`;
    });

    main.innerHTML = `
        <div class="calendar-view">
            <div class="project-view-header">
                <button class="btn-back" data-action="back-to-dashboard">← Dashboard</button>
                <div class="cal-nav">
                    <button class="btn-icon" data-action="cal-prev" title="Previous month (←)">‹</button>
                    <h2 class="cal-month">${escapeHtml(monthLabel)}</h2>
                    <button class="btn-icon" data-action="cal-next" title="Next month (→)">›</button>
                    <button class="btn-secondary" data-action="cal-today">Today</button>
                </div>
                <span></span>
            </div>

            <div class="cal-weekdays">
                ${weekdayLabels.map(l => `<div class="cal-weekday-label">${l}</div>`).join('')}
            </div>
            <div class="cal-grid">${cellsHtml}</div>
        </div>`;
}


function renderStatsView() {
    const main = getMain();
    const Stats = window.YTD_Stats;
    if (!Stats) {
        main.innerHTML = '<div class="empty-state">Stats module not loaded</div>';
        return;
    }
    const store = State.state.store;
    const heatmap   = Stats.activityHeatmap(store, 91);    // ~13 weeks
    const burnd     = Stats.burndown(store, 30);
    const projComp  = Stats.projectCompletion(store);
    const top       = Stats.topTags(store, 12);
    const byWeekday = Stats.completionByWeekday(store);
    const byHour    = Stats.completionByHour(store);
    const streak    = Stats.streaks(store);
    const recent    = Stats.recentCompletions(store);
    const stale     = Stats.staleProjects(store);

    let html = `
        <div class="stats-view">
            <div class="project-view-header">
                <button class="btn-back" data-action="back-to-dashboard">← Dashboard</button>
                <h2 class="all-tasks-title">📊 Statistics</h2>
                <span></span>
            </div>

            <div class="stats-summary">
                ${statSummaryCard('🔥', recent.last7,  'completed in 7 days')}
                ${statSummaryCard('📈', recent.last30, 'completed in 30 days')}
                ${statSummaryCard('⚡', streak.current,'day streak')}
                ${statSummaryCard('🏆', streak.longest,'longest streak')}
            </div>

            <div class="stats-grid">
                <div class="stats-card">
                    <h3 class="stats-title">📅 Activity (last 13 weeks)</h3>
                    ${renderHeatmapSvg(heatmap)}
                    <p class="stats-caption">Each cell = one day. Brighter = more tasks completed.</p>
                </div>

                <div class="stats-card">
                    <h3 class="stats-title">📉 Active vs Completed (last 30 days)</h3>
                    ${renderBurndownSvg(burnd)}
                </div>

                <div class="stats-card">
                    <h3 class="stats-title">📊 Completion by project</h3>
                    ${renderProjectCompletion(projComp)}
                </div>

                <div class="stats-card">
                    <h3 class="stats-title">🏷 Top tags</h3>
                    ${renderTopTags(top)}
                </div>

                <div class="stats-card">
                    <h3 class="stats-title">📆 Completed by weekday</h3>
                    ${renderWeekdayBars(byWeekday)}
                </div>

                <div class="stats-card">
                    <h3 class="stats-title">🕐 Completed by hour</h3>
                    ${renderHourBars(byHour)}
                </div>

                <div class="stats-card stats-card-wide">
                    <h3 class="stats-title">😴 Stale projects (longest idle)</h3>
                    ${renderStaleProjects(stale)}
                </div>
            </div>
        </div>`;

    main.innerHTML = html;
}

function statSummaryCard(emoji, value, label) {
    return `<div class="stats-summary-card">
        <div class="stats-summary-emoji">${emoji}</div>
        <div class="stats-summary-value">${value}</div>
        <div class="stats-summary-label">${escapeHtml(label)}</div>
    </div>`;
}

// SVG heatmap — column-major: 13 weeks × 7 weekdays
function renderHeatmapSvg(cells) {
    const cellSize = 14, gap = 3;
    // Pad start of array so the first column starts on Sunday
    if (!cells.length) return '<div class="stats-empty">No activity yet</div>';
    const firstWeekday = cells[0].weekday;   // 0=Sun
    const padded = new Array(firstWeekday).fill(null).concat(cells);
    const cols = Math.ceil(padded.length / 7);
    const W = cols * (cellSize + gap);
    const H = 7 * (cellSize + gap) + 14;
    let max = 0;
    cells.forEach(c => { if (c.completed > max) max = c.completed; });

    let cellsHtml = '';
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const emptyFill = isLight ? '#e5e9f0' : '#1a2030';
    padded.forEach((c, i) => {
        const col = Math.floor(i / 7);
        const row = i % 7;
        if (!c) return;
        const x = col * (cellSize + gap);
        const y = row * (cellSize + gap) + 14;
        const intensity = max > 0 ? c.completed / max : 0;
        const fill = c.completed === 0
            ? emptyFill
            : `hsl(${145 - intensity * 30}, 65%, ${20 + intensity * 35}%)`;
        cellsHtml += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fill}"><title>${c.date} — ${c.completed} completed, ${c.created} created</title></rect>`;
    });
    // Weekday labels (Mon, Wed, Fri)
    let labelsHtml = '';
    ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach((lbl, idx) => {
        if (lbl) {
            const y = idx * (cellSize + gap) + 14 + cellSize - 3;
            labelsHtml += `<text x="-2" y="${y}" class="hm-label" text-anchor="end">${lbl}</text>`;
        }
    });
    return `<div class="stats-svg-wrap"><svg viewBox="-30 0 ${W + 30} ${H}" class="stats-svg" preserveAspectRatio="xMidYMid meet">${labelsHtml}${cellsHtml}</svg></div>`;
}

// SVG line/area chart for burndown
function renderBurndownSvg(series) {
    if (!series.length) return '<div class="stats-empty">No data</div>';
    const W = 560, H = 200, pad = 32;
    const xs = i => pad + (i * (W - pad * 1.5)) / Math.max(1, series.length - 1);
    const maxY = Math.max(1, ...series.map(s => Math.max(s.active, s.completed)));
    const ys = v => H - pad - ((v / maxY) * (H - pad * 2));

    const linePath = (key) => series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(s[key])}`).join(' ');

    // X-axis tick labels — first, middle, last
    const ticks = [0, Math.floor(series.length / 2), series.length - 1].map(i => {
        const date = series[i].date.slice(5);
        return `<text x="${xs(i)}" y="${H - 6}" class="ax-label" text-anchor="middle">${date}</text>`;
    }).join('');

    // Y-axis ticks (0, mid, max)
    const yTicks = [0, Math.round(maxY / 2), maxY].map(v =>
        `<g><line x1="${pad}" x2="${W - pad/2}" y1="${ys(v)}" y2="${ys(v)}" stroke="#2d3548" stroke-width="0.5"/><text x="${pad - 4}" y="${ys(v) + 4}" class="ax-label" text-anchor="end">${v}</text></g>`
    ).join('');

    const activePath    = linePath('active');
    const completedPath = linePath('completed');

    return `<div class="stats-svg-wrap">
        <svg viewBox="0 0 ${W} ${H}" class="stats-svg" preserveAspectRatio="xMidYMid meet">
            ${yTicks}
            <path d="${activePath}"    fill="none" stroke="#fbbf24" stroke-width="2" />
            <path d="${completedPath}" fill="none" stroke="#10b981" stroke-width="2" />
            ${ticks}
            <g class="legend" transform="translate(${pad}, ${pad - 10})">
                <rect x="0"  y="0" width="10" height="10" fill="#fbbf24" />
                <text x="14" y="9" class="ax-label">Active</text>
                <rect x="60" y="0" width="10" height="10" fill="#10b981" />
                <text x="74" y="9" class="ax-label">Completed</text>
            </g>
        </svg>
    </div>`;
}

function renderProjectCompletion(rows) {
    if (!rows.length) return '<div class="stats-empty">No projects</div>';
    return `<ul class="stats-bars">
        ${rows.slice(0, 8).map(r => `
            <li>
                <span class="stats-bar-label">${escapeHtml(r.name)}</span>
                <div class="stats-bar-track">
                    <div class="stats-bar-fill" style="width: ${r.pct}%"></div>
                </div>
                <span class="stats-bar-value">${r.done}/${r.total} · ${r.pct}%</span>
            </li>`).join('')}
    </ul>`;
}

function renderTopTags(rows) {
    if (!rows.length) return '<div class="stats-empty">No tags yet — try adding <code>#urgent</code> in a task description.</div>';
    return `<div class="stats-tag-cloud">
        ${rows.map(r => {
            const c = window.YTD_Tags.colorFor(r.tag);
            const size = 0.85 + Math.min(0.7, r.count * 0.06);
            return `<span class="tag-chip" style="background:${c.bg};color:${c.fg};border-color:${c.border};font-size:${size}em" data-action="filter-by-tag" data-tag="${escapeHtml(r.tag)}">#${escapeHtml(r.tag)} <span class="tag-count">${r.count}</span></span>`;
        }).join('')}
    </div>`;
}

function renderWeekdayBars(arr) {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const max = Math.max(1, ...arr);
    return `<ul class="stats-bars stats-bars-h">
        ${arr.map((v, i) => `
            <li class="stats-h-bar">
                <span class="stats-bar-label" style="width:36px">${labels[i]}</span>
                <div class="stats-bar-track">
                    <div class="stats-bar-fill" style="width:${(v / max) * 100}%"></div>
                </div>
                <span class="stats-bar-value">${v}</span>
            </li>`).join('')}
    </ul>`;
}

function renderHourBars(arr) {
    const max = Math.max(1, ...arr);
    const gap = 1.5;
    const W = 22, H = 80;
    const totalW = arr.length * (W + gap);
    return `<div class="stats-svg-wrap">
        <svg viewBox="0 0 ${totalW} ${H + 22}" class="stats-svg" preserveAspectRatio="xMidYMid meet">
            ${arr.map((v, i) => {
                const h = (v / max) * H;
                const x = i * (W + gap);
                const y = H - h;
                return `<g><rect x="${x}" y="${y}" width="${W}" height="${h}" fill="#4a9eff" rx="2"><title>${i}:00 — ${v} completed</title></rect>${i % 3 === 0 ? `<text x="${x + W/2}" y="${H + 14}" class="ax-label" text-anchor="middle">${i}</text>` : ''}</g>`;
            }).join('')}
        </svg>
    </div>`;
}

function renderStaleProjects(rows) {
    if (!rows.length) return '<div class="stats-empty">No projects</div>';
    return `<ul class="stats-stale-list">
        ${rows.map(r => `
            <li>
                <span class="stats-stale-name" data-action="open-project" data-project-id="${escapeHtml(r.id)}">${escapeHtml(r.name)}</span>
                <span class="stats-stale-days">${r.daysIdle} day${r.daysIdle === 1 ? '' : 's'} idle</span>
            </li>`).join('')}
    </ul>`;
}

// Public
window.YTD_Render = { rerender };
})();
