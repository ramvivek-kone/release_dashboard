"use strict";
/* Settings store (browser localStorage) + the Settings page + Excel file loading / linking. No server, no database. */

const LS_KEY = "kone.rd.settings.v1";
const App = { buffer: null, name: "", mtime: 0, size: 0, handle: null, sheet: "", report: null, sheetNames: [], source: "sample", loadedAt: null, linkError: "" };

function mergeSettings(base, s) {
  const out = JSON.parse(JSON.stringify(base));
  if (!s || typeof s !== "object") return out;
  Object.keys(out).forEach(k => {
    if (!(k in s)) return;
    if (k === "scenes" && s.scenes && typeof s.scenes === "object") out.scenes = Object.assign(out.scenes, s.scenes);
    else if (k === "colMap" && s.colMap && typeof s.colMap === "object") out.colMap = s.colMap;
    else if (k === "milestones" && Array.isArray(s.milestones)) out.milestones = s.milestones.map(m => ({ code: String(m.code || ""), label: String(m.label || ""), date: String(m.date || ""), auto: !!m.auto }));
    else if (k === "weekend" && Array.isArray(s.weekend)) out.weekend = s.weekend.map(Number).filter(n => n >= 0 && n <= 6);
    else if (typeof out[k] === typeof s[k]) out[k] = s[k];
  });
  return out;
}
function sanitizeSettings(s) {
  s.sceneSeconds = clamp(s.sceneSeconds, 3, 300, 15);
  s.refreshSeconds = clamp(s.refreshSeconds, 5, 3600, 30);
  s.maxRisks = Math.round(clamp(s.maxRisks, 0, 10, 5));
  s.behindPct = clamp(s.behindPct, 0, 100, 25);
  if (!["present", "interact"].includes(s.defaultMode)) s.defaultMode = "present";
  if (!["best", "pace"].includes(s.defaultScenario)) s.defaultScenario = "best";
  if (s.todayOverride && !isISO(s.todayOverride)) s.todayOverride = "";
  if (!s.weekend.length || s.weekend.length >= 7) s.weekend = [0, 6];
  s.milestones = s.milestones.filter(m => m.code.trim() && (m.auto || isISO(m.date)));
  return s;
}
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { s = {}; }
  return sanitizeSettings(mergeSettings(DEFAULT_SETTINGS, s));
}
function persistSettings() { try { localStorage.setItem(LS_KEY, JSON.stringify(SETTINGS)); } catch (e) { toast("Could not save settings in this browser (storage blocked).", true); } }
function applySettingsEffects() {
  WEEKEND = new Set(SETTINGS.weekend);
  const lg = $("logo"); if (lg) lg.src = SETTINGS.logo || "assets/kone-logo.png";
}
let SETTINGS = loadSettings();

/* ---------- small helpers ---------- */
let toastTimer = null;
function toast(msg, bad) {
  const t = $("toast"); t.textContent = msg; t.className = "on" + (bad ? " bad" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ""; }, bad ? 6000 : 3200);
}

