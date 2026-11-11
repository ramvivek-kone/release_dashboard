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
  if (k === "f") { try { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (err) { /* full screen not allowed here */ } }
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
addEventListener("dragenter", e => { if (hasFiles(e) && !settingsOpen() && DATA) $("dropAll").classList.add("on"); });   // on the home screen the big drop box handles it
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

/* home screen controls */
/* "Browse" is a <label for="hFile">: the browser opens the file dialog natively. Enter / Space do the same from the keyboard. */
$("hBrowse").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("hFile").click(); } });
$("hFile").onchange = async e => { const f = e.target.files[0]; if (f) { App.sheet = ""; homeMsg(""); await loadFromFile(f, null); } e.target.value = ""; };
$("hLink").onclick = linkFile;
$("hDemo").onclick = e => { e.preventDefault(); useSample(); };
$("hSettings").onclick = e => { e.preventDefault(); openSettings(); };
const hd = $("hDrop");
["dragenter", "dragover"].forEach(ev => hd.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); hd.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => hd.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); hd.classList.remove("over"); }));
hd.addEventListener("drop", async e => { const f = e.dataTransfer.files[0]; if (f) { App.sheet = ""; homeMsg(""); await loadFromFile(f, null); } });

/* tell the user up front when this view cannot open file dialogs (embedded preview pane, frame, very old browser) */
(function envHint() {
  const h = $("hHint"); if (!h) return;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (inFrame) h.textContent = "This page is open inside another window or preview pane, which often blocks file dialogs. Open it directly in Microsoft Edge or Google Chrome (the address bar should show this page on its own).";
  else if (!window.showOpenFilePicker) h.textContent = "“Link file” is not available in this browser or view. “Browse” still works. For live linking, open this page in Microsoft Edge or Google Chrome.";
})();

/* boot: no data yet -> the home screen asks for the latest Planner export */
applySettingsEffects();
tick(); setInterval(tick, 1000);
restartTimers();
setInterval(() => { if (DATA && MODEL && todayDay() !== MODEL.today) render(); }, 60000);   // roll over at midnight
render();
