// ═══════════════════════════════════════════════════════
//  backup.js — Export (JSON / CSV / Markdown) + Import + reminder
//
//  Exposes: window.YTD_Backup
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const State   = window.YTD_State;
const UI      = window.YTD_UI;
const Storage = window.YTD_Storage;

function dateSlug() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}

function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Export JSON ───────────────────────────────────────
function exportJSON() {
    const text = Storage.exportSnapshot(State.state.store);
    downloadBlob(text, `tasky-backup-${dateSlug()}.json`, 'application/json');
    Storage.markBackedUp();
    UI.toast('JSON backup downloaded — save it to Drive / Dropbox', { kind: 'success', timeout: 5000 });
}

// ── Export CSV ────────────────────────────────────────
function csvEscape(s) {
    if (s == null) return '';
    return String(s).replace(/"/g, '""');
}

function exportCSV() {
    const rows = [['Project','Task','Description','Status','Priority','Due Date','Tags','Created','Completed','Updated']];
    const projects = State.state.store.projects;
    projects.forEach(p => {
        p.todos.forEach(t => {
            rows.push([
                p.name,
                t.text,
                t.description || '',
                t.status,
                t.priority,
                t.dueDate || '',
                (t.tags || []).join('|'),
                t.createdAt || '',
                t.completedAt || '',
                t.updatedAt || '',
            ]);
        });
    });
    const csv = rows.map(r => r.map(c => `"${csvEscape(c)}"`).join(',')).join('\n');
    downloadBlob(csv, `tasky-export-${dateSlug()}.csv`, 'text/csv');
    Storage.markBackedUp();
    UI.toast('CSV exported', { kind: 'success' });
}

// ── Export Markdown ───────────────────────────────────
function exportMarkdown() {
    const projects = State.state.store.projects;
    const total = projects.reduce((s, p) => s + p.todos.length, 0);
    const done  = projects.reduce((s, p) => s + p.todos.filter(t => t.status === 'done').length, 0);

    let md = `# Tasky — Task Report\n\n`;
    md += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    md += `---\n\n`;
    md += `## 📊 Summary\n\n`;
    md += `- **Projects:** ${projects.length}\n`;
    md += `- **Total tasks:** ${total}\n`;
    md += `- **Completed:** ${done}\n`;
    md += `- **Active:** ${total - done}\n`;
    md += `- **Completion rate:** ${total > 0 ? Math.round((done / total) * 100) : 0}%\n\n`;
    md += `---\n\n`;

    const PRI = { high: '🔴 High', medium: '🟡 Med', low: '🟢 Low' };

    projects.forEach(p => {
        md += `## 📁 ${p.name}\n\n`;
        const active = p.todos.filter(t => t.status !== 'done');
        const completed = p.todos.filter(t => t.status === 'done');
        md += `**Stats:** ${p.todos.length} total · ${active.length} active · ${completed.length} done\n\n`;
        if (active.length) {
            md += `### ⏳ Active\n\n`;
            active.forEach(t => {
                const due = t.dueDate ? ` _(due ${t.dueDate})_` : '';
                const tags = (t.tags && t.tags.length) ? ` ${t.tags.map(x => '`#' + x + '`').join(' ')}` : '';
                md += `- [ ] ${PRI[t.priority]} ${t.text}${due}${tags}\n`;
            });
            md += `\n`;
        }
        if (completed.length) {
            md += `### ✅ Completed\n\n`;
            completed.forEach(t => {
                const tags = (t.tags && t.tags.length) ? ` ${t.tags.map(x => '`#' + x + '`').join(' ')}` : '';
                md += `- [x] ${PRI[t.priority]} ${t.text}${tags}\n`;
            });
            md += `\n`;
        }
        md += `---\n\n`;
    });

    downloadBlob(md, `tasky-report-${dateSlug()}.md`, 'text/markdown');
    Storage.markBackedUp();
    UI.toast('Markdown report exported', { kind: 'success' });
}

// ── Import ────────────────────────────────────────────
//
// Two modes:
//   - Replace: wipe current store, drop in the imported one
//   - Merge:   match by id; same-id project merges todos by id, taking
//              the more recent updatedAt
function importFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const newStore = Storage.importJson(text);

            // Ask Replace vs Merge
            const choice = await chooseImportMode(State.state.store, newStore);
            if (!choice) return;

            if (choice === 'replace') {
                State.replaceStore(newStore);
                window.YTD_Render.rerender();
                UI.toast(`Replaced with ${newStore.projects.length} project(s)`, { kind: 'success' });
            } else {
                const merged = mergeStores(State.state.store, newStore);
                State.replaceStore(merged.store);
                window.YTD_Render.rerender();
                UI.toast(
                    `Merged: +${merged.added} new tasks, ↻ ${merged.updated} updated, = ${merged.skipped} unchanged`,
                    { kind: 'success', timeout: 6000 }
                );
            }
        } catch (err) {
            console.error(err);
            UI.toast('Import failed: ' + err.message, { kind: 'error', timeout: 5000 });
        }
    };
    input.click();
}

