// ═══════════════════════════════════════════════════════
//  settings.js — Settings modal (sync configuration)
//
//  Gives the user a UI to:
//    - paste a GitHub Personal Access Token (gist scope)
//    - test the token (whoami)
//    - reuse an existing Tasky gist OR create a new one
//    - manually pull / push / sync now
//    - disconnect (clear local sync config)
//
//  Exposes: window.YTD_Settings = { attach, openModal, closeModal }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const Gist = window.YTD_Gist;
const Sync = window.YTD_Sync;
const UI   = window.YTD_UI;

let _root  = null;
let _stage = 'token';   // 'token' | 'connected'

// ── DOM bootstrap ─────────────────────────────────────
function ensureModal() {
    if (_root) return _root;
    _root = document.createElement('div');
    _root.className = 'modal';
    _root.id = 'taskySettingsOverlay';
    _root.innerHTML = `
      <div class="modal-content tasky-settings-modal">
        <button class="tasky-settings-close" id="taskySettingsClose" title="Close (Esc)">✕</button>
        <h3>☁️ Sync Settings</h3>
        <div id="taskySettingsBody">
          <!-- rendered dynamically -->
        </div>
      </div>
    `;
    document.body.appendChild(_root);

    _root.addEventListener('click', e => { if (e.target === _root) closeModal(); });
    _root.querySelector('#taskySettingsClose').addEventListener('click', closeModal);
    return _root;
}

// ── Render token-entry stage ──────────────────────────
function renderToken() {
    const body = _root.querySelector('#taskySettingsBody');
    body.innerHTML = `
      <div class="ytd-settings-section">
        <h3>Set up cross-device sync</h3>
        <p class="ytd-settings-help">
          Tasky syncs your data across devices through a <b>private GitHub gist</b>.
          You'll need a Personal Access Token with the <code>gist</code> scope.
        </p>

        <ol class="ytd-settings-steps">
          <li>
            Open
            <a href="https://github.com/settings/tokens/new?description=Tasky+sync&scopes=gist" target="_blank" rel="noopener">
              GitHub → New token (classic)
            </a>
          </li>
          <li>Tick <code>gist</code> scope only · ignore everything else</li>
          <li>Generate, copy the <code>ghp_…</code> string, paste below</li>
        </ol>

        <label class="ytd-settings-label">GitHub Personal Access Token</label>
        <div class="ytd-settings-tokenrow">
          <input type="password" id="taskyTokenInput" class="ytd-settings-input"
                 placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off" />
          <button class="ytd-settings-btn ytd-settings-btn-icon" id="taskyTokenShow" title="Show/hide">👁</button>
        </div>
        <p class="ytd-settings-hint">
          The token is stored only in this browser's <code>localStorage</code>. It never leaves your device except to talk to GitHub.
        </p>

        <div class="ytd-settings-actions">
          <button class="ytd-settings-btn ytd-settings-btn-primary" id="taskyTokenSave">Connect</button>
        </div>

        <div id="taskyTokenStatus" class="ytd-settings-status"></div>
      </div>
    `;

    body.querySelector('#taskyTokenShow').addEventListener('click', () => {
        const inp = body.querySelector('#taskyTokenInput');
        inp.type = (inp.type === 'password') ? 'text' : 'password';
    });
    body.querySelector('#taskyTokenSave').addEventListener('click', onConnect);
    body.querySelector('#taskyTokenInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') onConnect();
    });
}

