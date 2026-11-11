"use strict";
/*
  DEFAULT SETTINGS  -  safe to edit with Notepad.
  These are what a brand-new browser starts with. Anything changed on the Settings page
  (the gear icon) is saved in that browser and overrides these values.
  Tip: set it up once on the Settings page, press "Export settings", and import the file on any other PC.
*/
const DEFAULT_SETTINGS = {
  version: 1,

  // Dashboard name  ->  "<prefix> – <subject>". Leave subject empty to use the project name found in the Excel file.
  prefix: "R&D Execution",
  subject: "ISU NBS R25.2_extnR26Q4 Release Status",

  // Milestones shown on the rail. auto:true = use the Go-Live date (finish of the last task in the plan).
  milestones: [
    { code: "KR1",            label: "Key Result 1",      date: "2026-08-18", auto: false },
    { code: "KR2",            label: "Key Result 2",      date: "2026-09-28", auto: false },
    { code: "K5M/K5S/K5ESU",  label: "Release milestone", date: "2026-11-14", auto: false },
    { code: "GO LIVE",        label: "System Go-Live",    date: "",           auto: true  }
  ],

  // Playback and refresh
  sceneSeconds: 15,          // how long each Present-mode scene stays on screen
  refreshSeconds: 30,        // how often a linked Excel file is re-read
  defaultMode: "present",    // "present" or "interact"
  defaultScenario: "best",   // "best" = overdue work finishes tomorrow, "pace" = remaining work at plan speed
  maxRisks: 5,               // how many overdue tasks get their own spotlight scene
  scenes: { overview: true, landing: true, impacted: true, week: true, owners: true },

  // Risk rules
  behindPct: 25,             // a started task is "behind" if its progress trails the plan by more than this many %
  todayOverride: "",         // YYYY-MM-DD to pretend it is another day (demos/testing). Empty = real date
  weekend: [0, 6],           // non-working days: 0 = Sun ... 6 = Sat

  // Branding
  logo: "",                  // data-URL of an uploaded logo. Empty = assets/kone-logo.png

  // Column mapping overrides: { fieldName: "Exact Excel header" }. Normally empty (auto-detected).
  colMap: {}
};
