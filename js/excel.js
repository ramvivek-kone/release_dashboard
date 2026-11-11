"use strict";
/* Reads a Planner / MS Project style Excel export in the browser (SheetJS) and returns the dashboard data model.
   Nothing is uploaded anywhere: the file is parsed locally in memory. */

const FIELD_LABELS = {
  num: "Task number", outline: "Outline number", name: "Task name", start: "Start", finish: "Finish",
  duration: "Duration", owners: "Assigned to", deps: "Depends on", pct: "% complete", team: "Team",
  status: "Status / bucket", effort: "Effort", effortDone: "Effort completed", effortRemaining: "Effort remaining", notes: "Notes"
};
const FIELD_ALIASES = {
  num: ["task number", "task no", "task id", "id", "no", "number"],
  outline: ["outline number", "outline", "wbs", "wbs code"],
  name: ["name", "task name", "title", "task"],
  start: ["start", "start date", "planned start"],
  finish: ["finish", "end", "finish date", "end date", "due date", "planned finish"],
  duration: ["duration"],
  owners: ["assigned to", "owner", "owners", "resource names", "resources", "assignee"],
  deps: ["depends on", "predecessors", "predecessor", "dependencies"],
  pct: ["% complete", "percent complete", "progress", "complete"],
  team: ["team", "department"],
  status: ["bucket", "status", "state"],
  effort: ["effort", "work"],
  effortDone: ["effort completed", "work completed", "actual work"],
  effortRemaining: ["effort remaining", "remaining work"],
  notes: ["notes", "comments", "note"]
};
const REQUIRED_FIELDS = ["num", "outline", "name", "start", "finish"];

const normHeader = h => String(h == null ? "" : h).toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
const cellNum = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; const m = String(v).match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : 0; };

function serialToISO(n) { return new Date((Math.floor(n) - 25569) * 864e5).toISOString().slice(0, 10); }   // Excel serial -> yyyy-mm-dd
function toISODate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number") return v > 20000 && v < 80000 ? serialToISO(v) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s); if (isNaN(t)) return null;
  const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toPct(v) {
  if (v == null || v === "") return 0;
  let n = typeof v === "number" ? v : parseFloat(String(v).replace("%", "")) / (String(v).includes("%") ? 100 : 1);
  if (!isFinite(n)) return 0;
  if (n > 1) n = n / 100;
  return Math.max(0, Math.min(1, n));
}
const DEP_RE = /^\s*(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-]\s*\d+)\s*(d|w)?)?\s*$/i;
function parseDeps(raw) {
  const out = []; if (raw == null || raw === "") return out;
  String(raw).split(/[,;]/).forEach(part => {
    const m = part.match(DEP_RE); if (!m) return;
    let lag = m[3] ? parseInt(m[3].replace(/\s+/g, ""), 10) : 0;
    if ((m[4] || "d").toLowerCase() === "w") lag *= 5;
    out.push({ id: parseInt(m[1], 10), type: (m[2] || "FS").toUpperCase(), lag });
  });
  return out;
}

/* Find the header row: the first row (in the top 60) that contains a "task number"-like AND a "name"-like cell. */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const cells = (rows[i] || []).map(normHeader);
    if (FIELD_ALIASES.num.some(a => cells.includes(a)) && FIELD_ALIASES.name.some(a => cells.includes(a))) return i;
  }
  return -1;
}
function detectMapping(headers, override) {
  const norm = headers.map(normHeader), map = {};
  Object.keys(FIELD_ALIASES).forEach(f => {
    let idx = -1;
    if (override && override[f]) idx = norm.indexOf(normHeader(override[f]));
    if (idx < 0) for (const a of FIELD_ALIASES[f]) { idx = norm.indexOf(a); if (idx >= 0) break; }
    map[f] = idx;
  });
  return map;
}

