KONE RELEASE DASHBOARD
======================
A release-status dashboard that runs entirely in the browser.
No server, no database, no install, no internet needed. Your Excel data never leaves the PC.

QUICK START
-----------
1. Copy this whole folder to any Windows PC (USB stick, SharePoint download, e-mail zip).
2. Double-click  Open-Dashboard.cmd   (opens Microsoft Edge or Google Chrome).
   For a floor display use  Open-Dashboard-Fullscreen.cmd.
   (You can also just open index.html in Edge or Chrome.)
3. Click the gear icon (top right), then Browse... and choose your Excel file.
   The dashboard processes it immediately.

First launch shows built-in DEMO data so the screen is never empty.

LOADING YOUR EXCEL FILE  (gear icon > Data source)
--------------------------------------------------
* Browse / drag-and-drop : loads the file for this session only (nothing is stored).
  You can also drop a file anywhere on the dashboard page.
* Link file (Edge/Chrome): pick the file once; the dashboard re-reads it every N seconds,
  so saving the file in Excel updates the screen. Permission must be given again each new session.
* An import report shows tasks, dependencies and any warnings (missing dates, unknown dependency numbers, loops).
* Different column names? Gear > Data source > Column mapping.
* Need a starting layout?  sample/Release-template.xlsx  (has a "Read me" sheet explaining each column).

WHAT COUNTS AS A RISK
---------------------
* Overdue   : Finish date is before today and the task is under 100% complete.
* Impacted  : not overdue itself, but pushed later by a late predecessor (finish-to-start, start-to-start, finish-to-finish, with lag).
* Behind    : started, but progress trails the plan by more than the threshold (default 25%).
* Go-Live   : the task with the latest finish date. Its projected date is recalculated from the delays above.
Two projections: Best case (overdue work finishes tomorrow) and Current pace (remaining work at plan speed).

SETTINGS  (gear icon, or press S)
---------------------------------
Release name . Milestones (add/remove, or "Auto" = Go-Live date) . Seconds per scene . Re-read interval .
Start mode . Projection . Number of risk spotlights . Which scenes to show . Behind-pace threshold .
"Pretend today is" date (for demos) . Non-working days . Logo . Export / import / reset settings.
Settings are saved in this browser. To use the same setup on another PC: Export settings, then Import there.
Defaults for a brand-new browser live in  js/defaults.js  (editable with Notepad).

KEYBOARD
--------
Space pause/play . Left/Right previous/next scene . M switch Present/Interact . P best case/current pace .
F full screen . S settings . Esc close settings / clear selection

MODES
-----
Present  : auto-playing scenes for a wall display (default 15 seconds per scene).
Interact : click a phase to expand it, click any task to trace what depends on it; team filters; task details.

FOLDER CONTENTS
---------------
index.html, app.css          the app
js\                          application code (plain scripts, no build step)
vendor\xlsx.full.min.js      SheetJS 0.20.3 (Apache-2.0) - reads Excel files in the browser
assets\kone-logo.png         header logo (can be replaced in Settings)
sample\Release-template.xlsx blank Excel layout
Open-Dashboard*.cmd          launchers

REQUIREMENTS
------------
Microsoft Edge or Google Chrome (recent version). "Link file" works in these two only.
Firefox/Safari can open the dashboard and load files with Browse, but cannot link a file for live updates.
