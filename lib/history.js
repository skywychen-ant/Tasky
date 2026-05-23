// ═══════════════════════════════════════════════════════
//  history.js — Undo/Redo stack
//
//  We don't try to record arbitrary diffs. Instead we snapshot the entire
//  store before each mutation and let undo restore the previous snapshot.
//  This is brutal but reliable; data is small (< few MB) so even 50
//  snapshots is OK.
//
//  Stack semantics:
//   - push(label): take a snapshot; capacity 50; clear redo
//   - undo(): if undo stack >= 2, push current to redo, pop one, restore
//   - redo(): pop from redo, push back to undo, restore
//
//  We push the FIRST snapshot on init so undo back to "initial" works.
//
//  Exposes: window.YTD_History = { push, undo, redo, attach, canUndo, canRedo, labels }
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

const State = window.YTD_State;

const CAP = 50;
const undoStack = [];   // array of { label, json, ts }
const redoStack = [];

let _attached  = false;
let _suspended = false;   // when true, push() is a no-op (used during undo/redo apply)

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// Push a new snapshot. label is a human-readable description.
function push(label) {
    if (_suspended) return;
    const snap = {
        label: label || 'change',
        json:  JSON.stringify(State.state.store),
        ts:    Date.now(),
    };
    // Don't push if current store is identical to top (e.g. no-op update)
    const top = undoStack[undoStack.length - 1];
    if (top && top.json === snap.json) return;
    undoStack.push(snap);
    if (undoStack.length > CAP) undoStack.shift();
    // Clear redo stack on new action
    redoStack.length = 0;
    _emit();
}

// Undo: replace store with previous snapshot.
function undo() {
    if (undoStack.length < 2) return false;
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    _suspended = true;
    try {
        const restored = JSON.parse(prev.json);
        State.replaceStore(restored);
    } finally {
        _suspended = false;
    }
    _emit();
    return current.label;
}

function redo() {
    if (redoStack.length === 0) return false;
    const next = redoStack.pop();
    undoStack.push(next);
    _suspended = true;
    try {
        const restored = JSON.parse(next.json);
        State.replaceStore(restored);
    } finally {
        _suspended = false;
    }
    _emit();
    return next.label;
}

function canUndo() { return undoStack.length >= 2; }
function canRedo() { return redoStack.length > 0; }

// Most recent labels for tooltip display
function labels() {
    return {
        undo: canUndo() ? undoStack[undoStack.length - 1].label : null,
        redo: canRedo() ? redoStack[redoStack.length - 1].label : null,
    };
}

// Pub/sub for the indicator widget
const subs = new Set();
function subscribe(cb) { subs.add(cb); return () => subs.delete(cb); }
function _emit() { subs.forEach(cb => { try { cb(); } catch (e) { console.error(e); } }); }

// Attach: subscribe to State change events and push snapshots automatically.
function attach() {
    if (_attached) return;
    _attached = true;

    // Initial baseline snapshot
    push('initial');

    State.subscribe(ev => {
        if (ev.type !== 'change') return;
        if (_suspended) return;
        // Don't snapshot the synthetic "replace-store" event we emit during
        // an undo/redo apply.
        if (ev.reason === 'replace-store') return;
        // Friendly label per reason
        const labelMap = {
            'add-project':       'New project',
            'update-project':    'Edit project',
            'delete-project':    'Delete project',
            'undo-delete-project': 'Restore project',
            'add-todo':          'New task',
            'update-todo':       'Edit task',
            'delete-todo':       'Delete task',
            'undo-delete-todo':  'Restore task',
            'reorder-todos':     'Reorder tasks',
            'move-todo':         'Move task',
        };
        push(labelMap[ev.reason] || ev.reason || 'change');
    });
}

window.YTD_History = { push, undo, redo, canUndo, canRedo, labels, attach, subscribe };
})();
