// ═══════════════════════════════════════════════════════
//  help.js — Help modal with multiple tabs + What's New
//
//  Mirrors the design from Spectrum Codex / Radiant / xlsx-merger:
//    - Header has clickable version badge → opens What's New
//    - "?" / H / Esc keyboard shortcuts
//    - Multi-tab modal with table-of-contents on top
//
//  Exposes: window.YTD_Help = { open(forceKey?), close, attach }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const HELP_CONTENT = {
    overview: {
        label: '🚀 Overview',
        html: `
            <h3>Tasky — Project Task Tracker</h3>
            <p>Lightweight, fully-offline project + task tracker. All data lives in your browser's <code>localStorage</code>; no server, no signup, no tracking.</p>

            <h4>Concepts</h4>
            <ul>
                <li><b>Project</b> — a top-level container with its own task list</li>
                <li><b>Task</b> — text, status, priority, due date, tags, subtasks, history</li>
                <li><b>Dashboard</b> — overview with quick chips, tag cloud, project cards</li>
                <li><b>All Tasks</b> view (<kbd>a</kbd>) — flat cross-project list grouped by smart due-date bucket</li>
                <li><b>Calendar</b> view (<kbd>c</kbd>) — month-grid showing everything with a due date</li>
                <li><b>Stats</b> view (<kbd>s</kbd>) — heatmap, burndown, top tags, streaks, stale projects</li>
                <li><b>Project</b> view — single-project deep dive with subtask checklist</li>
                <li><b>Sync</b> (<kbd>S</kbd>) — optional cross-device sync via private GitHub gist</li>
            </ul>

            <h4>What v2.3 brings</h4>
            <ul>
                <li>📱 <b>PWA</b> (v2.3.1) — installable on phone, tablet, or desktop; works offline; see <code>DEPLOY.md</code></li>
                <li>☁️ <b>Cross-device sync</b> (v2.3.0) via a private GitHub gist — set up once with a token, all devices stay in sync (auto-pull on focus, auto-push 5s after change, manual sync button)</li>
                <li>🔀 <b>Conflict resolution</b> — per-todo last-write-wins by <code>updatedAt</code></li>
                <li>🪦 <b>Tombstones</b> — deletes survive merges so a delete on one device isn't undone by an older copy from another</li>
                <li>📵 <b>Offline-first</b> — Tasky works fully offline; sync resumes when back online</li>
            </ul>

            <h4>What v2.2 brings (Phase C)</h4>
            <ul>
                <li>📜 <b>Activity timeline</b> per task — see when status / priority / due date / text / tags changed</li>
                <li>📅 <b>Calendar view</b> with month navigation</li>
                <li>📊 <b>Stats dashboard</b> — heatmap (13 weeks), burndown (30 days), project completion bars, top tags, weekday/hour distribution, streaks, stale projects</li>
                <li>↶ <b>Stack-based undo/redo</b> — <kbd>Cmd+Z</kbd> undoes anything (up to 50 steps); <kbd>Cmd+Shift+Z</kbd> redoes</li>
                <li>📅 <b>Auto-snapshots</b> — daily background save, rolling 7 days; restore any from the Backup modal</li>
                <li>🔀 <b>Import merge mode</b> — combine an exported JSON with current data instead of overwriting</li>
            </ul>

            <h4>Earlier highlights</h4>
            <ul>
                <li>v2.1: Tags · subtasks · cross-project All Tasks view · quick chips</li>
                <li>v2.0: Inline edit · drag-drop · toast/undo · auto-save · keyboard shortcuts · modular architecture</li>
            </ul>
        `
    },

    usage: {
        label: '📋 Usage',
        html: `
            <h3>Daily workflow</h3>

            <h4>Creating</h4>
            <ul>
                <li><b>New project</b> — top-right button or <kbd>N</kbd></li>
                <li><b>New task</b> — type in the bar, press Enter. <code>#tags</code> get auto-extracted from the text</li>
                <li><b>New subtask</b> — open a task in project view, type into the "+ Add subtask" field</li>
            </ul>

            <h4>Views</h4>
            <ul>
                <li><kbd>a</kbd> — open All Tasks (smart-grouped by due date)</li>
                <li><kbd>c</kbd> — open Calendar (month grid)</li>
                <li><kbd>s</kbd> — open Stats (charts &amp; metrics)</li>
                <li>Click any project card → enter that project's deep view</li>
                <li>Esc or "← Dashboard" — back to dashboard</li>
            </ul>

            <h4>Editing</h4>
            <ul>
                <li>Click task title → inline edit; Enter saves, Esc cancels</li>
                <li>Click ✏️ → full editor with two tabs: <b>Details</b> (text/tags/status/priority/due) and <b>History</b> (audit log)</li>
                <li>Click priority badge → cycle Low → Med → High</li>
                <li>Click any tag chip anywhere → filter by that tag</li>
                <li>Drag tasks to reorder, or onto a different project card to move</li>
            </ul>

            <h4>Calendar</h4>
            <ul>
                <li>Each cell shows up to 3 tasks for that day; "+N more" expands</li>
                <li>Today's cell is highlighted blue; cells with overdue tasks have a red left border</li>
                <li>Click a task chip in a cell to open its editor directly</li>
                <li><kbd>←</kbd> / <kbd>→</kbd> navigate months; click <b>Today</b> to jump back</li>
            </ul>

            <h4>Stats</h4>
            <ul>
                <li>4 summary cards on top: 7-day completed · 30-day completed · current streak · longest streak</li>
                <li><b>Heatmap</b>: 13 weeks of daily completion (brighter = more)</li>
                <li><b>Burndown</b>: active vs completed counts over the last 30 days</li>
                <li><b>Project completion</b>: bar chart per project</li>
                <li><b>Top tags</b>: clickable chips, larger = more frequent</li>
                <li><b>Weekday / hour</b>: when do you actually finish things?</li>
                <li><b>Stale projects</b>: longest-idle 5</li>
            </ul>

            <h4>Undo / Redo / Snapshots</h4>
            <ul>
                <li>Every data change is snapshotted — <kbd>Cmd</kbd>+<kbd>Z</kbd> to undo, <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> to redo</li>
                <li>Header shows the next undo / redo label so you know what each press will do</li>
                <li>Once a day a full snapshot is saved (Backup modal → "Auto-snapshots" section). Restore brings back any of the last 7 days.</li>
                <li>Restoring a snapshot is itself an action — current state is auto-snapshotted first so you can roll back</li>
            </ul>

            <h4>Importing</h4>
            <ul>
                <li><b>Merge</b> mode — combine the imported file with your current data; same-id projects merge by-todo using the more recent <code>updatedAt</code></li>
                <li><b>Replace</b> mode — wipe current and use the imported file (legacy behaviour)</li>
                <li>Import auto-detects v1 (bare array) vs v2 (object with <code>schemaVersion</code>)</li>
            </ul>

            <h4>Cross-device sync</h4>
            <ul>
                <li>Click the <b>☁️ Sync</b> button (or press <kbd>S</kbd>) to open Sync Settings</li>
                <li>Paste a GitHub Personal Access Token with the <code>gist</code> scope; Tasky finds (or creates) a private gist named <code>tasky.json</code></li>
                <li>From then on every device that uses the same token shares the data — pulls on focus / online / every 60s, pushes 5s after each change</li>
                <li>Cloud icon in the header shows current state: ☁✓ synced · ☁⟳ syncing · ☁⊘ offline · ☁⚠ error</li>
                <li>Manual <b>⟳ Sync Now</b> button in the settings modal forces a pull+push immediately</li>
                <li>Token never leaves your browser — stored only in <code>localStorage</code></li>
            </ul>
        `
    },

    shortcuts: {
        label: '⌨️ Shortcuts',
        html: `
            <h3>Keyboard shortcuts</h3>
            <table>
                <tr><th>Key</th><th>Action</th></tr>
                <tr><td><kbd>N</kbd></td><td>New project</td></tr>
                <tr><td><kbd>n</kbd></td><td>Focus task input (or quick-add on dashboard)</td></tr>
                <tr><td><kbd>a</kbd></td><td>Open All Tasks view</td></tr>
                <tr><td><kbd>c</kbd></td><td>Open Calendar view</td></tr>
                <tr><td><kbd>s</kbd></td><td>Open Stats view</td></tr>
                <tr><td><kbd>S</kbd></td><td>Open Sync settings</td></tr>
                <tr><td><kbd>t</kbd></td><td>Cycle theme: Dark → Light → Auto → Dark</td></tr>
                <tr><td><kbd>/</kbd></td><td>Focus global search</td></tr>
                <tr><td><kbd>1</kbd> – <kbd>5</kbd></td><td>Filter All / Active / Completed / Today / Overdue (project &amp; All Tasks views)</td></tr>
                <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>Navigate months in Calendar</td></tr>
                <tr><td><kbd>?</kbd> / <kbd>H</kbd></td><td>Open / close this help</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Close modal · clear search · back to dashboard</td></tr>
                <tr><td><kbd>Cmd</kbd>+<kbd>Z</kbd></td><td>Undo (50-step stack)</td></tr>
                <tr><td><kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> · <kbd>Cmd</kbd>+<kbd>Y</kbd></td><td>Redo</td></tr>
                <tr><td><kbd>Enter</kbd></td><td>Confirm input / Add task / Save inline edit / Add subtask</td></tr>
                <tr><td><kbd>Cmd</kbd>+<kbd>Enter</kbd></td><td>Save in full task editor</td></tr>
            </table>
            <div class="ytd-help-tip">
                <div class="ytd-help-tip-title">Tip</div>
                Shortcuts are disabled while typing in inputs. The exception is Esc — that always works.
            </div>
        `
    },

    backup: {
        label: '💾 Backup',
        html: `
            <h3>Backup &amp; export</h3>
            <p>Click the <b>💾 Backup</b> button in the top bar to open the export panel.</p>

            <h4>Formats</h4>
            <ul>
                <li><b>JSON</b> — full snapshot, exactly what's in localStorage. Use this to restore later via Import.</li>
                <li><b>CSV</b> — flat row-per-task table. Open in Excel / Google Sheets for analysis.</li>
                <li><b>Markdown</b> — formatted report. Great for annual reviews or sharing with a manager.</li>
            </ul>

            <h4>Auto-reminder</h4>
            <p>If you haven't backed up in 7+ days, the tool nudges you with a toast.</p>

            <h4>Importing</h4>
            <p>Pick a previously-exported JSON file. The tool auto-detects v1 / v2 schemas and migrates v1 if needed. Currently <b>replace mode only</b> — merge mode is on the roadmap.</p>

            <div class="ytd-help-tip">
                <div class="ytd-help-tip-title">⚠ Browser data is fragile</div>
                Browser data can be cleared by privacy tools, profile resets, or "clear site data" actions.
                On iOS, an installed PWA's localStorage may be evicted if the app isn't launched for ~7 days.
                Two ways to stay safe: (1) keep regular JSON backups, (2) set up <b>cross-device sync</b> (☁️ button) — your tasks live in a private GitHub gist as a durable backup.
            </div>
        `
    },

    whatsnew: {
        label: '✨ What\'s New',
        html: `
            <h3>Tasky — Version History</h3>

            <div class="ytd-changelog-entry">
                <span class="ytd-changelog-version">v2.3.1</span><span class="ytd-changelog-date">— PWA · install on phone &amp; desktop</span>
                <ul>
                    <li><b>📱 Installable</b> — once Tasky is hosted on an HTTPS URL, you can <i>Add to Home Screen</i> on iOS, <i>Install app</i> on Android, or click the install icon in Chrome / Edge on desktop</li>
                    <li><b>📵 Offline</b> — service worker caches the app shell, so Tasky launches and runs even with no network. Local edits queue up; sync resumes automatically when online</li>
                    <li><b>📐 Mobile UI</b> — header reflows to a tidy two-row layout under 540px wide, 44px touch targets, safe-area-inset support for notches and gesture bars</li>
                    <li><b>🪪 Icons</b> — Tasky-themed clipboard glyph in 192 / 512 / maskable / 180 (Apple Touch) / 32 (favicon) sizes, regenerable from <code>icons/_gen_icons.py</code></li>
                    <li><b>🔄 Update toast</b> — when a new version is deployed, Tasky shows a "Reload to update" toast on next launch</li>
                    <li>See <code>DEPLOY.md</code> in the project folder for three deployment options (Netlify Drop / GitHub Pages / Cloudflare Pages)</li>
                </ul>
            </div>

            <div class="ytd-changelog-entry">
                <span class="ytd-changelog-version">v2.3.0</span><span class="ytd-changelog-date">— Cross-device sync</span>
                <ul>
                    <li><b>☁️ GitHub Gist sync</b> — keep your tasks in lock-step across desktop, laptop, phone</li>
                    <li>Set up via the new <b>☁️ Sync</b> header button (or <kbd>S</kbd>) — paste a Personal Access Token with the <code>gist</code> scope, Tasky handles the rest (finds an existing tasky.json gist, or creates a private one)</li>
                    <li><b>Auto pull</b> on window focus, on coming back online, every 60s</li>
                    <li><b>Auto push</b> 5 seconds after any local change (debounced)</li>
                    <li><b>Conflict resolution</b> — per-todo last-write-wins using the existing <code>updatedAt</code> timestamps; the <code>mergeStores</code> logic from import is reused</li>
                    <li><b>Tombstones</b> — deletes are recorded as <code>{id: deletedAt}</code> in <code>store.tombstones</code> so a delete on device A is not undone by device B pushing an older copy. Tombstones older than 90 days are pruned automatically</li>
                    <li><b>Offline-first</b> — Tasky works fully without network. Sync resumes the moment you're back online</li>
                    <li>Header indicator: ☁✓ synced · ☁⟳ syncing · ☁⊘ offline · ☁⚠ error</li>
                    <li>Token stored <i>only</i> in this browser's <code>localStorage</code> — never sent anywhere except api.github.com</li>
                </ul>
            </div>

            <div class="ytd-changelog-entry">
                <span class="ytd-changelog-version">v2.2.2</span><span class="ytd-changelog-date">— Rebrand to <b>Tasky</b></span>
                <ul>
                    <li>Renamed from <i>"You To Do"</i> to <b>Tasky</b> — short, friendly, and the trailing <i>-sky</i> winks at the author</li>
                    <li>Updated page title, header, welcome screen, help, and export filenames (<code>tasky-backup-*.json</code> etc.)</li>
                    <li><b>Your data is safe</b> — internal storage keys are unchanged so existing tasks, snapshots, and theme preference all carry over</li>
                </ul>
            </div>

            <div class="ytd-changelog-entry">
                <span class="ytd-changelog-version">v2.2.1</span><span class="ytd-changelog-date">— Theme switcher</span>
                <ul>
                    <li><b>🌓 Dark / Light / Auto theme</b> — header has a 🌙 / ☀️ / 🌓 button, click to cycle</li>
                    <li><b>Auto</b> follows the OS preference (<code>prefers-color-scheme</code>) and updates live when you change OS theme</li>
                    <li><b>Cross-tab sync</b> — change theme in one tab, all open tabs update via <code>storage</code> event</li>
                    <li>No flash-of-wrong-theme — theme.js loads in <code>&lt;head&gt;</code> so the body's first paint is correct</li>
                    <li><kbd>t</kbd> shortcut to cycle</li>
                </ul>
            </div>

            <div class="ytd-changelog-entry">
                <span class="ytd-changelog-version">v2.2</span><span class="ytd-changelog-date">— Phase C · Visualisation &amp; long-term management</span>
                <ul>
                    <li><b>📜 Activity timeline</b> per task — open the editor's History tab to see when each field changed (status / priority / due date / text / tags / subtasks / project moves). Up to 200 events per task; oldest dropped first.</li>
                    <li><b>📅 Calendar view</b> (<kbd>c</kbd>) — month grid with task chips per day, today highlighted blue, overdue cells get a red border. <kbd>←</kbd> / <kbd>→</kbd> to navigate. Click any chip to open the task editor.</li>
                    <li><b>📊 Stats view</b> (<kbd>s</kbd>) — 4 summary cards (7-day · 30-day · current streak · longest streak) plus 7 widgets:
                        <ul>
                            <li>13-week activity heatmap (GitHub-style)</li>
                            <li>30-day burndown line chart (active vs completed)</li>
                            <li>Project completion bars</li>
                            <li>Top tags cloud (clickable)</li>
                            <li>Completion-by-weekday distribution</li>
                            <li>Completion-by-hour distribution</li>
                            <li>Stale projects (longest idle)</li>
                        </ul>
                    </li>
                    <li><b>↶ Stack-based undo/redo</b> — every state change snapshots the store; <kbd>Cmd</kbd>+<kbd>Z</kbd> undoes anything (50-step ring buffer), <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Cmd</kbd>+<kbd>Y</kbd> redoes</li>
                    <li><b>↶ ↷ indicator</b> in header shows next undo / redo label</li>
                    <li><b>📅 Auto-snapshots</b> — daily background save; rolling 7 days; surfaced in the Backup modal under "Auto-snapshots". Restore brings back any day's state (current data is auto-snapshotted again before restore).</li>
                    <li><b>🔀 Import merge mode</b> — Replace was the only option; now choose <b>Merge</b> to combine an exported file with current data. Same-id projects merge by-todo using the more recent <code>updatedAt</code>; report shows added / updated / skipped counts.</li>
                    <li><b>Dashboard chips</b> for Calendar &amp; Stats — purple-tinted to distinguish from filter chips</li>
                </ul>
            </div>

            <div class="ytd-changelog-entry">
                <span class="ytd-changelog-version">v2.1</span><span class="ytd-changelog-date">— Phase B · Tags, Subtasks, All Tasks view</span>
                <ul>
                    <li>Tags (inline <code>#tag</code> + editor field) with deterministic colours</li>
                    <li>Subtasks with inline checklist + progress badge</li>
                    <li>All Tasks view with smart due-date buckets</li>
                    <li>Quick filter chips on dashboard, tag cloud</li>
                    <li><code>#tag</code> exact-match search syntax</li>
                </ul>
            </div>

            <div class="ytd-changelog-entry">
                <span class="ytd-changelog-version">v2.0</span><span class="ytd-changelog-date">— Phase A · Foundation rebuild</span>
                <ul>
                    <li>Modular architecture (lib/storage, lib/state, lib/render, lib/actions, lib/ui-utils, lib/modals, lib/keyboard, lib/help, lib/backup)</li>
                    <li>Schema v2 with auto-migration from v1</li>
                    <li>Inline editing · drag-and-drop · toast notifications · auto-save indicator · keyboard shortcuts · single-step undo · help modal</li>
                </ul>
            </div>

            <div class="ytd-changelog-entry">
                <span class="ytd-changelog-version">v1.0</span><span class="ytd-changelog-date">— Initial release</span>
                <ul>
                    <li>Project + task data model with priority and due date</li>
                    <li>Dashboard view with project cards</li>
                    <li>JSON / CSV / Markdown export + JSON import</li>
                    <li>localStorage persistence</li>
                </ul>
            </div>
        `
    },
};

