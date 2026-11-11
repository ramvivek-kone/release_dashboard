"use strict";
/* Rendering: top section, milestone rail, timeline, Present-mode scenes and Interact mode. */

const qs = new URLSearchParams(location.search);
const SPEED = parseFloat(qs.get("speed")) || 1;
let scenario = ["best", "pace"].includes(qs.get("scenario")) ? qs.get("scenario") : SETTINGS.defaultScenario;
let DATA = null, MODEL = null, ALT = null, STORY = null;
const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const UI = { mode: ["present", "interact"].includes(qs.get("mode")) ? qs.get("mode") : (ssGet("rd.mode") || SETTINGS.defaultMode), expanded: new Set(), team: null, sel: null };

/* ======================= render root ======================= */
function render() {
  if (!DATA) return;
  MODEL = buildModel(DATA, scenario);
  ALT = buildModel(DATA, scenario === "best" ? "pace" : "best");
  const M = MODEL, leaves = M.T.filter(t => t.leaf);
  M.leaves = leaves;
  M.overdue = leaves.filter(t => t.state === "overdue").sort(rankOverdue);
  M.dueSoon = leaves.filter(t => t.state !== "done" && t.state !== "overdue" && t.F >= M.today && t.F <= M.today + 7).sort((a, b) => a.F - b.F || a.num - b.num);
  M.impacted = leaves.filter(t => t.state === "impacted").sort((a, b) => b.ev.slip - a.ev.slip || a.num - b.num);

  const subject = SETTINGS.subject || DATA.meta.name || "Release Status";
  const fullTitle = `${SETTINGS.prefix || "R&D Execution"} – ${subject}`;
  $("title").textContent = fullTitle; document.title = fullTitle;
  M.milestones = SETTINGS.milestones
    .map(m => ({ code: m.code, label: m.label, go: !!m.auto, d: m.auto ? M.gl.F : (isISO(m.date) ? toDay(m.date) : null) }))
    .filter(m => m.d !== null).sort((a, b) => a.d - b.d);
  renderRail(M);
  $("today").textContent = fmt(M.today, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  $("scenChip").textContent = (scenario === "best" ? "Best case · overdue done tomorrow" : "Current pace · remaining work") + "  ⇄ P";
  hero(M);
  updateStatusLine();
  applyMode();
}

function updateStatusLine() {
  if (!$("foot")) return;
  const parts = [];
  if (App.source === "sample") parts.push(`<span class="demo" onclick="openSettings()" title="Open settings">Sample data – click ⚙ to load your Excel file</span>`);
  if (App.linkError) parts.push(`<span class="err">⚠ Linked file not readable right now (${esc(App.linkError)}) – showing the last good data</span>`);
  $("foot").innerHTML = parts.join(" ");
  $("src").textContent = App.source === "file" ? `Source: ${App.name} · loaded ${App.loadedAt ? App.loadedAt.toLocaleTimeString("en-GB") : ""}${App.handle ? " · 🔗 linked" : ""}` : "";
}

function renderRail(M) {
  const ms = M.milestones;
  if (!ms.length) { $("rail").style.display = "none"; return; }
  $("rail").style.display = "block";
  const start = Math.min(toDay(DATA.meta.start), ms[0].d - 3);
  const end = Math.max(ms[ms.length - 1].d, M.gl.ev.pF) + 2;
  const pos = d => ((d - start) / (end - start) * 100).toFixed(2) + "%";
  const nextIdx = ms.findIndex(m => m.d >= M.today);
  const goM = ms.find(m => m.go);
  const tight = !!goM && M.glSlip > 0 && (M.gl.ev.pF - goM.d) / (end - start) < 0.1;   // projected date too close to Go-Live to label separately
  let h = `<div class="rt"><div class="trk"></div><div class="fill" style="width:${Math.max(0, Math.min(100, (M.today - start) / (end - start) * 100)).toFixed(2)}%"></div>`;
  if (M.glSlip > 0) { const g = ms.find(m => m.go); if (g) h += `<div class="ghost" style="left:${pos(g.d)};width:${Math.max(0, (M.gl.ev.pF - g.d) / (end - start) * 100).toFixed(2)}%"></div>`; }
  ms.forEach((m, i) => {
    const past = m.d < M.today, isNext = i === nextIdx, daysTo = m.d - M.today;
    const cls = ["pt", past ? "done" : "", isNext ? "next" : "", m.go ? "go " + (M.glSlip > 0 ? "risk" : "safe") : ""].join(" ");
    const sub = past ? "✓ done" : daysTo === 0 ? "today" : `in ${daysTo} day${daysTo === 1 ? "" : "s"}`;
    const tightGo = m.go && M.glSlip > 0 && tight;
    h += `<div class="${cls}" style="left:${pos(m.d)}" title="${esc(m.label)}"><div class="code">${esc(m.code)}</div><div class="mk"></div><div class="date">${fmt(m.d)}</div><div class="sub">${tightGo ? `→ ${fmt(M.gl.ev.pF)} · +${M.glSlip} wd` : sub + (m.go && M.glSlip > 0 ? " · at risk" : "")}</div></div>`;
  });
  if (M.glSlip > 0 && !tight) h += `<div class="proj" style="left:${pos(M.gl.ev.pF)}"><div class="code">PROJECTED</div><div class="mk"></div><div class="date" style="color:var(--red)">${fmt(M.gl.ev.pF)}</div><div class="sub" style="color:var(--red)">+${M.glSlip} wd</div></div>`;
  else if (M.glSlip > 0) h += `<div class="proj" style="left:${pos(M.gl.ev.pF)}"><div class="code">&nbsp;</div><div class="mk"></div></div>`;   // marker only; its label is folded into Go-Live's
  h += `<div class="now" style="left:${pos(M.today)}"><b>TODAY</b></div></div>`;
  $("rail").innerHTML = h;
}

function hero(M) {
  const od = M.overdue.length, imp = M.impacted.length, due = M.dueSoon.length, pct = DATA.meta.pct;
  const bad = M.glSlip > 0;
  $("hero").innerHTML = `
    <div class="hs"><div class="t">Complete</div><div class="n">${Math.round(pct * 100)}%</div><div class="pbar"><i style="width:${pct * 100}%"></i></div></div>
    <div class="hs ${od ? "red" : "green"}"><div class="t">Overdue</div><div class="n">${od}</div></div>
    <div class="hs ${imp ? "amber" : "green"}"><div class="t">Impacted tasks</div><div class="n">${imp}</div></div>
    <div class="hs"><div class="t">Due this week</div><div class="n">${due}</div></div>`;
  $("tstat").innerHTML = `<div class="l">Go-Live</div><div class="gst ${bad ? "bad" : "ok"}">${bad ? "+" + M.glSlip + " working days" : "ON TRACK"}</div><div class="pj">${bad ? fmt(M.gl.F) + " → " + fmt(M.gl.ev.pF) : "holds " + fmt(M.gl.F)}</div>`;
}

/* ======================= mode handling ======================= */
function applyMode() {
  document.body.className = UI.mode;
  document.querySelectorAll("#modeSeg button").forEach(b => b.classList.toggle("on", b.dataset.m === UI.mode));
  ssSet("rd.mode", UI.mode);
  $("teamFilter").style.display = UI.mode === "interact" ? "flex" : "none";
  if (UI.mode === "present") { stopStory(); startStory(); }
  else { stopStory(); renderInteract(); }
}

/* ======================= TIMELINE (phase-level, SVG) ======================= */
/* opts: focus:Set(task nums)|null, edges:[{p,s,kind}], pulse:task|null, zoom:bool */
function drawTimeline(opts) {
  opts = opts || {};
  const M = MODEL, host = $("gantt"), W = host.clientWidth, H = host.clientHeight;
  if (!W || !H) return;
  const pres = UI.mode === "present";
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
  let phs = M.phases; if (UI.team) phs = phs.filter(p => p.teamName === UI.team);
  const zoom = !!(opts.zoom && opts.focus);
  if (zoom) { const tp = new Set([...opts.focus].map(n => M.byNum[n].phase.num)); phs = M.phases.filter(p => tp.has(p.num)); }
  const rows = [];
  phs.forEach(p => {
    rows.push({ t: p, lvl: 0 });
    if (zoom) { if (p.kids.length) M.T.filter(t => t.leaf && t.phase === p && opts.focus.has(t.num)).sort((a, b) => a.S - b.S).forEach(t => rows.push({ t, lvl: 1 })); }
    else if (!pres && UI.expanded.has(p.num) && p.kids.length) M.T.filter(t => t.leaf && t.phase === p).sort((a, b) => a.S - b.S).forEach(t => rows.push({ t, lvl: 1 }));
  });
  if (!rows.length) { host.innerHTML = ""; return; }
  const topPad = fs * 3.5, botPad = fs * 0.2;      // header band: row 1 months, row 2 day numbers, row 3 TODAY / Go-Live tags
  let gaps = 0; rows.forEach((r, i) => { r.gap = (r.lvl === 0 && i > 0 && r.t.teamName !== rows.slice(0, i).reverse().find(x => x.lvl === 0).t.teamName) ? 1 : 0; gaps += r.gap; });
  const gapH = 0.45;
  const avail = H - topPad - botPad;
  const rh = zoom ? Math.min(fs * 2.6, avail / Math.max(1, rows.length + gaps * gapH)) : Math.min(pres ? fs * 2.5 : fs * 2.0, avail / (rows.length + gaps * gapH));
  const vOffset = zoom ? Math.max(0, (avail - rh * (rows.length + gaps * gapH)) * 0.28) : 0;
  let yy = topPad + vOffset; rows.forEach(r => { yy += r.gap * gapH * rh; r.y = yy; yy += rh; });
  const teamW = fs * (pres ? 7.6 : 6.6), labelW = Math.min(W * (pres ? 0.36 : 0.35), fs * (pres ? 25 : 23));
  let d0 = Math.min(...M.T.map(t => t.S)) - 2, d1 = Math.max(M.gl.F, M.gl.ev.pF, ...M.phases.map(t => t.ev.pF)) + 5;
  if (zoom) {
    const fl = [...opts.focus].map(n => M.byNum[n]).filter(t => t.leaf);
    const reachesGL = opts.focus.has(M.gl.num);
    d0 = Math.min(M.today, ...fl.map(t => t.S)) - 4;
    d1 = Math.max(M.today, ...fl.map(t => Math.max(t.F, t.ev.pF)), reachesGL ? M.gl.ev.pF : 0) + 6;
    if (d1 - d0 < 21) d1 = d0 + 21;
  }
  const padR = fs * 0.8;
  const x = d => labelW + (d - d0) / (d1 - d0) * (W - labelW - padR);
  const fsz = Math.min(fs * (pres ? 1.0 : 0.82), rh * 0.58);
  const bh = Math.min(rh * 0.5, fs * 1.2);
  const trunc = (s, px, f) => { const max = Math.floor(px / (f * 0.55)); return s.length > max ? s.slice(0, Math.max(3, max - 1)) + "…" : s; };

  const focus = opts.focus || null;
  const touchedPhases = focus ? new Set([...focus].map(n => M.byNum[n].phase.num)) : null;
  const rowIdx = {}; rows.forEach((r, i) => rowIdx[r.t.num] = i);
  const rowOf = t => rowIdx[t.num] !== undefined ? rowIdx[t.num] : rowIdx[t.phase.num];

  let s = `<defs><marker id="aR" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="11" markerHeight="11" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 z" fill="#D6173C"/></marker>
    <marker id="aN" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="11" markerHeight="11" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 z" fill="#1450F5"/></marker></defs>`;
  const dayPx = x(d0 + 1) - x(d0);
  const dayStep = dayPx >= fs * 1.5 ? 1 : dayPx >= fs * 0.8 ? 2 : dayPx >= fs * 0.4 ? 7 : 0;   // how many days between numbers so they never touch
  const monthName = d => new Date(d * DAY).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  for (let d = d0; d <= d1; d++) {
    const dt = new Date(d * DAY), first = dt.getUTCDate() === 1;
    if (first || d === d0) {
      /* the opening (partial) month's name is skipped when the next month starts too close for both names to fit */
      const nextFirst = first ? d : d + (new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1)) / DAY - d);
      const crowded = d === d0 && !first && (x(nextFirst) - x(d)) < fs * 6.5;
      const xx = Math.max(x(d), labelW + 2);
      if (!crowded) s += `<text x="${xx + 4}" y="${fs * 1.15}" font-size="${fs * 0.85}" font-weight="800" fill="#141414">${monthName(d)}</text>`;
      if (first) s += `<line x1="${x(d)}" x2="${x(d)}" y1="${fs * 0.25}" y2="${H}" stroke="#d9d1c9"/>`;
    } else if (dt.getUTCDay() === 1) s += `<line x1="${x(d)}" x2="${x(d)}" y1="${topPad - 4}" y2="${H}" stroke="#f0ebe6"/>`;
    const showNum = dayStep === 1 ? !isWk(d) : dayStep === 2 ? (!isWk(d) && d % 2 === 0) : dayStep === 7 ? dt.getUTCDay() === 1 : false;
    if (showNum) { const lx = x(d) + (x(d + 1) - x(d)) / 2; if (lx > labelW) s += `<text x="${lx}" y="${fs * 2.3}" font-size="${fs * 0.62}" fill="#8a837c" text-anchor="middle">${dt.getUTCDate()}</text>`; }
  }
  let prevTeam = null;
  rows.forEach((r, i) => {
    const t = r.t, ev = t.ev, cy = r.y + rh / 2;
    const dim = focus && (r.lvl ? !focus.has(t.num) : !touchedPhases.has(t.num));
    const sel = UI.sel && UI.sel.num === t.num;
    s += `<g opacity="${dim ? 0.14 : 1}">`;
    if (i % 2 === 0) s += `<rect x="0" y="${r.y}" width="${W}" height="${rh}" fill="#fbf9f7"/>`;
    if (sel) s += `<rect x="0" y="${r.y}" width="${W}" height="${rh}" fill="#eaf0ff"/>`;
    if (r.lvl === 0) {
      if (r.gap) s += `<line x1="0" x2="${W}" y1="${r.y - gapH * rh * 0.5}" y2="${r.y - gapH * rh * 0.5}" stroke="#e4ddd6"/>`;
      if (t.teamName !== prevTeam) {
        s += `<rect x="4" y="${r.y + rh * 0.12}" width="${fs * 0.28}" height="${rh * 0.76}" rx="2" fill="${teamColor(t.teamName)}"/>
              <text x="${4 + fs * 0.6}" y="${cy + fsz * 0.34}" font-size="${fsz * 0.82}" font-weight="800" fill="#3b3632" letter-spacing=".03em">${esc(trunc(t.teamName.toUpperCase(), teamW - fs * 0.8, fsz * 0.82))}</text>`;
      } else s += `<rect x="4" y="${r.y + rh * 0.12}" width="${fs * 0.28}" height="${rh * 0.76}" rx="2" fill="${teamColor(t.teamName)}" opacity=".45"/>`;
      prevTeam = t.teamName;
      const label = (UI.mode === "interact" && t.kids.length ? (UI.expanded.has(t.num) ? "▾ " : "▸ ") : "") + t.name;
      const hasOverdue = M.leaves.some(l => l.phase === t && l.state === "overdue");
      const hasImpacted = M.leaves.some(l => l.phase === t && l.state === "impacted");
      const lc = hasOverdue ? "#D6173C" : hasImpacted ? "#B07800" : "#141414";
      s += `<text x="${teamW + fs * 0.3}" y="${cy + fsz * 0.34}" font-size="${fsz}" font-weight="700" fill="${lc}">${esc(trunc(label, labelW - teamW - fs * 0.6, fsz))}</text>`;
      if (!pres) s += `<rect class="hit" data-phase="${t.num}" x="0" y="${r.y}" width="${labelW}" height="${rh}" fill="transparent"/>`;
    } else {
      s += `<text x="${teamW + fs * 1.4}" y="${cy + fsz * 0.34}" font-size="${fsz * 0.88}" font-weight="500" fill="${t.state === "overdue" ? "#D6173C" : "#3b3632"}">${esc(trunc("↳ " + t.name, labelW - teamW - fs * 1.8, fsz * 0.88))}</text>`;
      if (!pres) s += `<rect class="hit" data-task="${t.num}" x="0" y="${r.y}" width="${W}" height="${rh}" fill="transparent"/>`;
    }
    const xs0 = x(t.S), xe0 = x(t.F + 1), h = r.lvl ? bh * 0.7 : bh;
    const xs = Math.max(xs0, labelW + 2), xe = Math.max(xe0, labelW + 2);
    if (xe0 > labelW + 2) s += `<rect x="${xs}" y="${cy - h / 2}" width="${Math.max(3, xe - xs)}" height="${h}" rx="${h * 0.28}" fill="#A1B9FB"/>`;
    const doneEnd = Math.max(labelW + 2, xs0 + (xe0 - xs0) * Math.min(1, t.pct));
    if (t.pct > 0 && doneEnd > xs) s += `<rect x="${xs}" y="${cy - h / 2}" width="${Math.max(3, doneEnd - xs)}" height="${h}" rx="${h * 0.28}" fill="#1450F5"/>`;
    if (ev.pF > t.F) {
      const xp = x(ev.pF + 1);
      const own = t.leaf ? t.state === "overdue" : M.leaves.some(l => l.phase === t && l.state === "overdue");
      s += `<rect x="${xe}" y="${cy - h / 2}" width="${Math.max(4, xp - xe)}" height="${h}" rx="${h * 0.28}" fill="${own ? "#D6173C" : "#F2A900"}"/>`;
      if (xp - xe > fs * 2.4) s += `<text x="${(xe + xp) / 2}" y="${cy + fsz * 0.3}" font-size="${fsz * 0.8}" font-weight="800" fill="#fff" text-anchor="middle">+${ev.slip}d</text>`;
    }
    { /* impacted-task markers: amber diamonds where a task is pushed by a late predecessor */
      const ims = t.leaf ? (t.state === "impacted" ? [t] : []) : M.leaves.filter(l => l.phase === t && l.state === "impacted");
      ims.slice(0, 8).forEach(l => { const mx = x(l.ev.pS), dd = h * 0.5; s += `<path d="M${mx},${cy - dd} L${mx + dd},${cy} L${mx},${cy + dd} L${mx - dd},${cy} Z" fill="#F2A900" stroke="#fff" stroke-width="1.6"/>`; });
    }
    if (!t.leaf || t.state === "overdue") { /* overdue markers: where the problem is */
      const ods = t.leaf ? [t] : M.leaves.filter(l => l.phase === t && l.state === "overdue");
      ods.forEach(l => { const mx = x(l.F + 1); s += `<circle class="pulse" cx="${mx}" cy="${cy}" r="${h * 0.62}" fill="#fff" stroke="#D6173C" stroke-width="3"/><text x="${mx}" y="${cy + fsz * 0.3}" font-size="${fsz * 0.8}" font-weight="900" fill="#D6173C" text-anchor="middle">!</text>`; });
    }
    if (!pres) s += `<rect class="hit" data-task="${t.num}" x="${xs}" y="${r.y}" width="${Math.max(6, xe - xs)}" height="${rh}" fill="transparent"/>`;
    s += `</g>`;
    if (opts.pulse && opts.pulse.phase === t && r.lvl === 0) { const mx = x(opts.pulse.F + 1); s += `<circle class="pulse" cx="${mx}" cy="${cy}" r="${h * 1.15}" fill="none" stroke="#D6173C" stroke-width="3"/>`; }
  });
  if (zoom && opts.focus.size <= 1) {
    const cx = labelW + (W - labelW) / 2, cy2 = yy + fs * 4;
    s += `<text x="${cx}" y="${cy2}" font-size="${fs * 1.5}" font-weight="800" fill="#1E9E6A" text-anchor="middle">✓ No other task depends on this</text><text x="${cx}" y="${cy2 + fs * 1.6}" font-size="${fs * 0.95}" fill="#6b6560" text-anchor="middle" font-weight="600">The delay stays contained – nothing downstream moves.</text>`;
  }
  const seen = new Set();
  (opts.edges || []).forEach(e => {
    const a = rowOf(e.p), b = rowOf(e.s); if (a === undefined || b === undefined || a === b) return;
    const k = a + ">" + b + e.kind; if (seen.has(k)) return; seen.add(k);
    const x1 = x(e.p.ev.pF + 1), x2 = Math.max(x(e.s.ev.pS), x1 + 14), y1 = rows[a].y + rh / 2, y2 = rows[b].y + rh / 2;
    const mid = Math.max(x1 + 10, Math.min(x2 - 10, (x1 + x2) / 2));
    const d = `M${x1},${y1} H${mid} V${y2} H${x2 - 2}`;
    s += `<path class="flow ${e.kind}" d="${d}" marker-end="url(#a${e.kind === "r" ? "R" : "N"})"/>`;
    s += `<circle r="${fs * 0.28}" fill="#fff" stroke="${e.kind === "r" ? "#D6173C" : "#1450F5"}" stroke-width="2.5"><animateMotion dur="1.6s" repeatCount="indefinite" path="${d}"/></circle>`;
  });
  const tx = x(M.today + 0.5);
  const tagY = fs * 2.55, tagH = fs * 0.95, tagBase = tagY + fs * 0.7;   // third header row
  const tagW = fs * 3.8, tagX = Math.max(labelW + 2, Math.min(W - tagW - 2, tx - tagW / 2));
  s += `<line x1="${tx}" x2="${tx}" y1="${tagY + tagH}" y2="${H}" stroke="#141414" stroke-width="2.2" stroke-dasharray="6 4"/><rect x="${tagX}" y="${tagY}" width="${tagW}" height="${tagH}" rx="4" fill="#141414"/><text x="${tagX + tagW / 2}" y="${tagBase}" font-size="${fs * 0.68}" fill="#fff" text-anchor="middle" font-weight="800">TODAY</text>`;
  const gx = x(M.gl.F + 1), px = x(M.gl.ev.pF + 1);
  const lblSz = fs * 0.72, cw = lblSz * 0.62;                      // rough width of one bold character
  const glTxt = `GO-LIVE ${fmt(M.gl.F)}`, pjTxt = `${fmt(M.gl.ev.pF)} · +${M.glSlip} wd`;
  s += `<line x1="${gx}" x2="${gx}" y1="${tagY + tagH}" y2="${H}" stroke="#1450F5" stroke-width="2.4"/>`;
  if (px > gx + 2) {
    s += `<rect x="${gx}" y="${tagY + tagH}" width="${px - gx}" height="${H}" fill="#D6173C" opacity=".07"/><line x1="${px}" x2="${px}" y1="${tagY + tagH}" y2="${H}" stroke="#D6173C" stroke-width="3"/>`;
    if (px + 5 + pjTxt.length * cw <= W - 2) {      // room on the right: two labels, one each side
      s += `<text x="${gx - 5}" y="${tagBase}" font-size="${lblSz}" font-weight="800" fill="#1450F5" text-anchor="end">${glTxt}</text><text x="${px + 5}" y="${tagBase}" font-size="${lblSz}" font-weight="800" fill="#D6173C">${pjTxt}</text>`;
    } else {                                          // too close to the right edge: one combined label ending at the red line
      s += `<text x="${px - 5}" y="${tagBase}" font-size="${lblSz}" font-weight="800" text-anchor="end"><tspan fill="#1450F5">${glTxt}</tspan><tspan fill="#D6173C"> → ${pjTxt}</tspan></text>`;
    }
  } else s += `<text x="${Math.min(gx - 5, W - 4)}" y="${tagBase}" font-size="${lblSz}" font-weight="800" fill="#1450F5" text-anchor="end">${glTxt}</text>`;
  host.innerHTML = `<svg class="${zoom ? "zoom" : ""}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" font-family="Inter,Segoe UI,Arial,sans-serif">${s}</svg>`;
}

