// ═══════════════════════════════════════════════════════
//  modals.js — Prompt (text input) + Todo editor (full edit)
//
//  Exposes:
//    window.YTD_Prompt      → async (opts) → string|null
//    window.YTD_TodoEditor  → { open(todo) → async updates|null }
//
//  Both follow the same overlay/card pattern as ui-utils confirm().
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

// ── Generic prompt ────────────────────────────────────
//   YTD_Prompt({ title, placeholder, value, confirmLabel })
function prompt(opts = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'ytd-confirm-overlay';

        const card = document.createElement('div');
        card.className = 'ytd-confirm-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        const title = document.createElement('h3');
        title.className = 'ytd-confirm-title';
        title.textContent = opts.title || 'Input';
        card.appendChild(title);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ytd-prompt-input';
        input.placeholder = opts.placeholder || '';
        input.value = opts.value || '';
        input.maxLength = opts.maxLength || 200;
        card.appendChild(input);

        const buttons = document.createElement('div');
        buttons.className = 'ytd-confirm-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ytd-btn-cancel';
        cancelBtn.textContent = opts.cancelLabel || 'Cancel';
        cancelBtn.addEventListener('click', () => finish(null));

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'ytd-btn-confirm';
        confirmBtn.textContent = opts.confirmLabel || 'OK';
        confirmBtn.addEventListener('click', () => finish(input.value));

        buttons.appendChild(cancelBtn);
        buttons.appendChild(confirmBtn);
        card.appendChild(buttons);

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        setTimeout(() => { input.focus(); input.select(); }, 30);

        const onKey = e => {
            if (e.key === 'Escape') finish(null);
            else if (e.key === 'Enter') finish(input.value);
        };
        document.addEventListener('keydown', onKey);

        const onOverlayClick = e => {
            if (e.target === overlay) finish(null);
        };
        overlay.addEventListener('click', onOverlayClick);

        function finish(val) {
            document.removeEventListener('keydown', onKey);
            overlay.removeEventListener('click', onOverlayClick);
            overlay.classList.add('hide');
            setTimeout(() => overlay.remove(), 180);
            resolve(val);
        }
    });
}
window.YTD_Prompt = prompt;

