// ═══════════════════════════════════════════════════════
//  ui-utils.js — Toast, confirm dialog, save indicator,
//  HTML helpers. Replaces alert() / confirm() across the app.
//
//  Exposes: window.YTD_UI = { toast, confirm, escapeHtml,
//                              attachSaveIndicator, formatRelativeDate }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

// ── HTML escaping ─────────────────────────────────────
function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Toast container (lazy create) ─────────────────────
function ensureToastContainer() {
    let c = document.getElementById('ytd-toast-container');
    if (!c) {
        c = document.createElement('div');
        c.id = 'ytd-toast-container';
        c.className = 'ytd-toast-container';
        document.body.appendChild(c);
    }
    return c;
}

// ── Toast ─────────────────────────────────────────────
//   toast('Message')                  — info
//   toast('Saved', { kind: 'success' })
//   toast('Deleted', { kind: 'success', action: { label: 'Undo', onClick: () => {} } })
//   options: { kind: 'info'|'success'|'error'|'warn', timeout: 3500, action?: { label, onClick } }
function toast(message, options = {}) {
    const c = ensureToastContainer();
    const kind = options.kind || 'info';
    const timeout = options.timeout != null ? options.timeout : (options.action ? 6000 : 3500);

    const el = document.createElement('div');
    el.className = `ytd-toast ytd-toast-${kind}`;

    const msg = document.createElement('span');
    msg.className = 'ytd-toast-msg';
    msg.textContent = message;
    el.appendChild(msg);

    let actionBtn = null;
    if (options.action) {
        actionBtn = document.createElement('button');
        actionBtn.className = 'ytd-toast-action';
        actionBtn.textContent = options.action.label || 'Undo';
        actionBtn.addEventListener('click', () => {
            try { options.action.onClick(); } catch (e) { console.error(e); }
            dismiss();
        });
        el.appendChild(actionBtn);
    }

    const close = document.createElement('button');
    close.className = 'ytd-toast-close';
    close.textContent = '×';
    close.title = 'Dismiss';
    close.addEventListener('click', dismiss);
    el.appendChild(close);

    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    let timer = null;
    function dismiss() {
        if (timer) { clearTimeout(timer); timer = null; }
        el.classList.remove('show');
        el.classList.add('hide');
        setTimeout(() => el.remove(), 220);
    }
    if (timeout > 0) timer = setTimeout(dismiss, timeout);

    return { dismiss };
}

// ── Confirm modal (replaces window.confirm) ───────────
//   confirm({ title, message, confirmLabel, cancelLabel, danger })
//     → returns Promise<boolean>
function confirm(opts = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'ytd-confirm-overlay';
        const card = document.createElement('div');
        card.className = 'ytd-confirm-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        const title = document.createElement('h3');
        title.className = 'ytd-confirm-title';
        title.textContent = opts.title || 'Confirm';
        card.appendChild(title);

        if (opts.message) {
            const msg = document.createElement('p');
            msg.className = 'ytd-confirm-message';
            msg.textContent = opts.message;
            card.appendChild(msg);
        }

        const buttons = document.createElement('div');
        buttons.className = 'ytd-confirm-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ytd-btn-cancel';
        cancelBtn.textContent = opts.cancelLabel || 'Cancel';
        cancelBtn.addEventListener('click', () => finish(false));

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'ytd-btn-confirm' + (opts.danger ? ' ytd-btn-danger' : '');
        confirmBtn.textContent = opts.confirmLabel || 'Confirm';
        confirmBtn.addEventListener('click', () => finish(true));

        buttons.appendChild(cancelBtn);
        buttons.appendChild(confirmBtn);
        card.appendChild(buttons);

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // Focus the confirm button by default (or cancel for danger?)
        setTimeout(() => (opts.danger ? cancelBtn : confirmBtn).focus(), 30);

        const onKey = e => {
            if (e.key === 'Escape') finish(false);
            else if (e.key === 'Enter') finish(true);
        };
        document.addEventListener('keydown', onKey);

        const onOverlayClick = e => {
            if (e.target === overlay) finish(false);
        };
        overlay.addEventListener('click', onOverlayClick);

        function finish(ok) {
            document.removeEventListener('keydown', onKey);
            overlay.removeEventListener('click', onOverlayClick);
            overlay.classList.add('hide');
            setTimeout(() => overlay.remove(), 180);
            resolve(ok);
        }
    });
}

// ── Save indicator ────────────────────────────────────
//
// Reflects YTD_State.state.saveStatus. Subscribe-once helper that the main
// app can call after DOM is ready.
function attachSaveIndicator(elementId = 'ytd-save-indicator') {
    const el = document.getElementById(elementId);
    if (!el) return;
    const State = window.YTD_State;
    if (!State) return;

    function update() {
        const s = State.state.saveStatus;
        el.dataset.status = s;
        let txt = '';
        if (s === 'saving') txt = '⟳ Saving…';
        else if (s === 'saved') txt = '✓ Saved';
        else if (s === 'error') txt = '⚠ Save failed';
        else txt = '';
        el.textContent = txt;
    }
    State.subscribe(ev => {
        if (ev.type === 'savestate') update();
    });
    update();
}

// ── Date helpers ──────────────────────────────────────
//
// Returns a friendly label for a YYYY-MM-DD due date relative to today.
//   today        → 'Today'
//   tomorrow     → 'Tomorrow'
//   in 2-7 days  → 'Mon, Sep 12'  (weekday + short date)
//   later        → 'Sep 30'
//   past         → 'Overdue · Aug 5' (caller can colour)
function formatRelativeDate(yyyymmdd) {
    if (!yyyymmdd) return null;
    const d = new Date(yyyymmdd + 'T00:00:00');
    if (isNaN(d.getTime())) {
        // Unrecognised format — return a safe object so consumers can still
        // call .label / .overdue without crashing.
        return { label: String(yyyymmdd), overdue: false, tone: 'later' };
    }
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffDays = Math.round((d - today) / 86400000);
    const monthShort = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (diffDays === 0)  return { label: 'Today',       overdue: false, tone: 'today' };
    if (diffDays === 1)  return { label: 'Tomorrow',    overdue: false, tone: 'soon' };
    if (diffDays === -1) return { label: 'Yesterday',   overdue: true,  tone: 'overdue' };
    if (diffDays < 0)    return { label: monthShort,    overdue: true,  tone: 'overdue' };
    if (diffDays <= 7)   return { label: d.toLocaleDateString(undefined, { weekday: 'short' }) + ', ' + monthShort, overdue: false, tone: 'soon' };
    return { label: monthShort, overdue: false, tone: 'later' };
}

// ── Public ────────────────────────────────────────────
window.YTD_UI = {
    toast,
    confirm,
    escapeHtml,
    attachSaveIndicator,
    formatRelativeDate,
};
})();