/* ======================= PRESENT MODE: scene loop ======================= */
function stopStory() { if (STORY && STORY.timer) clearTimeout(STORY.timer); }
function startStory() {
  const M = MODEL, sc = SETTINGS.scenes, DUR = SETTINGS.sceneSeconds * 1000;
  const scenes = [];
  if (sc.overview) scenes.push({ kind: "overview", dur: DUR });
  M.overdue.slice(0, SETTINGS.maxRisks).forEach((t, i) => scenes.push({ kind: "spot", t, i, n: Math.min(SETTINGS.maxRisks, M.overdue.length), total: M.overdue.length, dur: DUR }));
  if (sc.landing) scenes.push({ kind: "landing", dur: DUR });
  if (sc.impacted && M.impacted.length) scenes.push({ kind: "impacted", dur: DUR });
  if (sc.week) scenes.push({ kind: "week", dur: DUR });
  if (sc.owners && M.overdue.length) scenes.push({ kind: "owners", dur: DUR });
  if (!scenes.length) scenes.push({ kind: "overview", dur: DUR });
  const keep = STORY ? Math.min(STORY.idx, scenes.length - 1) : 0;
  const playing = STORY ? STORY.playing : true;
  STORY = { scenes, idx: keep, playing, timer: null };
  $("scrubDots").innerHTML = scenes.map((_, i) => `<div class="dot" data-i="${i}"></div>`).join("");
  $("scrubDots").querySelectorAll(".dot").forEach(d => d.onclick = () => playScene(+d.dataset.i));
  playScene(STORY.idx);
}
function playScene(i) {
  if (!STORY || UI.mode !== "present") return;
  STORY.idx = (i + STORY.scenes.length) % STORY.scenes.length;
  const sc = STORY.scenes[STORY.idx], dur = sc.dur / SPEED;
  renderScene(sc);
  $("scrubDots").querySelectorAll(".dot").forEach((d, k) => d.classList.toggle("on", k === STORY.idx));
  const bar = $("scrubBar"); bar.style.transition = "none"; bar.style.width = "0%";
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${dur}ms linear`; bar.style.width = "100%"; }));
  clearTimeout(STORY.timer);
  if (STORY.playing) STORY.timer = setTimeout(() => playScene(STORY.idx + 1), dur);
}
function togglePlay() {
  if (!STORY) return; STORY.playing = !STORY.playing;
  if (STORY.playing) playScene(STORY.idx); else { clearTimeout(STORY.timer); $("scrubBar").style.transition = "none"; }
}

function renderScene(sc) {
  const M = MODEL, panel = $("panel");
  $("tlTitle").textContent = "Project timeline"; $("tlNote").textContent = "by team · each bar = one phase";
  let html = "", opts = {};
  if (sc.kind === "overview") {
    const teamsHit = [...new Set(M.overdue.map(t => t.teamName))];
    html = `<div class="ph fadeUp"><div class="kicker blue">Today · ${fmt(M.today, { weekday: "long", day: "2-digit", month: "short" })}</div>
      <h2>Where we stand</h2>
      <div class="three"><div class="${M.overdue.length ? "r" : "g"}"><b>${M.overdue.length}</b><span>overdue</span></div><div class="${M.impacted.length ? "a" : "g"}"><b>${M.impacted.length}</b><span>impacted tasks</span></div><div><b>${M.dueSoon.length}</b><span>due this week</span></div></div>
      <div class="verdict ${M.glSlip ? "risk" : "safe"}">${M.glSlip ? `Go-Live slips +${M.glSlip} working days` : `Go-Live holds on ${fmt(M.gl.F)}`}</div>
      <div class="impact">${teamsHit.length ? `Teams with overdue work: ${teamsHit.map(t => `<span class="teamtag" style="background:${teamColor(t)}33">${esc(t)}</span>`).join("")}` : "No team has overdue work."}</div>
      <div class="ask">Red circles on the timeline show <b>where</b> work is overdue.</div></div>`;
  } else if (sc.kind === "spot") {
    const t = sc.t, i = t.impact, cls = i.hitGL ? "" : i.leaves ? "amber" : "grey";
    const held = i.list.slice().sort((a, b) => b.ev.slip - a.ev.slip);
    const preds = t.deps.map(x => M.byNum[x.id]).filter(Boolean);
    html = `<div class="ph fadeUp"><div class="kicker red">Risk ${sc.i + 1} of ${sc.n}${sc.total > sc.n ? ` (top ${sc.n} of ${sc.total})` : ""} · #${t.num}</div>
      <h2>${esc(t.name)}</h2>
      <div class="statrow">
        <div class="bigLate ${cls}"><b>${t.lateDays}</b><span>working days<br>late</span></div>
        <div class="mini"><span>Planned finish</span><b>${fmt(t.F)}</b></div>
        <div class="mini"><span>Progress</span><b>${Math.round(t.pct * 100)}%</b></div>
      </div>
      <div class="sec"><div class="secT"><span class="teamtag">${esc(t.teamName)}</span>Owners (${t.owners.length || 0})</div>
        <div class="names">${t.owners.length ? t.owners.map(o => `<span>${esc(o)}</span>`).join("") : "<span class='un'>Not assigned in the plan</span>"}</div></div>
      <div class="sec"><div class="secT">Impacted tasks (${i.leaves})</div>
        ${held.length ? held.slice(0, 9).map(h => `<div class="hl"><b>#${h.num}</b><span>${esc(short(h.name, 40))}</span><em>${esc(h.teamName)}</em><i>+${h.ev.slip}d</i></div>`).join("") + (held.length > 9 ? `<div class="hl"><span>+${held.length - 9} more</span></div>` : "") : `<div class="hl"><span><b>Nobody is waiting</b> on this task — no impacted tasks.</span></div>`}
        ${preds.length ? `<div class="secT" style="margin-top:.5rem">Waiting for</div><div class="hl"><span>${preds.map(p => "#" + p.num + " " + esc(short(p.name, 28))).join(" · ")}</span></div>` : ""}</div>
      ${t.notes ? `<div class="note">📝 ${esc(short(t.notes.replace(/\s+/g, " "), 170))}</div>` : ""}
      <div class="verdict ${i.hitGL ? "risk" : "safe"}">${i.hitGL ? `Go-Live at risk · +${M.glSlip} working days` : `Go-Live stays on ${fmt(M.gl.F)}`}</div>
      <div class="ask">Please finish by <b>${fmt(addWd(M.today, 1), { weekday: "short", day: "2-digit", month: "short" })}</b></div></div>`;
    const ids = i.ids; opts = { focus: ids, edges: traceEdges(M, ids), pulse: t, zoom: true };
    $("tlNote").textContent = `zoomed in on #${t.num} and what it affects`;
  } else if (sc.kind === "landing") {
    const bad = M.glSlip > 0, best = scenario === "best" ? M : ALT, pace = scenario === "pace" ? M : ALT;
    html = `<div class="ph fadeUp"><div class="kicker ${bad ? "red" : "green"}">Go-Live outlook</div>
      <div class="dates"><span>${fmt(M.gl.F)}</span><span class="a">→</span><span class="b ${bad ? "bad" : "ok"}">${fmt(M.gl.ev.pF)}</span></div>
      <div class="verdict ${bad ? "risk" : "safe"}">${bad ? `Slips +${M.glSlip} working days` : "Go-Live date holds"}</div>
      <div class="rowline ${best.glSlip ? "red" : ""}"><span>Best case</span><span class="r">${best.glSlip ? "+" + best.glSlip + " wd · " + fmt(best.gl.ev.pF) : "On track"}</span></div>
      <div class="rowline ${pace.glSlip ? "red" : ""}"><span>At current pace</span><span class="r">${pace.glSlip ? "+" + pace.glSlip + " wd · " + fmt(pace.gl.ev.pF) : "On track"}</span></div></div>`;
  } else if (sc.kind === "impacted") {
    const list = M.impacted;
    html = `<div class="ph fadeUp"><div class="kicker amber">Impacted tasks</div><h2>${list.length} task${list.length === 1 ? "" : "s"} pushed by a late predecessor</h2>` +
      list.slice(0, 8).map(t => { const d = t.deps.map(x => M.byNum[x.id]).filter(p => p && p.ev.slip > 0);
        const drv = t.ev.driver; const by = drv ? `#${drv.num} ${esc(short(drv.name, 26))}` : (d.map(p => "#" + p.num).join(", ") || "a late predecessor");
        return `<div class="hl" style="font-size:.95rem"><b>#${t.num}</b><span>${esc(short(t.name, 32))}<br><span style="font-size:.74rem;color:var(--muted);font-weight:600">pushed by ${by} · ${esc(t.teamName)}</span></span><i>+${t.ev.slip}d</i></div>`; }).join("") +
      (list.length > 8 ? `<div class="hl"><span>+${list.length - 8} more</span></div>` : "") +
      `<div class="ask">These have not started slipping on their own — fixing the predecessor fixes these too.</div></div>`;
    const ids = new Set(list.map(t => t.num).concat(list.flatMap(t => t.deps.map(d => d.id))));
    opts = { focus: ids };
    $("tlNote").textContent = `${list.length} impacted tasks, pushed by a late predecessor`;
  } else if (sc.kind === "week") {
    const days = []; for (let k = 0; k <= 7; k++) { const d = M.today + k; if (!isWk(d) && M.dueSoon.some(t => t.F === d)) days.push(d); }
    html = `<div class="ph fadeUp"><div class="kicker blue">Due this week</div><h2>${M.dueSoon.length} task${M.dueSoon.length === 1 ? "" : "s"} coming up</h2><div>` +
      (days.length ? days.map(d => { const its = M.dueSoon.filter(t => t.F === d); const dim = its.length > 5 ? .78 : .9;
        return `<div class="dayrow"><div class="dl">${d === M.today ? "Today" : fmt(d, { weekday: "short" })}<small>${fmt(d)}</small></div><div class="dt" style="font-size:${dim}rem">${its.map(t => `<div>${t.pct === 0 ? "○" : "◐"} <b>#${t.num}</b> ${esc(short(t.name, 34))} <span style="color:var(--muted)">· ${esc(t.owners[0] || "unassigned")}${t.owners.length > 1 ? " +" + (t.owners.length - 1) : ""}</span></div>`).join("")}</div><div class="cnt">${its.length}</div></div>`; }).join("") : `<div class="impact">Nothing falls due in the next 7 days.</div>`) + `</div></div>`;
  } else if (sc.kind === "owners") {
    const byPerson = {}; M.overdue.forEach(t => (t.owners.length ? t.owners : ["Unassigned"]).forEach(o => (byPerson[o] = byPerson[o] || []).push(t)));
    const people = Object.entries(byPerson).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    html = `<div class="ph fadeUp"><div class="kicker red">Who needs to act · ${people.length} ${people.length === 1 ? "person" : "people"}</div><h2>Finish by ${fmt(addWd(M.today, 1), { weekday: "long", day: "2-digit", month: "short" })}</h2>
      <div class="names" style="gap:.35rem">` +
      people.map(([name, ts]) => `<span style="font-size:${people.length > 14 ? ".78rem" : ".9rem"}">${esc(name)} <b style="color:${ts.some(t => t.impact.hitGL) ? "var(--red)" : "inherit"}">${ts.map(t => "#" + t.num).join(" ")}</b></span>`).join("") + `</div>` +
      M.overdue.map(t => `<div class="rowline ${t.impact.hitGL ? "red" : t.impact.leaves ? "amber" : ""}"><b>#${t.num}</b><span style="font-weight:600">${esc(short(t.name, 30))}</span><span class="r" style="font-weight:700;color:var(--muted)">${esc(t.teamName)}</span></div>`).join("") + `</div>`;
  }
  panel.innerHTML = html;
  fitPanel();
  drawTimeline(opts);
}
/* shrink the scene content until it fits inside the panel, so nothing ever bleeds past the card edge */
function fitPanel() {
  const panel = $("panel"), ph = panel.querySelector(".ph"); if (!ph) return;
  const cs = getComputedStyle(panel);
  const avail = panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  ph.style.zoom = 1;
  let z = 1;
  while (ph.getBoundingClientRect().height > avail && z > 0.5) { z = Math.round((z - 0.04) * 100) / 100; ph.style.zoom = z; }
  panel.classList.toggle("top", ph.getBoundingClientRect().height > avail * 0.96);
}

/* ======================= INTERACT MODE ======================= */
function renderTeamFilter() {
  const M = MODEL; if (!M) return;
  $("teamFilter").innerHTML = `<button data-t="" class="${UI.team ? "" : "on"}">All teams</button>` + M.teams.map(t => `<button data-t="${esc(t)}" class="${UI.team === t ? "on" : ""}">${esc(t)}</button>`).join("");
  $("teamFilter").querySelectorAll("button").forEach(b => b.onclick = () => { UI.team = b.dataset.t || null; renderInteract(); });
}
function renderInteract() {
  const M = MODEL; if (!M) return;
  renderTeamFilter();
  $("panel").classList.remove("top");
  $("tlTitle").textContent = "Project timeline"; $("tlNote").textContent = "click a phase to expand · click a task to trace its impact";
  const od = M.overdue, due = M.dueSoon;
  const impTag = t => t.impact.hitGL ? `<span class="tag red">Go-Live</span>` : t.impact.leaves ? `<span class="tag amber">${t.impact.leaves} impacted</span>` : `<span class="tag grey">isolated</span>`;
  const row = (t, tag) => `<div class="lrow ${UI.sel && UI.sel.num === t.num ? "sel" : ""}" data-task="${t.num}"><span class="num">#${t.num}</span><div class="mid"><b>${esc(t.name)}</b><small>${esc(t.teamName)} · ${esc(ownerTxt(t, 1))}</small></div>${tag}</div>`;
  let html = `<div id="lists"><div class="ihead">🔴 Overdue <small>${od.length}</small></div>` +
    (od.length ? od.map(t => row(t, `<span class="tag red" style="margin-right:.2rem">${t.lateDays}d late</span>` + impTag(t))).join("") : `<div class="lrow"><div class="mid"><b>All clear</b></div></div>`) +
    (M.impacted.length ? `<div class="ihead" style="margin-top:.7rem">🟠 Impacted tasks <small>${M.impacted.length}</small></div>` + M.impacted.map(t => row(t, `<span class="tag amber">+${t.ev.slip}d</span>`)).join("") : "") +
    `<div class="ihead" style="margin-top:.7rem">📅 Due this week <small>${due.length}</small></div>`;
  let last = null;
  due.forEach(t => { if (t.F !== last) { last = t.F; html += `<div class="dgroup">${t.F === M.today ? "Today" : fmt(t.F, { weekday: "long" })} · ${fmt(t.F)}</div>`; }
    const risky = t.state === "impacted" || (t.pct === 0 && wdDiff(M.today, t.F) <= 2);
    html += row(t, `<span class="tag ${risky ? "red" : t.state === "behind" || t.pct === 0 ? "amber" : "green"}">${Math.round(t.pct * 100)}%</span>`); });
  html += `</div><div id="detail"></div>`;
  $("panel").innerHTML = html;
  $("panel").style.justifyContent = "flex-start";
  $("panel").querySelectorAll("[data-task]").forEach(el => el.onclick = () => selectTask(+el.dataset.task));
  renderDetail();
  drawInteract();
}
function drawInteract() {
  const M = MODEL, sel = UI.sel;
  if (!sel) { drawTimeline({}); wireGantt(); return; }
  const ids = downstream(M, sel);
  drawTimeline({ focus: ids, edges: traceEdges(M, ids), pulse: sel.state === "overdue" ? sel : null });
  wireGantt();
}
function wireGantt() {
  $("gantt").querySelectorAll("[data-phase]").forEach(el => el.onclick = () => { const n = +el.dataset.phase; UI.expanded.has(n) ? UI.expanded.delete(n) : UI.expanded.add(n); drawInteract(); });
  $("gantt").querySelectorAll("[data-task]").forEach(el => el.onclick = () => selectTask(+el.dataset.task));
}
function selectTask(n) {
  const t = MODEL.byNum[n]; if (!t) return;
  UI.sel = (UI.sel && UI.sel.num === n) ? null : t;
  if (UI.sel && UI.sel.leaf) UI.expanded.add(UI.sel.phase.num);
  renderInteract();
}
function renderDetail() {
  const d = $("detail"); if (!d) return; const t = UI.sel;
  if (!t) { d.style.display = "none"; return; }
  d.style.display = "block"; const M = MODEL;
  const preds = t.deps.map(x => M.byNum[x.id]).filter(Boolean), succ = t.succ.filter(s => s !== t.parent);
  const list = (arr, f) => arr.length ? arr.slice(0, 5).map(f).join("<br>") + (arr.length > 5 ? `<br>+${arr.length - 5} more` : "") : "–";
  d.innerHTML = `<h3><span><span class="num" style="background:#141414;color:#fff;border-radius:.25rem;padding:0 .3rem;font-size:.7rem">#${t.num}</span> ${esc(t.name)}</span><button onclick="selectTask(${t.num})" title="Close">✕</button></h3>
    <div class="kv"><span>Team</span><span>${esc(t.teamName)}</span><span>Owners</span><span>${esc(t.owners.join(", ") || "Not assigned")}</span>
    <span>Planned</span><span>${fmt(t.S)} → ${fmt(t.F)}</span><span>Projected</span><span style="${t.ev.slip ? "color:var(--red);font-weight:800" : ""}">${fmt(t.ev.pS)} → ${fmt(t.ev.pF)}${t.ev.slip ? " (+" + t.ev.slip + " wd)" : ""}</span>
    <span>Progress</span><span>${Math.round(t.pct * 100)}% · ${esc(t.state || "phase")}</span>
    <span>Waits for</span><span>${list(preds, p => "#" + p.num + " " + esc(short(p.name, 32)))}</span>
    <span>Feeds</span><span>${list(succ, s => "#" + s.num + " " + esc(short(s.name, 32)))}</span>
    ${t.notes ? `<span>Notes</span><span>${esc(short(t.notes, 220))}</span>` : ""}</div>`;
}
