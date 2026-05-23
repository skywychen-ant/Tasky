// ═══════════════════════════════════════════════════════
//  Tasky — v2 bootstrap
//  © Sky
//
//  All logic now lives in lib/*.js modules. This file only:
//    1. Wires the persistent header buttons (New Project, search)
//    2. Subscribes the renderer to state changes
//    3. Initialises the help system, keyboard shortcuts, backup, etc.
//    4. Triggers the first render
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const State  = window.YTD_State;
const Render = window.YTD_Render;
const UI     = window.YTD_UI;

// ── New Project button + modal ────────────────────────
async function openNewProjectFlow() {
    const name = await window.YTD_Prompt({
        title: 'New project',
        placeholder: 'Project name',
        confirmLabel: 'Create',
    });
    if (name && name.trim()) {
        const p = State.addProject(name);
        // Open the new project right away so the user can start adding tasks
        State.setView('project', p.id);
    }
}

// ── Global search ─────────────────────────────────────
function attachSearch() {
    const input = document.getElementById('globalSearch');
    if (!input) return;
    let debounceTimer = null;
    input.addEventListener('input', () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            State.setSearch(input.value);
        }, 100);
    });
}

// ── Wire it all up ────────────────────────────────────
function init() {
    // Header buttons (always present)
    document.getElementById('addProjectBtn')?.addEventListener('click', openNewProjectFlow);
    attachSearch();

    // Modules
    window.YTD_Actions.attach();
    window.YTD_Keys.attach();
    window.YTD_Help.attach();
    window.YTD_Backup.attach();
    window.YTD_History.attach();
    window.YTD_Theme.attach();
    window.YTD_Settings.attach();
    window.YTD_Sync.init();
    UI.attachSaveIndicator('ytd-save-indicator');

    // Sync header indicator
    const syncBtn  = document.getElementById('ytd-sync-btn');
    const syncIcon = document.getElementById('ytd-sync-icon');
    const syncLbl  = document.getElementById('ytd-sync-label');
    function updateSyncIndicator(evt) {
        if (!syncIcon || !syncLbl || !syncBtn) return;
        const status = (evt && evt.status) || window.YTD_Sync.getStatus();
        const map = {
            unconfigured: { icon: '☁️',  label: 'Sync',     title: 'Set up cross-device sync' },
            idle:         { icon: '☁️',  label: 'Synced',   title: 'Sync ready · Click for settings' },
            syncing:      { icon: '☁⟳', label: 'Syncing…', title: 'Syncing with GitHub gist…' },
            ok:           { icon: '☁✓', label: 'Synced',   title: 'Last synced: ' + (window.YTD_Sync.getLastSyncedAt() ? new Date(window.YTD_Sync.getLastSyncedAt()).toLocaleTimeString() : '') },
            error:        { icon: '☁⚠', label: 'Sync',     title: 'Sync error: ' + (window.YTD_Sync.getLastError() || 'unknown') },
            offline:      { icon: '☁⊘', label: 'Offline',  title: 'Offline — sync resumes when back online' },
        };
        const m = map[status] || map.idle;
        syncIcon.textContent = m.icon;
        syncLbl.textContent  = m.label;
        syncBtn.title        = m.title;
        syncBtn.dataset.syncStatus = status;
    }
    window.YTD_Sync.onChange(updateSyncIndicator);
    updateSyncIndicator();

    // Undo/redo indicator updates
    const undoEl = document.getElementById('ytd-undo-indicator');
    function updateUndoIndicator() {
        if (!undoEl) return;
        const H = window.YTD_History;
        const labels = H.labels();
        const undoBit = H.canUndo() ? `↶ ${labels.undo}` : '';
        const redoBit = H.canRedo() ? `↷ ${labels.redo}` : '';
        const parts = [undoBit, redoBit].filter(Boolean);
        undoEl.textContent = parts.join(' · ');
        undoEl.title = parts.length
            ? `Undo: ${labels.undo || '—'}\nRedo: ${labels.redo || '—'}\n(Cmd+Z / Cmd+Shift+Z)`
            : 'Nothing to undo';
    }
    window.YTD_History.subscribe(updateUndoIndicator);
    updateUndoIndicator();

    // Auto-snapshot at boot — once per day, prune old ones (Phase C #5)
    try { window.YTD_Snapshots?.autoTake(); } catch (e) { console.warn('Snapshot failed', e); }

    // First render
    Render.rerender();

    // Re-render on every state change. (Inline editing / drag-drop manage
    // their own DOM lifecycle but ultimately rely on state.subscribe to redraw.)
    State.subscribe(ev => {
        // We render on data changes, view changes, filter changes, search changes.
        // savestate events are handled by the save indicator (no full rerender).
        if (ev.type === 'savestate') return;
        Render.rerender();
    });

    // Backup reminder (after a short delay)
    window.YTD_Backup.checkReminder();

    // Re-render when theme changes (heatmap empty cells differ per theme)
    window.addEventListener('ytd-theme-change', () => {
        if (State.state.view === 'stats') Render.rerender();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ── PWA: Service worker registration ──────────────────
//
// Only register when served over HTTPS or localhost (a service worker
// requires a secure origin). When opened via file:// the registration is
// skipped — Tasky still works fully, just without offline cache.
if ('serviceWorker' in navigator) {
    const ok = location.protocol === 'https:' ||
               location.hostname === 'localhost' ||
               location.hostname === '127.0.0.1';
    if (ok) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                // Detect updates and offer a quiet reload via toast.
                reg.addEventListener('updatefound', () => {
                    const sw = reg.installing;
                    if (!sw) return;
                    sw.addEventListener('statechange', () => {
                        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                            window.YTD_UI?.toast('A new version is available — reload to update', {
                                kind: 'info',
                                timeout: 8000,
                                action: { label: 'Reload', onClick: () => location.reload() },
                            });
                        }
                    });
                });
            }).catch(err => {
                console.warn('Service worker registration failed:', err);
            });
        });
    }
}

})();