/* ---------- Excel loading ---------- */
async function loadFromFile(file, handle) {
  try {
    App.buffer = await file.arrayBuffer();
    App.name = file.name; App.mtime = file.lastModified; App.size = file.size; App.handle = handle || null; App.sheet = App.sheet || "";
    return applyBuffer(true);
  } catch (e) { toast("Could not read the file: " + e.message, true); return false; }
}
function applyBuffer(announce) {
  const res = parseWorkbookBuffer(App.buffer, App.name, App.mtime, { sheet: App.sheet, colMap: SETTINGS.colMap });
  App.report = res.report; App.sheetNames = res.sheetNames || [];
  if (res.report.errors.length) { toast("Could not use this file: " + res.report.errors[0], true); refreshSourcePanel(); return false; }
  App.sheet = res.report.sheet; App.source = "file"; App.loadedAt = new Date();
  DATA = res; UI.sel = null; render(); refreshSourcePanel();
  if (announce) toast(`Loaded ${res.report.tasks} tasks from ${App.name}` + (res.report.warnings.length ? ` (${res.report.warnings.length} warning${res.report.warnings.length === 1 ? "" : "s"})` : ""));
  return true;
}
function useSample() {
  App.buffer = null; App.name = ""; App.handle = null; App.report = null; App.sheetNames = []; App.sheet = ""; App.source = "sample"; App.linkError = "";
  DATA = buildSampleData(); UI.sel = null; render(); refreshSourcePanel();
}
async function linkFile() {
  if (!window.showOpenFilePicker) { toast("Linking needs Microsoft Edge or Google Chrome. Use Browse instead.", true); return; }
  try {
    const [h] = await window.showOpenFilePicker({ multiple: false, types: [{ description: "Excel workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xlsm"], "application/vnd.ms-excel": [".xls"] } }] });
    const f = await h.getFile(); App.sheet = "";
    if (await loadFromFile(f, h)) toast(`Linked – the file is re-read every ${SETTINGS.refreshSeconds} s. Save in Excel and the dashboard updates.`);
  } catch (e) { if (e.name !== "AbortError") toast("Could not link the file: " + e.message, true); }
}
function unlinkFile() { App.handle = null; App.linkError = ""; refreshSourcePanel(); updateStatusLine(); toast("Unlinked. The current data stays until you load another file."); }
async function pollLinked() {
  if (!App.handle) return;
  try {
    const f = await App.handle.getFile();
    if (f.lastModified !== App.mtime || f.size !== App.size) await loadFromFile(f, App.handle);
    if (App.linkError) { App.linkError = ""; updateStatusLine(); }
  } catch (e) { App.linkError = e.message || "file not readable"; updateStatusLine(); }
}

/* ---------- Settings page ---------- */
const DOW = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];

