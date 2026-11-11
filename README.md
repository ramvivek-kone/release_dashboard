# Release Dashboard

A release-status dashboard that runs entirely in the browser: no server, no database, no install.
Load an Excel project plan and it shows overdue tasks, impacted tasks, the Go-Live outlook and milestones,
either as an auto-playing wall display (**Present**) or a click-through review view (**Interact**).

**Live site:** https://ramvivek-kone.github.io/release_dashboard/

## Use it

- **GitHub Pages:** open the live site, click the gear icon (top right) and choose your Excel file.
- **Locally:** download the folder and double-click `Open-Dashboard.cmd` (Edge or Chrome), or open `index.html`.

Your Excel file is read inside your browser and is never uploaded anywhere. It is kept for the current session only.
Settings (release name, milestones, timers, risk rules) are saved in your browser; use *Export settings* to move them elsewhere.

## Excel layout

A sheet named `Project tasks` with a table that has at least `Task number`, `Outline number`, `Name`, `Start`, `Finish`.
Optional: `Depends on` (e.g. `5FS`, `7SS+2d`), `% complete`, `Assigned to`, `Team`, `Notes`.
`sample/Release-template.xlsx` is a ready-made starting point with a *Read me* sheet.
Other column names can be mapped in Settings → Data source → Column mapping.

## Publish on GitHub Pages

Repository → **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
The site is then served at `https://<owner>.github.io/<repo>/`. All paths are relative, so no configuration is needed.

## Defaults

Starting values for a new browser (release name, milestones, scene length) are in `js/defaults.js`.
See `README.txt` for the full user guide.

## Third-party

[SheetJS Community Edition](https://sheetjs.com) 0.20.3 (Apache-2.0) in `vendor/` reads Excel files in the browser.
