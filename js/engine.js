"use strict";
/* Schedule + risk engine. Pure functions: tasks in, model out. Honours FS / SS / FF dependencies with lag.
   A delay only moves a successor when it eats the slack between them. */

const TEAM_FALLBACK = { "Marketing Brochure": "Marketing", "Car Designer Tool": "Car Designer" };
const TEAM_COLORS = ["#7aa2ff", "#4cc39a", "#f2b84b", "#a98bf0", "#f08a5d", "#4fb7d9", "#8fcf4f", "#e57bb0"];
const teamColor = (() => { const m = {}; let i = 0; return n => m[n] || (m[n] = TEAM_COLORS[i++ % TEAM_COLORS.length]); })();

function todayDay() {
  if (isISO(SETTINGS.todayOverride)) return toDay(SETTINGS.todayOverride);
  return toDay(new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10));
}

function buildModel(data, scen) {
  const today = todayDay();
  const behindFrac = clamp(SETTINGS.behindPct, 0, 100, 25) / 100;
  const T = data.tasks.map(t => Object.assign({}, t, { S: toDay(t.start), F: toDay(t.finish) }));
  const byNum = {}, byOutline = {};
  T.forEach(t => { byNum[t.num] = t; byOutline[t.outline] = t; });
  T.forEach(t => { t.dur = Math.max(1, wdDiff(t.S, t.F) + 1); t.kids = []; t.succ = []; });
  T.forEach(t => { const i = t.outline.lastIndexOf("."); if (i > 0) { const p = byOutline[t.outline.slice(0, i)]; if (p) { t.parent = p; p.kids.push(t); } } });
  T.forEach(t => t.deps.forEach(d => { const p = byNum[d.id]; if (p) p.succ.push(t); }));
  T.forEach(t => { t.leaf = t.kids.length === 0; t.top = !t.parent; });
  T.forEach(t => { let p = t; while (p.parent) p = p.parent; t.phase = p; });
  T.filter(t => t.top).forEach(p => { p.teamName = p.team || TEAM_FALLBACK[p.name] || p.name.split(" ")[0] || "Team"; });
  T.forEach(t => { t.teamName = t.team || t.phase.teamName; });
  T.forEach(t => { if (t.parent) t.succ.push(t.parent); });

  const memo = {}, busy = new Set(), today0 = nextWd(today);
  function ev(t) {
    if (memo[t.num]) return memo[t.num];
    if (busy.has(t.num)) return { pS: t.S, pF: t.F, slip: 0, sSlip: 0 };
    busy.add(t.num);
    let n;
    if (!t.leaf) {
      const ks = t.kids.map(ev);
      const pS = Math.min(...ks.map(k => k.pS)), pF = Math.max(...ks.map(k => k.pF));
      let drv = null, best = -1e9; t.kids.forEach((k, i) => { if (ks[i].pF > best) { best = ks[i].pF; drv = k; } });
      const slip = Math.max(0, wdDiff(t.F, pF));
      n = { pS, pF, slip, sSlip: Math.max(0, wdDiff(t.S, pS)), driver: slip > 0 ? drv : null, own: 0 };
      n.root = slip > 0 && drv ? (memo[drv.num] && memo[drv.num].root) || ev(drv).root : null;
    } else {
      let pS = t.S, pF = t.F, own = 0, drv = null, bestShift = 0;
      const done = t.pct >= 0.999;
      if (!done) {
        const remPace = Math.min(t.dur, Math.max(1, Math.ceil((1 - t.pct) * t.dur)));
        if (t.F < today) { const c = addWd(today0, (scen === "best" ? 1 : remPace) - 1); if (c > pF) { pF = c; own = 1; } }
        else if (scen === "pace" && t.S <= today) { const c = addWd(today0, remPace - 1); if (c > pF) { pF = c; own = 1; } }
        let newS = pS, newF = pF;
        t.deps.forEach(d => {
          const p = byNum[d.id]; if (!p) return; const pe = ev(p);
          let planC, projC, isStart = true;
          if (d.type === "FS") { planC = addWd(p.F, 1 + d.lag); projC = addWd(pe.pF, 1 + d.lag); }
          else if (d.type === "SS") { planC = addWd(p.S, d.lag); projC = addWd(pe.pS, d.lag); }
          else if (d.type === "FF") { planC = addWd(p.F, d.lag); projC = addWd(pe.pF, d.lag); isStart = false; }
          else return;
          if (projC <= planC) return;
          const shift = wdDiff(planC, projC);
          let cand;
          if (isStart) { if (t.pct > 0) return; cand = planC <= t.S ? Math.max(t.S, projC) : addWd(t.S, shift); if (cand > newS) newS = cand; }
          else { cand = planC <= t.F ? Math.max(t.F, projC) : addWd(t.F, shift); if (cand > newF) newF = cand; }
          const eff = wdDiff(isStart ? t.S : t.F, cand);
          if (eff > bestShift) { bestShift = eff; drv = p; }
        });
        if (newS > pS) { pS = newS; newF = Math.max(newF, addWd(pS, t.dur - 1)); }
        if (newF > pF) pF = newF;
      }
      const slip = Math.max(0, wdDiff(t.F, pF));
      n = { pS, pF, slip, sSlip: Math.max(0, wdDiff(t.S, pS)), driver: slip > 0 && !own ? drv : null, own: own && slip > 0 ? 1 : 0 };
      n.root = n.own ? t : (n.driver ? ev(n.driver).root : null);
    }
    busy.delete(t.num); memo[t.num] = n; t.ev = n; return n;
  }
  T.forEach(ev);

  T.forEach(t => {
    if (!t.leaf) return;
    const elapsed = t.S > today ? 0 : Math.min(1, (wdDiff(t.S, Math.min(today, t.F)) + 1) / t.dur);
    t.expected = elapsed;
    if (t.pct >= 0.999) t.state = "done";
    else if (t.F < today) { t.state = "overdue"; t.lateDays = Math.max(1, wdDiff(t.F, today)); }
    else if (t.ev.slip > 0 && t.ev.own) t.state = "behind";        // slipping on its own pace
    else if (t.ev.slip > 0) t.state = "impacted";                   // pushed by a late predecessor
    else if (t.S <= today && t.pct < elapsed - behindFrac) t.state = "behind";
    else if (t.S <= today) t.state = "active";
    else t.state = "upcoming";
  });

  const gl = T.reduce((a, b) => (b.F > a.F || (b.F === a.F && b.num > a.num)) ? b : a);
  const glSlip = gl.ev.slip;

  const reach = r => {
    const seen = new Set([r.num]), q = [r]; let leaves = 0, hitGL = false; const list = [];
    while (q.length) { const x = q.shift(); x.succ.forEach(s => { if (seen.has(s.num) || s.ev.slip <= 0) return; seen.add(s.num); q.push(s); if (s.leaf) { leaves++; list.push(s); } if (s === gl) hitGL = true; }); }
    return { leaves, hitGL, ids: seen, list };
  };
  T.filter(t => t.state === "overdue").forEach(t => { t.impact = reach(t); });

  const chain = []; for (let x = gl, g = 0; x && g < 200; x = x.ev.driver, g++) chain.push(x);
  const chainSet = new Set(chain.map(c => c.num));

  const teams = [...new Set(T.filter(t => t.top).map(t => t.teamName))];
  const teamStart = tm => Math.min(...T.filter(t => t.top && t.teamName === tm).map(t => t.S));
  teams.sort((a, b) => teamStart(a) - teamStart(b));
  const phases = [];
  teams.forEach(tm => T.filter(t => t.top && t.teamName === tm).sort((a, b) => a.S - b.S).forEach(p => phases.push(p)));

  return { T, byNum, today, gl, glSlip, chain, chainSet, scen, teams, phases };
}

const ownerTxt = (t, n = 2) => !t.owners.length ? "Owner not assigned" : t.owners.slice(0, n).join(", ") + (t.owners.length > n ? ` +${t.owners.length - n}` : "");
const rankOverdue = (a, b) => (b.impact.hitGL - a.impact.hitGL) || (b.impact.leaves - a.impact.leaves) || (b.lateDays - a.lateDays);
const downstream = (M, t) => { const seen = new Set([t.num]), q = [t]; while (q.length) { const x = q.shift(); x.succ.forEach(s => { if (!seen.has(s.num)) { seen.add(s.num); q.push(s); } }); } return seen; };
function traceEdges(M, ids) {
  const out = [];
  ids.forEach(sn => { const s = M.byNum[sn]; s.deps.forEach(d => { if (ids.has(d.id)) { const p = M.byNum[d.id]; out.push({ p, s, kind: (p.ev.slip > 0 && s.ev.slip > 0) ? "r" : "n" }); } }); });
  return out;
}