function milestoneRow(m) {
  return `<tr><td><input type="text" class="m-code" value="${esc(m.code)}" placeholder="e.g. KR1"></td>
    <td><input type="text" class="m-label" value="${esc(m.label)}" placeholder="description"></td>
    <td><input type="date" class="m-date" value="${esc(m.date)}" ${m.auto ? "disabled" : ""}></td>
    <td style="text-align:center"><input type="checkbox" class="m-auto" ${m.auto ? "checked" : ""} title="Use the Go-Live date from the plan"></td>
    <td><button class="btn danger m-del" type="button" style="padding:.1rem .5rem">✕</button></td></tr>`;
}
function wireMilestoneRow(tr) {
  tr.querySelector(".m-auto").onchange = e => { tr.querySelector(".m-date").disabled = e.target.checked; };
  tr.querySelector(".m-del").onclick = () => tr.remove();
}
function openSettings() {
  const S = SETTINGS, sc = S.scenes;
  const root = $("settings");
  root.innerHTML = `<div class="sheet" role="dialog" aria-label="Settings">
    <header class="sh"><h2>⚙ Settings</h2><button id="sClose" title="Close (Esc)">✕</button></header>
    <div class="sbody">
      <div class="scard wide"><h3>📄 Data source <span>Excel is read inside this browser. Nothing is uploaded anywhere.</span></h3>
        <div class="srcline" id="sSrc"></div>
        <div class="dropzone" id="sDrop">Drag &amp; drop an Excel file here, or <button class="btn primary" id="sBrowse" type="button">Browse…</button>
          <input type="file" id="sFile" accept=".xlsx,.xlsm,.xlsb,.xls" hidden></div>
        <div class="btnrow"><button class="btn" id="sLink" type="button">🔗 Link file (live re-read)</button><button class="btn danger" id="sUnlink" type="button">Unlink</button><button class="btn" id="sSample" type="button">Use sample data</button><span class="hint" id="sLinkHint"></span></div>
        <div class="frow" id="sSheetRow" style="display:none"><label>Sheet</label><select id="sSheet"></select></div>
        <div class="report" id="sReport"></div>
        <details><summary>Column mapping (only needed if your export uses different column names)</summary><div id="sMap" style="margin-top:.5rem"></div></details>
      </div>

      <div class="scard"><h3>🏷 Release name</h3>
        <div class="frow"><label>Prefix</label><input type="text" id="fPrefix" value="${esc(S.prefix)}"></div>
        <div class="frow"><label>Release / subject</label><input type="text" id="fSubject" value="${esc(S.subject)}" placeholder="(empty = project name from the Excel file)"></div>
        <div class="hint">Header reads: <b id="fPreview"></b></div>
      </div>

      <div class="scard"><h3>🏁 Milestones <span>shown on the rail</span></h3>
        <table class="mt"><thead><tr><th>Code</th><th>Description</th><th>Date</th><th title="Use the Go-Live date from the plan">Auto</th><th></th></tr></thead><tbody id="mBody">${S.milestones.map(milestoneRow).join("")}</tbody></table>
        <div class="btnrow"><button class="btn" id="mAdd" type="button">+ Add milestone</button></div>
        <div class="hint">"Auto" = the finish date of the last task in the plan (Go-Live).</div>
      </div>

      <div class="scard"><h3>⏱ Playback &amp; refresh</h3>
        <div class="frow"><label>Seconds per scene</label><input type="number" id="fScene" min="3" max="300" value="${S.sceneSeconds}"></div>
        <div class="frow"><label>Re-read linked file every (s)</label><input type="number" id="fRefresh" min="5" max="3600" value="${S.refreshSeconds}"></div>
        <div class="frow"><label>Start in mode</label><select id="fMode"><option value="present">Present</option><option value="interact">Interact</option></select></div>
        <div class="frow"><label>Projection</label><select id="fScen"><option value="best">Best case (overdue done tomorrow)</option><option value="pace">Current pace (remaining work)</option></select></div>
        <div class="frow"><label>Risk spotlights (top N)</label><input type="number" id="fMaxRisks" min="0" max="10" value="${S.maxRisks}"></div>
        <div><span class="secT" style="display:block;margin-bottom:.2rem">Scenes to include</span>
          ${[["overview", "Overview"], ["landing", "Go-Live outlook"], ["impacted", "Impacted tasks"], ["week", "Due this week"], ["owners", "Who needs to act"]].map(([k, l]) => `<label class="chk"><input type="checkbox" class="fScene" data-k="${k}" ${sc[k] ? "checked" : ""}>${l}</label>`).join("")}</div>
      </div>

      <div class="scard"><h3>⚠ Risk rules</h3>
        <div class="frow"><label>"Behind" when trailing plan by</label><input type="number" id="fBehind" min="0" max="100" value="${S.behindPct}"><span class="hint">% progress</span></div>
        <div class="frow"><label>Pretend today is</label><input type="date" id="fToday" value="${esc(S.todayOverride)}"><button class="btn" id="fTodayClr" type="button" style="padding:.2rem .6rem">Real date</button></div>
        <div><span class="secT" style="display:block;margin-bottom:.2rem">Non-working days</span>${DOW.map(([n, l]) => `<label class="chk"><input type="checkbox" class="fWk" data-n="${n}" ${S.weekend.includes(n) ? "checked" : ""}>${l}</label>`).join("")}</div>
        <div class="hint">Overdue = finish date passed and under 100% complete. Impacted = pushed by a late predecessor.</div>
      </div>

      <div class="scard"><h3>🖼 Branding</h3>
        <div class="frow"><label>Header logo</label><img id="fLogoPrev" alt="" style="height:2rem;background:#1450F5;border-radius:.4rem;padding:.2rem .5rem"></div>
        <div class="btnrow"><button class="btn" id="fLogoBtn" type="button">Upload logo…</button><button class="btn" id="fLogoClr" type="button">Use default KONE logo</button><input type="file" id="fLogoFile" accept="image/*" hidden></div>
        <div class="hint">Use a white/transparent PNG or SVG – it sits on the blue header.</div>
      </div>

      <div class="scard"><h3>💾 Backup &amp; move to another PC</h3>
        <div class="btnrow"><button class="btn" id="bExport" type="button">Export settings</button><button class="btn" id="bImport" type="button">Import settings…</button><input type="file" id="bFile" accept=".json,application/json" hidden><button class="btn danger" id="bReset" type="button">Reset to defaults</button></div>
        <div class="hint">Settings are stored in this browser. Export them to a small file to use the same setup elsewhere.</div>
      </div>
    </div>
    <div class="sfoot"><span class="grow" id="sMsg">Changes apply when you press Save.</span><button class="btn" id="sCancel" type="button">Cancel</button><button class="btn primary" id="sSave" type="button">Save &amp; apply</button></div>
  </div>`;
  root.hidden = false;
  $("fMode").value = S.defaultMode; $("fScen").value = S.defaultScenario;
  $("fLogoPrev").src = S.logo || "assets/kone-logo.png";
  document.querySelectorAll("#mBody tr").forEach(wireMilestoneRow);
  const prev = () => { $("fPreview").textContent = ($("fPrefix").value.trim() || "R&D Execution") + " – " + ($("fSubject").value.trim() || (DATA && DATA.meta.name) || "Release Status"); };
  $("fPrefix").oninput = prev; $("fSubject").oninput = prev; prev();
  $("mAdd").onclick = () => { $("mBody").insertAdjacentHTML("beforeend", milestoneRow({ code: "", label: "", date: "", auto: false })); wireMilestoneRow($("mBody").lastElementChild); };
  $("fTodayClr").onclick = () => { $("fToday").value = ""; };
  /* data source */
  $("sBrowse").onclick = () => $("sFile").click();
  $("sFile").onchange = async e => { const f = e.target.files[0]; if (f) { App.sheet = ""; await loadFromFile(f, null); } e.target.value = ""; };
  const dz = $("sDrop");
  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", async e => { const f = e.dataTransfer.files[0]; if (f) { App.sheet = ""; await loadFromFile(f, null); } });
  $("sLink").onclick = linkFile; $("sUnlink").onclick = unlinkFile; $("sSample").onclick = useSample;
  $("sSheet").onchange = e => { App.sheet = e.target.value; applyBuffer(false); };
  /* branding */
  $("fLogoBtn").onclick = () => $("fLogoFile").click();
  $("fLogoFile").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 1.5e6) { toast("That logo is larger than 1.5 MB – please use a smaller image.", true); return; }
    const r = new FileReader(); r.onload = () => { SETTINGS.logo = r.result; $("fLogoPrev").src = r.result; applySettingsEffects(); }; r.readAsDataURL(f);
  };
  $("fLogoClr").onclick = () => { SETTINGS.logo = ""; $("fLogoPrev").src = "assets/kone-logo.png"; applySettingsEffects(); };
  /* backup */
  $("bExport").onclick = exportSettings;
  $("bImport").onclick = () => $("bFile").click();
  $("bFile").onchange = e => { const f = e.target.files[0]; if (f) importSettings(f); e.target.value = ""; };
  $("bReset").onclick = () => { if (confirm("Reset ALL settings to the defaults in js/defaults.js?")) { SETTINGS = sanitizeSettings(mergeSettings(DEFAULT_SETTINGS, {})); persistSettings(); applyAfterSettings(true); closeSettings(); toast("Settings reset to defaults."); } };
  $("sClose").onclick = closeSettings; $("sCancel").onclick = closeSettings; $("sSave").onclick = saveSettingsFromForm;
  refreshSourcePanel();
}
function closeSettings() { const r = $("settings"); r.hidden = true; r.innerHTML = ""; }
const settingsOpen = () => !$("settings").hidden;