// Show a small modal asking the user to pick Replace or Merge mode.
function chooseImportMode(currentStore, incomingStore) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'ytd-confirm-overlay';
        const card = document.createElement('div');
        card.className = 'ytd-confirm-card ytd-import-card';

        const curStats = `${currentStore.projects.length} project(s), ${currentStore.projects.reduce((s, p) => s + p.todos.length, 0)} task(s)`;
        const newStats = `${incomingStore.projects.length} project(s), ${incomingStore.projects.reduce((s, p) => s + p.todos.length, 0)} task(s)`;

        card.innerHTML = `
            <h3 class="ytd-confirm-title">Import: choose mode</h3>
            <p class="ytd-confirm-message">
                <b>Current:</b> ${curStats}<br>
                <b>Incoming:</b> ${newStats}
            </p>
            <div class="ytd-import-modes">
                <button class="ytd-import-mode" data-mode="merge">
                    <div class="ytd-import-mode-title">🔀 Merge</div>
                    <div class="ytd-import-mode-desc">Combine both. Same-ID projects get their tasks merged; for any conflict the more recent one wins.</div>
                </button>
                <button class="ytd-import-mode" data-mode="replace">
                    <div class="ytd-import-mode-title">⚠️ Replace</div>
                    <div class="ytd-import-mode-desc">Wipe current data and use only the imported file. Cannot be undone.</div>
                </button>
            </div>
            <div class="ytd-confirm-buttons">
                <button class="ytd-btn-cancel">Cancel</button>
            </div>`;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function finish(mode) {
            overlay.classList.add('hide');
            setTimeout(() => overlay.remove(), 180);
            resolve(mode);
        }
        card.querySelectorAll('[data-mode]').forEach(b => {
            b.addEventListener('click', () => finish(b.dataset.mode));
        });
        card.querySelector('.ytd-btn-cancel').addEventListener('click', () => finish(null));
        overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });
    });
}

// Merge two stores. Returns { store, added, updated, skipped }.
function mergeStores(current, incoming) {
    const merged = JSON.parse(JSON.stringify(current));   // deep clone current
    const projById = new Map(merged.projects.map(p => [p.id, p]));
    let added = 0, updated = 0, skipped = 0;

    incoming.projects.forEach(np => {
        const existing = projById.get(np.id);
        if (!existing) {
            // Brand-new project — keep wholesale; counts each todo as added
            merged.projects.push(JSON.parse(JSON.stringify(np)));
            added += np.todos.length;
            return;
        }
        // Same-id project — merge tasks
        const todoMap = new Map(existing.todos.map(t => [t.id, t]));
        np.todos.forEach(nt => {
            const ot = todoMap.get(nt.id);
            if (!ot) {
                existing.todos.push(JSON.parse(JSON.stringify(nt)));
                added++;
            } else {
                const otAt = new Date(ot.updatedAt || 0).getTime();
                const ntAt = new Date(nt.updatedAt || 0).getTime();
                if (ntAt > otAt) {
                    Object.assign(ot, JSON.parse(JSON.stringify(nt)));
                    updated++;
                } else {
                    skipped++;
                }
            }
        });
        // Update project metadata from the more recent one
        const oAt = new Date(existing.updatedAt || 0).getTime();
        const iAt = new Date(np.updatedAt || 0).getTime();
        if (iAt > oAt) {
            existing.name      = np.name;
            existing.color     = np.color;
            existing.updatedAt = np.updatedAt;
        }
        // Re-number order
        existing.todos.forEach((t, i) => { t.order = i; });
    });

    return { store: merged, added, updated, skipped };
}

// ── Reminder ──────────────────────────────────────────
function checkReminder() {
    const last = Storage.getLastBackupTimestamp();
    if (!last) return;
    const days = Math.floor((Date.now() - last) / 86400000);
    if (days >= 7) {
        setTimeout(() => {
            UI.toast(`Last backup was ${days} days ago. Consider exporting now.`, {
                kind: 'warn',
                timeout: 8000,
                action: { label: 'Backup', onClick: () => openModal() },
            });
        }, 1500);
    }
}