// ── Connect: validate + find/create gist ──────────────
async function onConnect() {
    const inp = _root.querySelector('#taskyTokenInput');
    const status = _root.querySelector('#taskyTokenStatus');
    const token = (inp.value || '').trim();
    if (!token) { setStatus(status, 'Paste your token first', 'warn'); return; }
    if (!/^gh[ps]_/.test(token)) {
        setStatus(status, 'Token format looks wrong — expected ghp_… or ghs_…', 'warn');
    }

    Gist.setToken(token);
    setStatus(status, 'Verifying…', 'info');
    try {
        const u = await Gist.whoami();
        if (!u || !u.login) throw new Error('Could not fetch user info');
        setStatus(status, `Token OK · signed in as <b>${escapeHtml(u.login)}</b>. Looking for an existing Tasky gist…`, 'info');
    } catch (e) {
        Gist.setToken('');
        setStatus(status, '❌ Token rejected: ' + (e.message || 'unknown error'), 'error');
        return;
    }

    // Look for an existing tasky gist owned by this user
    try {
        const found = await Gist.findExisting();
        if (found) {
            Gist.setGistId(found.id);
            setStatus(status, `✓ Reusing existing gist <code>${found.id}</code>`, 'success');
        } else {
            // Create a new one with the current local store as initial content
            setStatus(status, 'No existing gist — creating a new private gist…', 'info');
            const created = await Gist.create(window.YTD_State.state.store);
            Gist.setGistId(created.id);
            setStatus(status, `✓ Created gist <code>${created.id}</code>`, 'success');
        }
    } catch (e) {
        setStatus(status, '❌ ' + (e.message || 'Could not set up gist'), 'error');
        return;
    }

    Sync.refreshConfiguredStatus();
    UI.toast('Sync connected', { kind: 'success' });
    // First sync now
    setTimeout(() => Sync.syncNow(), 200);
    _stage = 'connected';
    renderConnected();
}