function saveSettingsFromForm() {
  const n = SETTINGS;
  const weekend = [...document.querySelectorAll(".fWk")].filter(c => c.checked).map(c => +c.dataset.n);
  if (weekend.length >= 7) { toast("At least one day must be a working day.", true); return; }
  const ms = [...document.querySelectorAll("#mBody tr")].map(tr => ({
    code: tr.querySelector(".m-code").value.trim(), label: tr.querySelector(".m-label").value.trim(),
    date: tr.querySelector(".m-date").value, auto: tr.querySelector(".m-auto").checked
  })).filter(m => m.code);
  const bad = ms.find(m => !m.auto && !isISO(m.date));
  if (bad) { toast(`Milestone "${bad.code}" needs a date (or tick Auto).`, true); return; }
  n.prefix = $("fPrefix").value.trim() || "R&D Execution"; n.subject = $("fSubject").value.trim();
  n.milestones = ms;
  n.sceneSeconds = $("fScene").value; n.refreshSeconds = $("fRefresh").value; n.defaultMode = $("fMode").value; n.defaultScenario = $("fScen").value; n.maxRisks = $("fMaxRisks").value;
  document.querySelectorAll(".fScene").forEach(c => { n.scenes[c.dataset.k] = c.checked; });
  n.behindPct = $("fBehind").value; n.todayOverride = $("fToday").value; n.weekend = weekend;
  SETTINGS = sanitizeSettings(n); persistSettings();
  applyAfterSettings(false); closeSettings(); toast("Settings saved and applied.");
}
function applyAfterSettings(resetModes) {
  applySettingsEffects();
  if (resetModes) { UI.mode = SETTINGS.defaultMode; scenario = SETTINGS.defaultScenario; }
  restartTimers();
  if (DATA) render();
}
function exportSettings() {
  const blob = new Blob([JSON.stringify({ app: "kone-release-dashboard", settings: SETTINGS }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "kone-dashboard-settings.json"; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importSettings(file) {
  const r = new FileReader();
  r.onload = () => {
    try { const j = JSON.parse(r.result); const s = j.settings || j; SETTINGS = sanitizeSettings(mergeSettings(DEFAULT_SETTINGS, s)); persistSettings(); applyAfterSettings(true); closeSettings(); toast("Settings imported."); }
    catch (e) { toast("That file is not a valid settings export.", true); }
  };
  r.readAsText(file);
}

/* ---------- live bits of the settings page ---------- */
function refreshSourcePanel() {
  if (!settingsOpen()) return;
  const src = $("sSrc"); if (!src) return;
  const linked = !!App.handle;
  src.innerHTML = App.source === "file"
    ? `📗 ${esc(App.name)} · ${App.report ? App.report.tasks : "?"} tasks · loaded ${App.loadedAt ? App.loadedAt.toLocaleTimeString("en-GB") : ""}${linked ? `<span class="badge">🔗 linked · checks every ${SETTINGS.refreshSeconds} s</span>` : ""}`
    : `🧪 Sample data (demo). Load your Excel file to see your own release.`;
  $("sLink").disabled = !window.showOpenFilePicker; $("sUnlink").disabled = !linked;
  $("sLinkHint").textContent = window.showOpenFilePicker ? (linked ? "Save the file in Excel and the screen updates." : "") : "Linking needs Edge or Chrome.";
  const names = App.sheetNames || [];
  $("sSheetRow").style.display = names.length > 1 ? "flex" : "none";
  $("sSheet").innerHTML = names.map(n => `<option ${n === App.sheet ? "selected" : ""}>${esc(n)}</option>`).join("");
  const r = App.report, rep = $("sReport");
  if (!r) { rep.innerHTML = `<span class="ok">Ready.</span> Load an Excel export with columns such as Task number, Name, Start, Finish, Depends on, % complete.`; $("sMap").innerHTML = `<div class="hint">Load a file first to map its columns.</div>`; return; }
  rep.innerHTML = (r.errors.length ? r.errors.map(e => `<div class="e">✖ ${esc(e)}</div>`).join("") : `<div class="ok">✔ Sheet "${esc(r.sheet || "")}" · header on row ${r.headerRow} · ${r.tasks} tasks · ${r.deps} dependencies</div>`)
    + r.warnings.slice(0, 12).map(w => `<div class="w">⚠ ${esc(w)}</div>`).join("") + (r.warnings.length > 12 ? `<div class="w">… and ${r.warnings.length - 12} more</div>` : "");
  const opts = ['<option value="">(auto)</option>'].concat((r.headers || []).map(h => `<option value="${esc(h)}">${esc(h)}</option>`)).join("");
  $("sMap").innerHTML = `<table class="mt"><thead><tr><th>Dashboard field</th><th>Excel column</th><th>Detected</th></tr></thead><tbody>${Object.keys(FIELD_LABELS).map(f =>
    `<tr><td>${esc(FIELD_LABELS[f])}${REQUIRED_FIELDS.includes(f) ? " *" : ""}</td><td><select data-f="${f}">${opts}</select></td><td>${r.mapping && r.mapping[f] ? esc(r.mapping[f]) : '<span style="color:var(--red)">not found</span>'}</td></tr>`).join("")}</tbody></table>`;
  $("sMap").querySelectorAll("select").forEach(sel => {
    sel.value = SETTINGS.colMap[sel.dataset.f] || "";
    sel.onchange = () => { if (sel.value) SETTINGS.colMap[sel.dataset.f] = sel.value; else delete SETTINGS.colMap[sel.dataset.f]; persistSettings(); applyBuffer(false); };
  });
}