let _attached = false;

function attach() {
    if (_attached) return;
    _attached = true;

    const overlay  = document.getElementById('ytd-help-overlay');
    const tabsBar  = document.getElementById('ytd-help-tabs');
    const bodyEl   = document.getElementById('ytd-help-body');
    const titleEl  = document.getElementById('ytd-help-title');
    const closeBtn = document.getElementById('ytd-help-close');
    const helpBtn  = document.getElementById('ytd-help-btn');
    const verBadge = document.getElementById('ytd-version-badge');
    if (!overlay) return;

    const tabKeys = ['overview', 'usage', 'shortcuts', 'backup', 'whatsnew'];
    tabsBar.innerHTML = tabKeys.map(k => {
        const cls = 'ytd-help-tab' + (k === 'whatsnew' ? ' ytd-whatsnew-tab' : '');
        return `<button class="${cls}" data-help-key="${k}">${HELP_CONTENT[k].label}</button>`;
    }).join('');

    function showKey(key) {
        const entry = HELP_CONTENT[key];
        if (!entry) return;
        bodyEl.innerHTML = entry.html;
        bodyEl.scrollTop = 0;
        titleEl.textContent = key === 'whatsnew' ? "What's New" : 'Help — ' + entry.label;
        tabsBar.querySelectorAll('.ytd-help-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.helpKey === key)
        );
    }

    function open(forceKey) {
        showKey(forceKey || 'overview');
        overlay.hidden = false;
    }
    function close() { overlay.hidden = true; }

    helpBtn.addEventListener('click', () => open());
    closeBtn.addEventListener('click', close);
    if (verBadge) verBadge.addEventListener('click', () => open('whatsnew'));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    tabsBar.addEventListener('click', e => {
        const b = e.target.closest('.ytd-help-tab');
        if (b) showKey(b.dataset.helpKey);
    });

    window.YTD_Help.open  = open;
    window.YTD_Help.close = close;
}

window.YTD_Help = { attach, open: () => {}, close: () => {} };
})();
