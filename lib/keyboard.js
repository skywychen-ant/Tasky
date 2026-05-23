// ═══════════════════════════════════════════════════════
//  keyboard.js — global shortcuts
//
//   N          New project
//   n          New task (focuses task input on project view; on dashboard
//              focuses the active project's quick-add)
//   /          Focus the global search box
//   1 / 2 / 3  Filter All / Active / Completed (in project view)
//   4          Filter Today (in project view)
//   5          Filter Overdue (in project view)
//   a / A      Open All Tasks view
//   c / C      Open Calendar view
//   s          Open Stats view
//   S          Open Sync settings (cross-device sync)
//   t / T      Cycle theme (dark / light / auto)
//   ?  H       Open help
//   Esc        Close any modal / clear search / back to dashboard
//   Cmd/Ctrl+Z      Undo
//   Cmd/Ctrl+Shift+Z (or Cmd+Y) Redo
//   ← / →      Calendar navigation (in calendar view)
//
//  Disabled while typing in <input>/<textarea>/<select>/contenteditable.
//
//  Exposes: window.YTD_Keys = { attach }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const State = window.YTD_State;
const UI    = window.YTD_UI;

function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
}

function focusFirstQuickAdd() {
    const el = document.querySelector('.quick-input');
    if (el) { el.focus(); return true; }
    return false;
}

function onKeyDown(e) {
    // Esc — close anything: modals, search, then back-to-dashboard
    if (e.key === 'Escape') {
        const overlay = document.querySelector('.ytd-confirm-overlay');
        if (overlay) {
            // Click cancel button if any to trigger the dialog's resolver
            const cancel = overlay.querySelector('.ytd-btn-cancel');
            if (cancel) cancel.click();
            return;
        }
        const help = document.getElementById('ytd-help-overlay');
        if (help && !help.hidden) {
            help.hidden = true;
            return;
        }
        if (State.state.search) {
            State.setSearch('');
            return;
        }
        if (State.state.view === 'project') {
            State.setView('dashboard');
            return;
        }
        return;
    }

    // Cmd/Ctrl+Z — undo (Phase C: stack-based)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        // First try: deeper undo via the action stack (Phase C)
        if (window.YTD_History?.canUndo()) {
            const lbl = window.YTD_History.undo();
            if (lbl) UI.toast(`Undone: ${lbl}`, { kind: 'success' });
            return;
        }
        // Fallback: the legacy pendingDelete restore
        if (State.state.pendingDelete) {
            const r = State.undoDelete();
            if (r) UI.toast('Restored', { kind: 'success' });
        }
        return;
    }
    // Cmd/Ctrl+Shift+Z OR Cmd+Y — redo
    if ((e.ctrlKey || e.metaKey) &&
        ((e.key === 'z' || e.key === 'Z') && e.shiftKey || e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        if (window.YTD_History?.canRedo()) {
            const lbl = window.YTD_History.redo();
            if (lbl) UI.toast(`Redone: ${lbl}`, { kind: 'success' });
        }
        return;
    }

    // Skip while typing
    if (isTypingTarget(document.activeElement)) {
        // Exception: '/' should focus search even from quick-add input? No — let
        // typing be typing.
        return;
    }
    // Skip with modifier keys (other than the Cmd+Z handled above)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
        case 'N':
            e.preventDefault();
            document.getElementById('addProjectBtn')?.click();
            return;
        case 'n': {
            e.preventDefault();
            if (State.state.view === 'project') {
                document.getElementById('todoInput')?.focus();
            } else {
                focusFirstQuickAdd();
            }
            return;
        }
        case 'a':
        case 'A':
            e.preventDefault();
            if (State.state.view !== 'all') {
                State.setView('all');
                State.setFilter('all');
            }
            return;
        case 'c':
        case 'C':
            e.preventDefault();
            if (State.state.view !== 'calendar') {
                State.setView('calendar');
                State.setCalendarMonth(null);
            }
            return;
        case 's':
            e.preventDefault();
            if (State.state.view !== 'stats') {
                State.setView('stats');
            }
            return;
        case 'S':
            e.preventDefault();
            window.YTD_Settings?.openModal();
            return;
        case 't':
        case 'T':
            e.preventDefault();
            if (window.YTD_Theme) {
                const next = window.YTD_Theme.cycle();
                const map = { dark: 'Dark', light: 'Light', auto: 'Auto' };
                UI.toast(`Theme: ${map[next]}`, { kind: 'info', timeout: 1500 });
            }
            return;
        case 'ArrowLeft':
            if (State.state.view === 'calendar') {
                e.preventDefault();
                document.querySelector('[data-action="cal-prev"]')?.click();
            }
            return;
        case 'ArrowRight':
            if (State.state.view === 'calendar') {
                e.preventDefault();
                document.querySelector('[data-action="cal-next"]')?.click();
            }
            return;
        case '/': {
            e.preventDefault();
            document.getElementById('globalSearch')?.focus();
            return;
        }
        case '1':
            if (State.state.view === 'project' || State.state.view === 'all') { e.preventDefault(); State.setFilter('all'); }
            return;
        case '2':
            if (State.state.view === 'project' || State.state.view === 'all') { e.preventDefault(); State.setFilter('active'); }
            return;
        case '3':
            if (State.state.view === 'project' || State.state.view === 'all') { e.preventDefault(); State.setFilter('completed'); }
            return;
        case '4':
            if (State.state.view === 'project' || State.state.view === 'all') { e.preventDefault(); State.setFilter('today'); }
            return;
        case '5':
            if (State.state.view === 'project' || State.state.view === 'all') { e.preventDefault(); State.setFilter('overdue'); }
            return;
        case '?':
        case 'h':
        case 'H':
            e.preventDefault();
            document.getElementById('ytd-help-btn')?.click();
            return;
    }
}

function attach() {
    document.addEventListener('keydown', onKeyDown);
}

window.YTD_Keys = { attach };
})();
