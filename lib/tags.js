// ═══════════════════════════════════════════════════════
//  tags.js — Tag parsing + colour assignment
//
//  Tags can be entered two ways:
//    1. Inline in the task text:    "review report #urgent #design"
//       → tags = ['urgent', 'design'], stripped from text on extract
//    2. In the full task editor's tag field (comma-separated):
//       "urgent, design"
//
//  Tag colours are deterministic from the tag string (FNV-1a hash → HSL).
//  All tags lowercase.
//
//  Exposes: window.YTD_Tags = { extract, parseList, colorFor, allTags, normalise }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

// ── Inline #tag pattern ───────────────────────────────
// Matches: #word, #multi-word, #with_underscore, #cjk字
// Stops at whitespace or punctuation. Forbid # inside a URL.
const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_\-]{1,32})/gu;

// Extract inline #tags from text. Returns:
//   { cleaned: 'task text without tags',
//     tags:    ['urgent', 'design'] (lowercased, deduped, max 8) }
function extract(text) {
    if (!text || typeof text !== 'string') return { cleaned: text || '', tags: [] };
    const tags = [];
    const seen = new Set();

    // First pass: collect tags
    let m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text)) !== null) {
        const tag = m[1].toLowerCase();
        if (!seen.has(tag) && tags.length < 8) {
            seen.add(tag);
            tags.push(tag);
        }
    }

    // Second pass: strip them from the visible text
    const cleaned = text
        .replace(TAG_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return { cleaned, tags };
}

// Parse a free-form tag string (comma / semicolon / space-separated)
// into a normalized lowercase array.
function parseList(s) {
    if (!s) return [];
    const out = [];
    const seen = new Set();
    s.split(/[,;\s]+/).forEach(raw => {
        const tag = String(raw).trim().toLowerCase().replace(/^#+/, '');
        if (!tag) return;
        if (!/^[\p{L}\p{N}_\-]{1,32}$/u.test(tag)) return;
        if (seen.has(tag)) return;
        seen.add(tag);
        out.push(tag);
    });
    return out.slice(0, 8);
}

function normalise(tag) {
    return String(tag || '').trim().toLowerCase().replace(/^#+/, '');
}

// ── Colour for a tag ──────────────────────────────────
// FNV-1a hash → HSL. Saturation/lightness fixed for consistent dark-theme look.
function fnv1a(s) {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    // extra avalanche
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}

function colorFor(tag) {
    const t = normalise(tag);
    if (!t) return { bg: 'rgba(255,255,255,0.05)', fg: '#e4e6eb', border: 'rgba(255,255,255,0.1)' };
    const h = fnv1a(t);
    const hue = h % 360;
    return {
        bg:     `hsla(${hue}, 60%, 38%, 0.28)`,
        fg:     `hsl(${hue}, 75%, 80%)`,
        border: `hsla(${hue}, 65%, 55%, 0.55)`,
    };
}

// Return all unique tags across the whole store, sorted by usage descending.
function allTags(store) {
    const counts = {};
    (store?.projects || []).forEach(p => {
        (p.todos || []).forEach(t => {
            (t.tags || []).forEach(tag => {
                counts[tag] = (counts[tag] || 0) + 1;
            });
        });
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count }));
}

window.YTD_Tags = { extract, parseList, normalise, colorFor, allTags };
})();