// ── Backup modal wiring ───────────────────────────────
function openModal() {
    document.getElementById('backupModal')?.classList.add('show');
}
function closeModal() {
    document.getElementById('backupModal')?.classList.remove('show');
}

function attach() {
    document.getElementById('backupBtn')?.addEventListener('click', () => {
        renderSnapshotsList();
        openModal();
    });
    document.getElementById('closeBackupBtn')?.addEventListener('click', closeModal);
    document.getElementById('exportJSONBtn')?.addEventListener('click', () => { exportJSON(); closeModal(); });
    document.getElementById('exportCSVBtn')?.addEventListener('click',  () => { exportCSV();  closeModal(); });
    document.getElementById('exportMarkdownBtn')?.addEventListener('click', () => { exportMarkdown(); closeModal(); });
    document.getElementById('importBtn')?.addEventListener('click', () => { importFile(); closeModal(); });

    // Backup modal can also close on outside click
    document.getElementById('backupModal')?.addEventListener('click', e => {
        if (e.target.id === 'backupModal') closeModal();
    });

    // Snapshot row delegation
    const snapList = document.getElementById('ytd-snapshots-list');
    if (snapList) {
        snapList.addEventListener('click', async e => {
            const btn = e.target.closest('button[data-snap-action]');
            if (!btn) return;
            const key = btn.dataset.snapKey;
            if (!key) return;
            const action = btn.dataset.snapAction;
            if (action === 'restore') {
                const snap = window.YTD_Snapshots.restore(key);
                if (!snap) { UI.toast('Snapshot unreadable', { kind: 'error' }); return; }
                const ok = await UI.confirm({
                    title: 'Restore snapshot?',
                    message: `Replace current data with snapshot from ${key} (${snap.projects.length} project(s)). Your current data is also auto-snapshotted today, so you can roll back if you need.`,
                    confirmLabel: 'Restore',
                    danger: true,
                });
                if (ok) {
                    // Force-take a snapshot of "before-restore" state under today's key (overwrite)
                    window.YTD_Snapshots.autoTake(true);
                    State.replaceStore(snap);
                    window.YTD_Render.rerender();
                    UI.toast(`Restored snapshot ${key}`, { kind: 'success' });
                    closeModal();
                }
            } else if (action === 'download') {
                const snap = window.YTD_Snapshots.restore(key);
                if (!snap) return;
                const text = Storage.exportSnapshot(snap);
                downloadBlob(text, `tasky-snapshot-${key}.json`, 'application/json');
            } else if (action === 'delete') {
                const ok = await UI.confirm({
                    title: 'Delete snapshot?',
                    message: `Remove the snapshot from ${key}. This is irreversible.`,
                    confirmLabel: 'Delete',
                    danger: true,
                });
                if (ok) {
                    window.YTD_Snapshots.deleteOne(key);
                    renderSnapshotsList();
                    UI.toast('Snapshot deleted', { kind: 'success' });
                }
            }
        });
    }
}

// Render the list of saved snapshots in the backup modal.
function renderSnapshotsList() {
    const wrap = document.getElementById('ytd-snapshots-list');
    if (!wrap) return;
    const snaps = window.YTD_Snapshots?.list() || [];
    if (!snaps.length) {
        wrap.innerHTML = '<div class="ytd-snap-empty">No snapshots yet — they get created automatically each day.</div>';
        return;
    }
    const todayKey = window.YTD_Snapshots.todayKey();
    wrap.innerHTML = snaps.map(s => {
        const sizeKB = (s.size / 1024).toFixed(1);
        const isToday = s.key === todayKey;
        return `<div class="ytd-snap-row${isToday ? ' is-today' : ''}">
            <div class="ytd-snap-info">
                <strong class="ytd-snap-date">${s.key}${isToday ? ' (today)' : ''}</strong>
                <span class="ytd-snap-meta">${s.projects} project(s) · ${s.todos} task(s) · ${sizeKB} KB</span>
            </div>
            <div class="ytd-snap-actions">
                <button class="btn-secondary" data-snap-action="restore" data-snap-key="${s.key}" title="Replace current data with this snapshot">Restore</button>
                <button class="btn-secondary" data-snap-action="download" data-snap-key="${s.key}" title="Save as JSON">Download</button>
                <button class="btn-secondary" data-snap-action="delete" data-snap-key="${s.key}" title="Delete">✕</button>
            </div>
        </div>`;
    }).join('');
}

window.YTD_Backup = { attach, openModal, closeModal, exportJSON, exportCSV, exportMarkdown, importFile, checkReminder, mergeStores };
})();