// ── Todo editor (text + priority + due date + status) ──
//
//   YTD_TodoEditor.open(todo)
//      → { text, priority, dueDate, status } | null
function openTodoEditor(todo) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'ytd-confirm-overlay';

        const card = document.createElement('div');
        card.className = 'ytd-confirm-card ytd-todoedit-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        card.innerHTML = `
            <h3 class="ytd-confirm-title">Edit task</h3>

            <div class="ytd-edit-tabs">
                <button class="ytd-edit-tab active" data-edit-tab="details">📝 Details</button>
                <button class="ytd-edit-tab" data-edit-tab="history">📜 History</button>
            </div>

            <div class="ytd-edit-pane" data-edit-pane="details">
                <label class="ytd-edit-label">Description</label>
                <input type="text" id="ytdEditText" class="ytd-prompt-input" maxlength="500" />

                <label class="ytd-edit-label" style="margin-top:6px">Tags</label>
                <input type="text" id="ytdEditTags" class="ytd-prompt-input" placeholder="comma- or space-separated, e.g. urgent, design" maxlength="200" />

                <div class="ytd-edit-row">
                    <div class="ytd-edit-col">
                        <label class="ytd-edit-label">Status</label>
                        <select id="ytdEditStatus">
                            <option value="todo">To do</option>
                            <option value="doing">Doing</option>
                            <option value="blocked">Blocked</option>
                            <option value="done">Done</option>
                        </select>
                    </div>
                    <div class="ytd-edit-col">
                        <label class="ytd-edit-label">Priority</label>
                        <select id="ytdEditPriority">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div class="ytd-edit-col">
                        <label class="ytd-edit-label">Due date</label>
                        <input type="date" id="ytdEditDueDate" />
                    </div>
                </div>
            </div>

            <div class="ytd-edit-pane" data-edit-pane="history" hidden>
                <div id="ytdEditHistory" class="ytd-history-list"></div>
            </div>

            <div class="ytd-confirm-buttons">
                <button class="ytd-btn-cancel" id="ytdEditCancel">Cancel</button>
                <button class="ytd-btn-confirm" id="ytdEditConfirm">Save</button>
            </div>`;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const txtEl  = card.querySelector('#ytdEditText');
        const tagEl  = card.querySelector('#ytdEditTags');
        const stEl   = card.querySelector('#ytdEditStatus');
        const prEl   = card.querySelector('#ytdEditPriority');
        const ddEl   = card.querySelector('#ytdEditDueDate');
        const histEl = card.querySelector('#ytdEditHistory');

        txtEl.value = todo.text || '';
        tagEl.value = (todo.tags || []).join(', ');
        stEl.value  = todo.status || 'todo';
        prEl.value  = todo.priority || 'medium';
        ddEl.value  = todo.dueDate || '';

        // Render history (read-only)
        renderHistory(histEl, todo);

        // Tab switching
        card.querySelectorAll('.ytd-edit-tab').forEach(b => {
            b.addEventListener('click', () => {
                const k = b.dataset.editTab;
                card.querySelectorAll('.ytd-edit-tab').forEach(x => x.classList.toggle('active', x === b));
                card.querySelectorAll('.ytd-edit-pane').forEach(p => {
                    p.hidden = (p.dataset.editPane !== k);
                });
            });
        });

        setTimeout(() => { txtEl.focus(); txtEl.select(); }, 30);

        function finish(value) {
            document.removeEventListener('keydown', onKey);
            overlay.removeEventListener('click', onOverlayClick);
            overlay.classList.add('hide');
            setTimeout(() => overlay.remove(), 180);
            resolve(value);
        }
        function getValue() {
            const text = txtEl.value.trim();
            if (!text) {
                window.YTD_UI.toast('Description cannot be empty', { kind: 'warn' });
                return undefined;
            }
            return {
                text,
                tags:     window.YTD_Tags.parseList(tagEl.value),
                status:   stEl.value,
                priority: prEl.value,
                dueDate:  ddEl.value || null,
            };
        }
        const onKey = e => {
            if (e.key === 'Escape') finish(null);
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                const v = getValue(); if (v) finish(v);
            }
        };
        document.addEventListener('keydown', onKey);

        const onOverlayClick = e => {
            if (e.target === overlay) finish(null);
        };
        overlay.addEventListener('click', onOverlayClick);

        card.querySelector('#ytdEditCancel').addEventListener('click', () => finish(null));
        card.querySelector('#ytdEditConfirm').addEventListener('click', () => {
            const v = getValue(); if (v) finish(v);
        });
    });
}

window.YTD_TodoEditor = { open: openTodoEditor };

// ── History rendering helper ──────────────────────────
//
// Renders todo.history into a vertical timeline.
function renderHistory(container, todo) {
    const escapeHtml = window.YTD_UI.escapeHtml;
    const events = (todo.history || []).slice().reverse();
    if (!events.length) {
        container.innerHTML = '<div class="ytd-history-empty">No history yet — edits to this task will be tracked here.</div>';
        return;
    }
    const html = events.map(ev => {
        const dt = new Date(ev.at);
        const dateStr = isNaN(dt.getTime()) ? ev.at : dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        let label = '', icon = '·';
        switch (ev.kind) {
            case 'created':
                icon = '🌱'; label = '<b>Created</b>'; break;
            case 'completed':
                icon = '✅'; label = '<b>Completed</b>'; break;
            case 'reopened':
                icon = '🔄'; label = '<b>Reopened</b>'; break;
            case 'status':
                icon = '🔀'; label = `Status: <code>${escapeHtml(ev.from || '')}</code> → <code>${escapeHtml(ev.to || '')}</code>`; break;
            case 'priority':
                icon = '🎯'; label = `Priority: <code>${escapeHtml(ev.from || '')}</code> → <code>${escapeHtml(ev.to || '')}</code>`; break;
            case 'dueDate':
                icon = '📅'; label = `Due: <code>${escapeHtml(ev.from || 'none')}</code> → <code>${escapeHtml(ev.to || 'none')}</code>`; break;
            case 'text':
                icon = '✏️'; label = `Text: <i>${escapeHtml((ev.from || '').slice(0, 60))}</i> → <i>${escapeHtml((ev.to || '').slice(0, 60))}</i>`; break;
            case 'tag-add':
                icon = '🏷'; label = `Tag added: <code>#${escapeHtml(ev.tag || '')}</code>`; break;
            case 'tag-remove':
                icon = '🏷'; label = `Tag removed: <code>#${escapeHtml(ev.tag || '')}</code>`; break;
            case 'subtask-add':
                icon = '➕'; label = `Subtask added: <i>${escapeHtml(ev.text || '')}</i>`; break;
            case 'subtask-remove':
                icon = '➖'; label = `Subtask removed: <i>${escapeHtml(ev.text || '')}</i>`; break;
            case 'project-move':
                icon = '📁'; label = `Moved: <i>${escapeHtml(ev.from || '')}</i> → <i>${escapeHtml(ev.to || '')}</i>`; break;
            default:
                label = escapeHtml(ev.kind);
        }
        return `<div class="ytd-history-row">
            <span class="ytd-history-icon">${icon}</span>
            <span class="ytd-history-time">${escapeHtml(dateStr)}</span>
            <span class="ytd-history-label">${label}</span>
        </div>`;
    }).join('');
    container.innerHTML = html;
}
})();
