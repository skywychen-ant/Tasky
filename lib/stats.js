// ═══════════════════════════════════════════════════════
//  stats.js — Compute aggregates for the Stats view
//
//  All functions are pure — take a store, return numbers.
//  The view module reads the result and renders SVG charts.
//
//  Exposes: window.YTD_Stats
// ═══════════════════════════════════════════════════════
(function () {
'use strict';

// Helpers ────────────────────────────────────────────────
const DAY_MS = 86400000;

function dateKey(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

// ── Activity heatmap data ────────────────────────────
//
// Build a 365-day calendar grid keyed by date string. Each entry has:
//   { date: 'YYYY-MM-DD', completed, created, weekday: 0..6 }
function activityHeatmap(store, days = 90) {
    const today = startOfDay(new Date());
    const out = [];
    const counts = {};   // 'YYYY-MM-DD' → { completed, created }
    (store.projects || []).forEach(p => {
        (p.todos || []).forEach(t => {
            if (t.createdAt) {
                const k = dateKey(startOfDay(new Date(t.createdAt)));
                (counts[k] ??= { completed: 0, created: 0 }).created++;
            }
            if (t.completedAt) {
                const k = dateKey(startOfDay(new Date(t.completedAt)));
                (counts[k] ??= { completed: 0, created: 0 }).completed++;
            }
        });
    });
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * DAY_MS);
        const k = dateKey(d);
        const cell = counts[k] || { completed: 0, created: 0 };
        out.push({
            date: k,
            completed: cell.completed,
            created:   cell.created,
            weekday:   d.getDay(),
        });
    }
    return out;
}

// ── Burndown / burn-up: per-day active count over last N days ──
//
// On each day at 00:00 we look at: how many todos exist whose createdAt <= D
// AND (completedAt > D OR completedAt missing). That's the active count.
function burndown(store, days = 30) {
    const today = startOfDay(new Date());
    const series = [];
    const allTodos = [];
    (store.projects || []).forEach(p => (p.todos || []).forEach(t => allTodos.push(t)));

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * DAY_MS);
        // Snapshot at end-of-day
        const cutoff = new Date(d.getTime() + DAY_MS);
        let active = 0, completed = 0;
        for (const t of allTodos) {
            if (!t.createdAt) continue;
            const created = new Date(t.createdAt);
            if (created >= cutoff) continue;   // not yet existed
            if (t.completedAt) {
                const cAt = new Date(t.completedAt);
                if (cAt < cutoff) { completed++; continue; }
            }
            active++;
        }
        series.push({ date: dateKey(d), active, completed });
    }
    return series;
}

// ── Completion by project (current state) ─────────────
function projectCompletion(store) {
    return (store.projects || []).map(p => {
        const total = p.todos.length;
        const done  = p.todos.filter(t => t.status === 'done').length;
        return {
            id:    p.id,
            name:  p.name,
            total,
            done,
            active: total - done,
            pct:    total > 0 ? Math.round((done / total) * 100) : 0,
        };
    }).sort((a, b) => b.total - a.total);
}

// ── Top tags (active tasks only) ──────────────────────
function topTags(store, limit = 10) {
    const counts = {};
    (store.projects || []).forEach(p => {
        (p.todos || []).forEach(t => {
            (t.tags || []).forEach(tag => {
                counts[tag] = (counts[tag] || 0) + 1;
            });
        });
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag, count]) => ({ tag, count }));
}

// ── Completion by weekday / hour ──────────────────────
function completionByWeekday(store) {
    const w = [0, 0, 0, 0, 0, 0, 0];   // Sun..Sat
    (store.projects || []).forEach(p => {
        (p.todos || []).forEach(t => {
            if (t.completedAt) {
                const d = new Date(t.completedAt);
                if (!isNaN(d.getTime())) w[d.getDay()]++;
            }
        });
    });
    return w;
}

function completionByHour(store) {
    const h = new Array(24).fill(0);
    (store.projects || []).forEach(p => {
        (p.todos || []).forEach(t => {
            if (t.completedAt) {
                const d = new Date(t.completedAt);
                if (!isNaN(d.getTime())) h[d.getHours()]++;
            }
        });
    });
    return h;
}

// ── Streak / milestones ───────────────────────────────
//
// Longest streak of consecutive days with at least 1 completion in the last
// 365 days; current streak from today backwards.
function streaks(store, days = 365) {
    const today = startOfDay(new Date());
    const completedDays = new Set();
    (store.projects || []).forEach(p => {
        (p.todos || []).forEach(t => {
            if (t.completedAt) {
                completedDays.add(dateKey(startOfDay(new Date(t.completedAt))));
            }
        });
    });
    let longest = 0, current = 0;
    let runningCurrent = 0, hasCurrent = true;
    for (let i = 0; i < days; i++) {
        const d = new Date(today.getTime() - i * DAY_MS);
        const k = dateKey(d);
        if (completedDays.has(k)) {
            longest = Math.max(longest, ++runningCurrent);
            if (hasCurrent) current = runningCurrent;
        } else {
            hasCurrent = false;
            runningCurrent = 0;
        }
    }
    return { longest, current };
}

// ── 7-day / 30-day completed counts ───────────────────
function recentCompletions(store) {
    const now = Date.now();
    let last7 = 0, last30 = 0;
    (store.projects || []).forEach(p => {
        (p.todos || []).forEach(t => {
            if (!t.completedAt) return;
            const age = (now - new Date(t.completedAt).getTime()) / DAY_MS;
            if (age < 7)  last7++;
            if (age < 30) last30++;
        });
    });
    return { last7, last30 };
}

// ── Stale projects ────────────────────────────────────
function staleProjects(store) {
    const now = Date.now();
    return (store.projects || []).map(p => {
        const updated = new Date(p.updatedAt || p.createdAt).getTime();
        return { id: p.id, name: p.name, daysIdle: Math.floor((now - updated) / DAY_MS) };
    }).sort((a, b) => b.daysIdle - a.daysIdle).slice(0, 5);
}

window.YTD_Stats = {
    activityHeatmap,
    burndown,
    projectCompletion,
    topTags,
    completionByWeekday,
    completionByHour,
    streaks,
    recentCompletions,
    staleProjects,
};
})();