function parseSheetRows(rows, colMap) {
  const report = { warnings: [], errors: [], tasks: 0, deps: 0, rows: rows.length, headerRow: -1, headers: [], mapping: {} };
  const hr = findHeaderRow(rows);
  if (hr < 0) { report.errors.push("Could not find the table header row (needs columns like \"Task number\" and \"Name\")."); return { report }; }
  report.headerRow = hr + 1;
  const headers = (rows[hr] || []).map(h => (h == null ? "" : String(h).trim()));
  report.headers = headers.filter(Boolean);
  const map = detectMapping(headers, colMap);
  Object.keys(map).forEach(f => { report.mapping[f] = map[f] >= 0 ? headers[map[f]] : null; });
  const missing = REQUIRED_FIELDS.filter(f => map[f] < 0);
  if (missing.length) { report.errors.push("Missing required column(s): " + missing.map(f => FIELD_LABELS[f]).join(", ") + ". Use Column mapping to point them at the right headers."); return { report }; }
  ["deps", "pct", "owners", "team"].forEach(f => { if (map[f] < 0) report.warnings.push(`Optional column "${FIELD_LABELS[f]}" not found – it will be treated as empty.`); });

  /* project meta: key/value rows above the header */
  const meta = {};
  for (let i = 0; i < hr; i++) { const r = rows[i] || []; if (r[0] != null && r[1] != null && String(r[0]).trim()) meta[normHeader(r[0])] = r[1]; }

  const g = (r, f) => (map[f] >= 0 ? r[map[f]] : null);
  const tasks = [], seen = new Set();
  let skipped = 0;
  for (let i = hr + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every(c => c == null || c === "")) continue;
    const num = parseInt(g(r, "num"), 10);
    if (!isFinite(num)) { skipped++; continue; }
    if (seen.has(num)) { report.warnings.push(`Task number ${num} appears more than once – the first one is used.`); continue; }
    const start = toISODate(g(r, "start")), finish = toISODate(g(r, "finish"));
    if (!start || !finish) { report.warnings.push(`Task #${num} "${String(g(r, "name") || "").slice(0, 40)}" has no valid start/finish date – skipped.`); continue; }
    seen.add(num);
    const outline = String(g(r, "outline") == null ? num : g(r, "outline")).trim();
    tasks.push({
      num, outline, name: String(g(r, "name") == null ? "" : g(r, "name")).trim(),
      durationDays: Math.round(cellNum(g(r, "duration"))), start, finish,
      owners: String(g(r, "owners") == null ? "" : g(r, "owners")).split(/[,;]/).map(s => s.trim()).filter(Boolean),
      deps: parseDeps(g(r, "deps")), pct: toPct(g(r, "pct")),
      team: g(r, "team") == null ? "" : String(g(r, "team")).trim(),
      status: g(r, "status") == null ? "" : String(g(r, "status")).trim(),
      effort: cellNum(g(r, "effort")), effortDone: cellNum(g(r, "effortDone")), effortRemaining: cellNum(g(r, "effortRemaining")),
      notes: String(g(r, "notes") == null ? "" : g(r, "notes")).trim()
    });
  }
  if (skipped) report.warnings.push(`${skipped} row(s) without a task number were ignored.`);
  if (!tasks.length) { report.errors.push("The table has no usable task rows."); return { report }; }

  /* validate dependencies */
  const ids = new Set(tasks.map(t => t.num));
  let unknown = 0;
  tasks.forEach(t => { const before = t.deps.length; t.deps = t.deps.filter(d => ids.has(d.id) && d.id !== t.num); unknown += before - t.deps.length; report.deps += t.deps.length; });
  if (unknown) report.warnings.push(`${unknown} dependency reference(s) point to task numbers that don't exist – ignored.`);
  /* circular dependency check */
  const byNum = {}; tasks.forEach(t => byNum[t.num] = t);
  const state = {}; let cyc = null;
  const dfs = n => { state[n] = 1; for (const d of byNum[n].deps) { if (state[d.id] === 1) { cyc = cyc || n; } else if (!state[d.id]) dfs(d.id); } state[n] = 2; };
  tasks.forEach(t => { if (!state[t.num]) dfs(t.num); });
  if (cyc) report.warnings.push(`Circular dependency detected around task #${cyc} – the loop is ignored when projecting dates.`);
  /* outline sanity */
  const outlines = new Set(tasks.map(t => t.outline));
  const orphans = tasks.filter(t => t.outline.includes(".") && !outlines.has(t.outline.slice(0, t.outline.lastIndexOf(".")))).length;
  if (orphans) report.warnings.push(`${orphans} task(s) have an outline number whose parent row is missing.`);
  report.tasks = tasks.length;

  /* project meta with fallbacks */
  const minS = tasks.reduce((a, t) => (t.start < a ? t.start : a), tasks[0].start);
  const maxF = tasks.reduce((a, t) => (t.finish > a ? t.finish : a), tasks[0].finish);
  let pct = meta["complete"] != null || meta["% complete"] != null ? toPct(meta["% complete"] != null ? meta["% complete"] : meta["complete"]) : null;
  if (pct == null) {   // duration-weighted average of leaf tasks
    const leaves = tasks.filter(t => !tasks.some(o => o.outline.startsWith(t.outline + ".")));
    const w = leaves.reduce((a, t) => a + Math.max(1, t.durationDays), 0);
    pct = w ? leaves.reduce((a, t) => a + t.pct * Math.max(1, t.durationDays), 0) / w : 0;
  }
  return {
    tasks, report,
    meta: {
      name: meta["project name"] != null ? String(meta["project name"]) : "", owner: meta["plan owner"] != null ? String(meta["plan owner"]) : "",
      start: toISODate(meta["project start date"]) || minS, finish: toISODate(meta["project finish date"]) || maxF, pct,
      exported: meta["exported on"] != null ? String(toISODate(meta["exported on"]) || meta["exported on"]) : ""
    }
  };
}

/* Entry point: ArrayBuffer of an .xlsx file  ->  { meta, tasks, goals, report, sheetNames } */
function parseWorkbookBuffer(buf, fileName, modified, opts) {
  opts = opts || {};
  let wb;
  try { wb = XLSX.read(buf, { type: "array" }); }
  catch (e) { return { report: { errors: ["This file could not be read as an Excel workbook (" + e.message + ")."], warnings: [], tasks: 0, deps: 0, headers: [], mapping: {} }, sheetNames: [] }; }
  const sheetNames = wb.SheetNames.slice();
  const toRows = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
  let sheet = opts.sheet && sheetNames.includes(opts.sheet) ? opts.sheet : null;
  if (!sheet) sheet = sheetNames.find(n => normHeader(n) === "project tasks") || sheetNames.find(n => findHeaderRow(toRows(n)) >= 0) || sheetNames[0];
  const res = parseSheetRows(toRows(sheet), opts.colMap || {});
  res.sheetNames = sheetNames; res.report.sheet = sheet;
  if (res.report.errors.length) return res;
  res.meta.sourceFile = fileName; res.meta.sourceModified = modified ? new Date(modified).toISOString() : "";
  /* optional "Project goals" sheet */
  res.goals = [];
  const gn = sheetNames.find(n => normHeader(n) === "project goals");
  if (gn) { const rows = toRows(gn); rows.slice(1).forEach(r => { if (r && r[0]) res.goals.push({ name: String(r[0]), status: r[2] || "", connected: String(r[6] || "") }); }); }
  return res;
}