// ── Render connected stage ────────────────────────────
function renderConnected() {
    const body = _root.querySelector('#taskySettingsBody');
    const user  = Gist.getUser() || '(unknown)';
    const gid   = Gist.getGistId();
    const last  = Sync.getLastSyncedAt();
    const lastFmt = last ? new Date(last).toLocaleString() : 'never';
    const status = Sync.getStatus();
    body.innerHTML = `
      <div class="ytd-settings-section">
        <h3>Sync is on</h3>
        <p class="ytd-settings-help">
          Your tasks sync to a private GitHub gist. New changes auto-push every 5 seconds and pull on focus / every minute.
        </p>

        <table class="ytd-settings-table">
          <tr><th>Account</th><td><b>${escapeHtml(user)}</b></td></tr>
          <tr><th>Gist</th><td><a href="https://gist.github.com/${escapeHtml(gid)}" target="_blank" rel="noopener"><code>${escapeHtml(gid)}</code></a></td></tr>
          <tr><th>Last synced</th><td>${escapeHtml(lastFmt)}</td></tr>
          <tr><th>Status</th><td><span class="ytd-sync-pill ytd-sync-${status}">${statusLabel(status)}</span></td></tr>
        </table>

        <div class="ytd-settings-actions">
          <button class="ytd-settings-btn ytd-settings-btn-primary" id="taskySyncNow">⟳ Sync Now</button>
          <button class="ytd-settings-btn" id="taskyPullOnly">⬇ Pull</button>
          <button class="ytd-settings-btn" id="taskyPushOnly">⬆ Push</button>
          <button class="ytd-settings-btn ytd-settings-btn-danger" id="taskyDisconnect">🔌 Disconnect</button>
        </div>

        <details class="ytd-settings-advanced">
          <summary>Advanced</summary>
          <div class="ytd-settings-advanced-inner">
            <button class="ytd-settings-btn" id="taskyChangeToken">Change token…</button>
            <button class="ytd-settings-btn" id="taskyForgetGist">Forget this gist</button>
            <p class="ytd-settings-hint">
              <b>Change token:</b> swap the token but keep the same gist.<br>
              <b>Forget this gist:</b> stop syncing to this gist on THIS device only — it stays on GitHub and on other devices.
            </p>
          </div>
        </details>

        <div id="taskyTokenStatus" class="ytd-settings-status"></div>
      </div>
    `;

    body.querySelector('#taskySyncNow').addEventListener('click', async () => {
        const s = body.querySelector('#taskyTokenStatus');
        setStatus(s, 'Syncing…', 'info');
        const r = await Sync.syncNow();
        if (r.ok) {
            setStatus(s, '✓ Synced', 'success');
            renderConnected();   // refresh "last synced"
        } else {
            setStatus(s, '❌ ' + (r.error?.message || r.reason || 'Sync failed'), 'error');
        }
    });
    body.querySelector('#taskyPullOnly').addEventListener('click', async () => {
        const s = body.querySelector('#taskyTokenStatus');
        setStatus(s, 'Pulling…', 'info');
        const r = await Sync.pull();
        if (r.ok) {
            const summary = (r.added || r.updated)
                ? `✓ +${r.added || 0} new · ~${r.updated || 0} updated`
                : '✓ Already up to date';
            setStatus(s, summary, 'success');
            renderConnected();
        } else {
            setStatus(s, '❌ ' + (r.error?.message || r.reason || 'Pull failed'), 'error');
        }
    });
    body.querySelector('#taskyPushOnly').addEventListener('click', async () => {
        const s = body.querySelector('#taskyTokenStatus');
        setStatus(s, 'Pushing…', 'info');
        const r = await Sync.push();
        if (r.ok) {
            setStatus(s, '✓ Pushed', 'success');
            renderConnected();
        } else {
            setStatus(s, '❌ ' + (r.error?.message || r.reason || 'Push failed'), 'error');
        }
    });
    body.querySelector('#taskyDisconnect').addEventListener('click', async () => {
        const ok = await UI.confirm({
            title: 'Disconnect sync?',
            message: 'This clears the token and gist id from this device. Your gist on GitHub is untouched, and other devices keep syncing.',
            confirmLabel: 'Disconnect',
            danger: true,
        });
        if (!ok) return;
        Gist.disconnect({ alsoToken: true });
        Sync.refreshConfiguredStatus();
        UI.toast('Sync disconnected', { kind: 'info' });
        _stage = 'token';
        renderToken();
    });
    body.querySelector('#taskyChangeToken').addEventListener('click', () => {
        Gist.setToken('');
        Sync.refreshConfiguredStatus();
        _stage = 'token';
        renderToken();
    });
    body.querySelector('#taskyForgetGist').addEventListener('click', async () => {
        const ok = await UI.confirm({
            title: 'Forget gist on this device?',
            message: 'This device will stop syncing with the current gist (the gist itself stays on GitHub). You can connect to it again later.',
            confirmLabel: 'Forget',
            danger: true,
        });
        if (!ok) return;
        Gist.disconnect({ alsoToken: false });
        Sync.refreshConfiguredStatus();
        UI.toast('Gist forgotten on this device', { kind: 'info' });
        _stage = 'token';
        renderToken();
    });
}

// ── Modal lifecycle ───────────────────────────────────
function openModal() {
    ensureModal();
    _stage = (Gist.isConfigured() && Gist.getGistId()) ? 'connected' : 'token';
    if (_stage === 'connected') renderConnected();
    else renderToken();
    _root.classList.add('show');
    setTimeout(() => {
        const inp = _root.querySelector('#taskyTokenInput');
        if (inp) inp.focus();
    }, 50);
}
function closeModal() {
    _root?.classList.remove('show');
}

function attach() {
    document.getElementById('ytd-sync-btn')?.addEventListener('click', openModal);
    // Escape closes
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _root?.classList.contains('show')) closeModal();
    });
}

// ── Helpers ───────────────────────────────────────────
function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function setStatus(el, html, kind = 'info') {
    if (!el) return;
    el.innerHTML = html;
    el.className = `ytd-settings-status ytd-settings-status-${kind}`;
}
function statusLabel(s) {
    return ({
        unconfigured: 'Not configured',
        idle:         'Idle',
        syncing:      'Syncing…',
        ok:           '✓ Synced',
        error:        '⚠ Error',
        offline:      '⚠ Offline',
    })[s] || s;
}

window.YTD_Settings = { attach, openModal, closeModal };
})();
