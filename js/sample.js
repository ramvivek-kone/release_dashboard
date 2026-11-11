"use strict";
/* Built-in demo plan (synthetic, not real project data). Dates are generated relative to today so the demo always shows
   overdue, impacted and upcoming work. Replace it any time by loading your own Excel file in Settings. */
function buildSampleData() {
  const base = nextWd(todayDay());
  const at = off => fmtISO(addWd(base, off));
  const phases = [
    { k: "1", name: "Requirements & Design", team: "Platform" },
    { k: "2", name: "Core Development",      team: "Engineering" },
    { k: "3", name: "Validation",            team: "Quality" },
    { k: "4", name: "Documentation & Training", team: "Enablement" },
    { k: "5", name: "Go-Live",               team: "Project" }
  ];
  // k = outline, s/f = working-day offsets from today, p = % complete, d = predecessors (outline keys, finish-to-start)
  const leaf = [
    { k: "1.1", n: "Collect requirements",   s: -40, f: -32, p: 1,    o: ["A. Rivera"] },
    { k: "1.2", n: "Solution architecture",  s: -31, f: -22, p: 1,    o: ["J. Okafor", "L. Chen"], d: ["1.1"] },
    { k: "1.3", n: "Design sign-off",        s: -21, f: -18, p: 1,    o: ["A. Rivera"], d: ["1.2"] },
    { k: "2.1", n: "Core module build",      s: -17, f: 4,   p: 0.8,  o: ["L. Chen", "M. Patel"], d: ["1.3"] },
    { k: "2.2", n: "API integration",        s: -15, f: -3,  p: 0.5,  o: ["M. Patel"], d: ["1.3"], note: "Waiting for vendor sandbox access." },
    { k: "2.3", n: "User interface",         s: -14, f: 6,   p: 0.55, o: ["S. Novak", "T. Silva"], d: ["1.3"] },
    { k: "3.1", n: "Integration testing",    s: -2,  f: 8,   p: 0,    o: ["R. Haddad"], d: ["2.2"] },
    { k: "3.2", n: "User acceptance test",   s: 9,   f: 16,  p: 0,    o: ["R. Haddad", "E. Kim"], d: ["3.1", "2.3"] },
    { k: "3.3", n: "Performance test",       s: 5,   f: 12,  p: 0,    o: ["E. Kim"], d: ["2.1"] },
    { k: "4.1", n: "User guide",             s: -10, f: 5,   p: 0.4,  o: ["D. Moreau"], d: ["1.3"] },
    { k: "4.2", n: "Training sessions",      s: 6,   f: 13,  p: 0,    o: ["D. Moreau", "P. Alvarez"], d: ["4.1"] },
    { k: "5.1", n: "Go-live readiness review", s: 17, f: 18,  p: 0,    o: ["A. Rivera"], d: ["3.2", "3.3", "4.2"] },
    { k: "5.2", n: "System Go-Live",         s: 19,  f: 19,  p: 0,    o: ["A. Rivera"], d: ["5.1"] }
  ];
  const tasks = []; let num = 0; const numOf = {};
  phases.forEach(ph => {
    const kids = leaf.filter(l => l.k.split(".")[0] === ph.k);
    const row = { num: ++num, outline: ph.k, name: ph.name, owners: [], deps: [], team: ph.team, status: "", effort: 0, effortDone: 0, effortRemaining: 0, notes: "", durationDays: 0,
      start: at(Math.min(...kids.map(k => k.s))), finish: at(Math.max(...kids.map(k => k.f))), pct: kids.reduce((a, k) => a + k.p, 0) / kids.length };
    numOf[ph.k] = row.num; tasks.push(row);
    kids.forEach(l => {
      const t = { num: ++num, outline: l.k, name: l.n, owners: l.o, deps: [], team: "", status: "", effort: 0, effortDone: 0, effortRemaining: 0, notes: l.note || "", durationDays: l.f - l.s + 1,
        start: at(l.s), finish: at(l.f), pct: l.p, _d: l.d || [] };
      numOf[l.k] = t.num; tasks.push(t);
    });
  });
  tasks.forEach(t => { t.deps = (t._d || []).map(k => ({ id: numOf[k], type: "FS", lag: 0 })); delete t._d; });
  const first = tasks.reduce((a, t) => (t.start < a ? t.start : a), tasks[0].start), last = tasks.reduce((a, t) => (t.finish > a ? t.finish : a), tasks[0].finish);
  const leaves = tasks.filter(t => /\./.test(t.outline));
  return {
    tasks, goals: [],
    meta: { name: "Sample release (demo data)", owner: "", start: first, finish: last, pct: leaves.reduce((a, t) => a + t.pct, 0) / leaves.length,
      exported: "", sourceFile: "Sample data", sourceModified: "" }
  };
}
