"use strict";
/* Shared helpers. Dates are handled as "day numbers" (days since 1970-01-01, UTC) so there are no timezone surprises. */
const DAY = 864e5;
let WEEKEND = new Set([0, 6]);                    // 0 = Sunday ... 6 = Saturday (set from Settings)
const toDay = s => Math.floor(Date.parse(s + "T00:00:00Z") / DAY);
const fromDay = d => new Date(d * DAY);
const fmtISO = d => new Date(d * DAY).toISOString().slice(0, 10);
const fmt = (d, o) => new Date(d * DAY).toLocaleDateString("en-GB", Object.assign({ day: "2-digit", month: "short", timeZone: "UTC" }, o || {}));
const isWk = d => WEEKEND.has((d + 4) % 7);       // 1970-01-01 was a Thursday
const nextWd = d => { while (isWk(d)) d++; return d; };
const addWd = (d, n) => { d = nextWd(d); const s = n < 0 ? -1 : 1; let k = Math.abs(n); while (k--) { d += s; while (isWk(d)) d += s; } return d; };
const wdDiff = (a, b) => { if (a === b) return 0; const s = b > a ? 1 : -1; let c = 0, d = a; while (d !== b) { d += s; if (!isWk(d)) c += s; } return c; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const $ = id => document.getElementById(id);
const isISO = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s + "T00:00:00Z"));
const clamp = (v, lo, hi, dflt) => { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; };
