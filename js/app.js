"use strict";
/* Startup, timers, keyboard and drag-and-drop. */

let pollTimer = null;
function restartTimers() {
  clearInterval(pollTimer);
  pollTimer = setInterval(pollLinked, SETTINGS.refreshSeconds * 1000);
}
function tick() { $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }

/* header controls */
$("gearBtn").onclick = openSettings;
$("title").ondblclick = openSettings;
document.querySelectorAll("#modeSeg button").forEach(b => b.onclick = () => { UI.mode = b.dataset.m; applyMode(); });
$("scenChip").onclick = () => { scenario = scenario === "best" ? "pace" : "best"; render(); };

/* keyboard (ignored while typing in a field) */
addEventListener("keydown", e => {
  if (e.target.matches && e.target.matches("input, select, textarea")) return;
  const k = e.key.toLowerCase();
  if (settingsOpen()) { if (k === "escape") closeSettings(); return; }
  if (k === "s" || k === ",") { openSettings(); return; }
  if (k === "p") $("scenChip").click();
  if (k === "f") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); }
  if (k === "m") { UI.mode = UI.mode === "present" ? "interact" : "present"; applyMode(); }
  if (UI.mode === "present" && STORY) {
    if (k === " ") { e.preventDefault(); togglePlay(); }
    if (k === "arrowright") playScene(STORY.idx + 1);
    if (k === "arrowleft") playScene(STORY.idx - 1);
  }
  if (k === "escape" && UI.sel) selectTask(UI.sel.num);
});

/* drop an Excel file anywhere on the page */
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
addEventListener("dragenter", e => { if (hasFiles(e) && !settingsOpen()) $("dropAll").classList.add("on"); });
addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener("dragleave", e => { if (!e.relatedTarget) $("dropAll").classList.remove("on"); });
addEventListener("drop", async e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); $("dropAll").classList.remove("on");
  const f = e.dataTransfer.files[0]; if (f) { App.sheet = ""; await loadFromFile(f, null); }
});

addEventListener("resize", () => {
  if (!MODEL) return;
  if (UI.mode === "present" && STORY) renderScene(STORY.scenes[STORY.idx]); else drawInteract();
});

/* boot: show sample data until an Excel file is loaded */
applySettingsEffects();
tick(); setInterval(tick, 1000);
restartTimers();
setInterval(() => { if (DATA && MODEL && todayDay() !== MODEL.today) render(); }, 60000);   // roll over at midnight
DATA = buildSampleData();
render();
