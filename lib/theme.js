// ═══════════════════════════════════════════════════════
//  theme.js — Dark / Light / Auto theme switcher
//
//  Stored as 'youtodo_theme' in localStorage. Three modes:
//    'dark'  — force dark
//    'light' — force light
//    'auto'  — follow OS via matchMedia('(prefers-color-scheme: dark)')
//
//  Applied by setting <html data-theme="dark|light"> attribute. CSS
//  reads :root[data-theme=dark] / :root[data-theme=light] for variables.
//
//  Exposes: window.YTD_Theme = { get, set, cycle, attach }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const KEY = 'youtodo_theme';
const VALID = ['dark', 'light', 'auto'];
const ICON  = { dark: '🌙', light: '☀️', auto: '🌓' };
const LABEL = { dark: 'Dark', light: 'Light', auto: 'Auto' };

let _mediaQuery = null;
let _onMediaChange = null;

function getStored() {
    const v = localStorage.getItem(KEY);
    return VALID.includes(v) ? v : 'auto';
}

function effective(mode) {
    if (mode !== 'auto') return mode;
    const m = window.matchMedia?.('(prefers-color-scheme: dark)');
    return m && m.matches ? 'dark' : 'light';
}

function apply(mode) {
    const eff = effective(mode);
    document.documentElement.setAttribute('data-theme', eff);
    // Update meta theme-color (for mobile browsers)
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.content = eff === 'dark' ? '#0f1419' : '#f5f7fb';
    // Update the theme button if present
    const btn = document.getElementById('ytd-theme-btn');
    if (btn) {
        btn.textContent = ICON[mode];
        btn.title = `Theme: ${LABEL[mode]} (click to cycle, t key)`;
    }
}

function set(mode) {
    if (!VALID.includes(mode)) mode = 'auto';
    localStorage.setItem(KEY, mode);
    apply(mode);
    // (Re)bind matchMedia listener: only useful when mode is 'auto'
    bindMediaListener(mode);
    // Notify cross-tab listeners
    window.dispatchEvent(new CustomEvent('ytd-theme-change', { detail: { mode } }));
}

function get() { return getStored(); }

// Cycle dark → light → auto → dark …
function cycle() {
    const cur = get();
    const next = cur === 'dark' ? 'light' : cur === 'light' ? 'auto' : 'dark';
    set(next);
    return next;
}

function bindMediaListener(mode) {
    if (!_mediaQuery) {
        _mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    }
    if (!_mediaQuery) return;
    if (_onMediaChange) {
        _mediaQuery.removeEventListener('change', _onMediaChange);
        _onMediaChange = null;
    }
    if (mode === 'auto') {
        _onMediaChange = () => apply('auto');
        _mediaQuery.addEventListener('change', _onMediaChange);
    }
}

// Cross-tab sync (when the user changes theme in another tab)
function onStorage(e) {
    if (e.key === KEY) apply(getStored());
}

function attach() {
    // Apply on first load BEFORE rendering — actually we already applied it
    // in the inline init below, this just wires up the button click.
    const btn = document.getElementById('ytd-theme-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            const next = cycle();
            window.YTD_UI?.toast(`Theme: ${LABEL[next]}`, { kind: 'info', timeout: 1500 });
        });
        // Refresh icon now that DOM is ready
        apply(get());
    }
    window.addEventListener('storage', onStorage);
}

// Apply IMMEDIATELY on script load (before any render) to avoid the
// flash-of-wrong-theme.
apply(get());
bindMediaListener(get());

window.YTD_Theme = { get, set, cycle, attach, effective: () => effective(get()) };
})();
