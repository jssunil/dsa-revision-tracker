/* DSA Revision Tracker — plan model (data/plan.json) and migrations.
 *
 * The plan is WHAT to study; data/progress.json is WHAT YOU DID. See docs/DESIGN.md §1.
 *
 *   plan = { schemaVersion:2, meta, phases:[{id,title}], concepts:{id:{…}}, days:[{…}], problems:{id:{…}} }
 *
 * Days are an ordered array: "Day N" is the 1-based position, never stored. Day ids are stable
 * ("1".."60" for the original plan, "d-<base36>" for new ones) so reordering keeps progress attached.
 *
 * Pure functions, shared by the browser (window.DSA_PLAN) and Node (require).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DSA_PLAN = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCHEMA = 2;
  var KINDS = { new: "New pattern", rev: "Revision", mock: "Mock", cap: "Capstone", buf: "Buffer", custom: "Custom" };

  function slugify(s) {
    return String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }
  // `base` made unique against keys of `taken` by appending -2, -3, …
  function uniqueKey(base, taken) {
    if (!taken[base]) return base;
    for (var i = 2; ; i++) if (!taken[base + "-" + i]) return base + "-" + i;
  }
  function nowIso() { return new Date().toISOString(); }

  // ---- dates (YYYY-MM-DD strings, calendar arithmetic in UTC so DST never shifts a day) ----
  function addDays(ymd, n) {
    var t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) + n * 864e5;
    return new Date(t).toISOString().slice(0, 10);
  }
  function diffDays(a, b) {   // b - a in days
    function t(x) { return Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)); }
    return Math.round((t(b) - t(a)) / 864e5);
  }
  function localYmd(date) {
    date = date || new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate());
  }

  // ---- empty docs ----
  function emptyPlan() {
    return { schemaVersion: SCHEMA, meta: { title: "DSA Revision Tracker", subtitle: "", startDate: null, timeZone: null },
      phases: [], concepts: {}, days: [], problems: {} };
  }
  function emptyProgress() {
    return { schemaVersion: SCHEMA, updatedAt: null, days: {}, problems: {}, revisions: {}, srs: {}, concepts: {} };
  }
  function normalizePlan(p) {
    p = p || emptyPlan();
    p.schemaVersion = p.schemaVersion || SCHEMA;
    p.meta = p.meta || {}; p.phases = p.phases || []; p.concepts = p.concepts || {};
    p.days = p.days || []; p.problems = p.problems || {};
    p.days.forEach(function (d) { d.conceptIds = d.conceptIds || []; d.problemIds = d.problemIds || []; });
    Object.keys(p.problems).forEach(function (k) { var x = p.problems[k]; x.conceptIds = x.conceptIds || []; x.verification = x.verification || { status: "unverified" }; });
    return p;
  }
  function normalizeProgress(p) {
    p = p || emptyProgress();
    p.days = p.days || {}; p.problems = p.problems || {}; p.revisions = p.revisions || {};
    p.srs = p.srs || {}; p.concepts = p.concepts || {};
    return p;
  }

  // ---- migration: catalog.js (v1) -> plan.json (v2) ----
  function fromCatalog(catalog) {
    var plan = emptyPlan();
    plan.meta.title = catalog.meta && catalog.meta.title || plan.meta.title;
    plan.meta.subtitle = catalog.meta && catalog.meta.subtitle || "";
    var phaseSeen = {};
    catalog.days.forEach(function (cd) {
      var pid = "p" + cd.phaseIdx;
      if (!phaseSeen[pid]) { phaseSeen[pid] = true; plan.phases.push({ id: pid, title: cd.phase }); }
      var conceptIds = [];
      if (cd.tag === "new" || cd.tag === "cap") {
        var cid = slugify(cd.pattern);
        if (!plan.concepts[cid]) {
          plan.concepts[cid] = { id: cid, name: cd.pattern, summary: cd.focus || "", triggers: [], leetcodeTags: [], source: "builtin", createdAt: null };
        }
        conceptIds.push(cid);
      }
      plan.days.push({
        id: String(cd.d), phaseId: pid, kind: cd.tag || "custom", title: cd.pattern,
        conceptIds: conceptIds, problemIds: (cd.problems || []).map(function (p) { return p.slug; }),
        focus: cd.focus || "", note: cd.note || "", plannedDate: null
      });
      (cd.problems || []).forEach(function (pr) {
        if (plan.problems[pr.slug]) return;                       // first listing is the problem's home
        plan.problems[pr.slug] = {
          id: pr.slug, kind: "leetcode", slug: pr.slug, url: "https://leetcode.com/problems/" + pr.slug + "/",
          title: pr.title, diff: pr.diff, conceptIds: conceptIds.slice(), source: "builtin", addedAt: null,
          verification: { status: "builtin" }
        };
      });
    });
    return plan;
  }
  // v1 progress -> v2 (keys unchanged; adds the new sections). Idempotent.
  function migrateProgress(progress) {
    progress = normalizeProgress(progress);
    progress.schemaVersion = SCHEMA;
    return progress;
  }

  // ---- lookups ----
  function dayIndex(plan, dayId) {
    for (var i = 0; i < plan.days.length; i++) if (plan.days[i].id === String(dayId)) return i;
    return -1;
  }
  function dayById(plan, dayId) { var i = dayIndex(plan, dayId); return i < 0 ? null : plan.days[i]; }
  function dayNumber(plan, dayId) { return dayIndex(plan, dayId) + 1; }
  function phaseById(plan, id) { return plan.phases.filter(function (p) { return p.id === id; })[0] || null; }
  function plannedDate(plan, day) {
    if (day.plannedDate) return day.plannedDate;
    if (!plan.meta.startDate) return null;
    return addDays(plan.meta.startDate, dayIndex(plan, day.id));
  }
  // days whose schedule covers a concept
  function conceptDays(plan, cid) {
    return plan.days.filter(function (d) { return d.conceptIds.indexOf(cid) > -1; });
  }
  // problems that train a concept, in schedule order, then by date added
  function conceptProblems(plan, cid) {
    var order = {}, n = 0;
    plan.days.forEach(function (d) { d.problemIds.forEach(function (pid) { if (!(pid in order)) order[pid] = n++; }); });
    return Object.keys(plan.problems).map(function (k) { return plan.problems[k]; })
      .filter(function (p) { return p.conceptIds.indexOf(cid) > -1; })
      .sort(function (a, b) {
        var oa = a.id in order ? order[a.id] : 1e9, ob = b.id in order ? order[b.id] : 1e9;
        return oa - ob || String(a.addedAt || "").localeCompare(String(b.addedAt || ""));
      });
  }
  function problemDays(plan, pid) { return plan.days.filter(function (d) { return d.problemIds.indexOf(pid) > -1; }); }
  function homeConcept(plan, pid) {
    var p = plan.problems[pid];
    return p && p.conceptIds[0] ? plan.concepts[p.conceptIds[0]] || null : null;
  }
  function problemUrl(p) {
    if (!p) return null;
    if (p.kind === "leetcode") return p.url || "https://leetcode.com/problems/" + p.slug + "/";
    return p.url || null;
  }
  // concepts in schedule order (first day that covers them), then the rest by name
  function conceptsOrdered(plan) {
    var seen = {}, out = [];
    plan.days.forEach(function (d) { d.conceptIds.forEach(function (c) { if (!seen[c] && plan.concepts[c]) { seen[c] = true; out.push(plan.concepts[c]); } }); });
    Object.keys(plan.concepts).sort(function (a, b) { return plan.concepts[a].name.localeCompare(plan.concepts[b].name); })
      .forEach(function (c) { if (!seen[c]) out.push(plan.concepts[c]); });
    return out;
  }

  // ---- LeetCode input parsing ----
  // Accepts a problem URL (leetcode.com / leetcode.cn, any sub-path) or a bare slug. Returns the slug or null.
  function parseLeetCode(input) {
    var s = String(input || "").trim();
    var m = /leetcode\.(?:com|cn)\/(?:problems|problemset\/[^/]+\/problems)\/([a-z0-9-]+)/i.exec(s);
    if (m) return m[1].toLowerCase();
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(s)) return s.toLowerCase();
    return null;
  }
  function titleFromSlug(slug) {
    return slug.split("-").map(function (w) { return w ? w[0].toUpperCase() + w.slice(1) : w; }).join(" ");
  }

  // ---- mutations (return what changed so the caller can mark it dirty) ----
  function addConcept(plan, c) {
    var id = uniqueKey(slugify(c.name) || "concept", plan.concepts);
    plan.concepts[id] = {
      id: id, name: c.name.trim(), summary: c.summary || "", triggers: c.triggers || [], leetcodeTags: c.leetcodeTags || [],
      source: "custom", createdAt: nowIso()
    };
    return plan.concepts[id];
  }
  // opts: { afterDayId } | { phaseId } (append to phase) | {} (append at end)
  function addDay(plan, d, opts) {
    opts = opts || {};
    var day = {
      id: newId("d-"), phaseId: d.phaseId || (plan.phases[plan.phases.length - 1] || {}).id || null,
      kind: d.kind || "custom", title: d.title || "New day", conceptIds: d.conceptIds || [], problemIds: d.problemIds || [],
      focus: d.focus || "", note: d.note || "", plannedDate: d.plannedDate || null
    };
    var at = plan.days.length;
    if (opts.afterDayId != null) {
      var i = dayIndex(plan, opts.afterDayId);
      if (i > -1) { at = i + 1; day.phaseId = d.phaseId || plan.days[i].phaseId; }
    } else if (opts.phaseId) {
      day.phaseId = opts.phaseId;
      for (var k = plan.days.length - 1; k >= 0; k--) if (plan.days[k].phaseId === opts.phaseId) { at = k + 1; break; }
    }
    plan.days.splice(at, 0, day);
    return day;
  }
  // move within the array; crossing into a neighbouring phase adopts that phase
  function moveDay(plan, dayId, delta) {
    var i = dayIndex(plan, dayId), j = i + delta;
    if (i < 0 || j < 0 || j >= plan.days.length) return false;
    var d = plan.days.splice(i, 1)[0];
    plan.days.splice(j, 0, d);
    var neighbour = plan.days[j + (delta > 0 ? -1 : 1)];
    if (neighbour && neighbour.phaseId !== d.phaseId) d.phaseId = neighbour.phaseId;
    return true;
  }
  function deleteDay(plan, dayId) {
    var i = dayIndex(plan, dayId);
    if (i < 0) return null;
    return plan.days.splice(i, 1)[0];
  }
  // removes the concept and every reference to it; returns ids of touched days/problems
  function deleteConcept(plan, cid) {
    var touched = { days: [], problems: [] };
    delete plan.concepts[cid];
    plan.days.forEach(function (d) {
      var i = d.conceptIds.indexOf(cid);
      if (i > -1) { d.conceptIds.splice(i, 1); touched.days.push(d.id); }
    });
    Object.keys(plan.problems).forEach(function (k) {
      var p = plan.problems[k], i = p.conceptIds.indexOf(cid);
      if (i > -1) { p.conceptIds.splice(i, 1); touched.problems.push(k); }
    });
    return touched;
  }
  // p: { kind:"leetcode", slug, title?, diff? } | { kind:"custom", title, diff, url?, statement? }
  // opts: { conceptId, dayId }. An existing LeetCode problem is reused (and linked to the concept/day).
  function addProblem(plan, p, opts) {
    opts = opts || {};
    var prob;
    if (p.kind === "leetcode" && plan.problems[p.slug]) {
      prob = plan.problems[p.slug];
    } else {
      var id = p.kind === "leetcode" ? p.slug : uniqueKey("custom-" + (slugify(p.title) || "problem"), plan.problems);
      prob = plan.problems[id] = {
        id: id, kind: p.kind, title: p.title || (p.slug ? titleFromSlug(p.slug) : "Untitled"), diff: p.diff || "M",
        conceptIds: [], source: "custom", addedAt: nowIso(), verification: p.verification || { status: "unverified" }
      };
      if (p.kind === "leetcode") { prob.slug = p.slug; prob.url = "https://leetcode.com/problems/" + p.slug + "/"; }
      else { prob.url = p.url || null; prob.statement = p.statement || ""; }
    }
    if (opts.conceptId && prob.conceptIds.indexOf(opts.conceptId) < 0) prob.conceptIds.push(opts.conceptId);
    if (opts.dayId != null) {
      var d = dayById(plan, opts.dayId);
      if (d && d.problemIds.indexOf(prob.id) < 0) d.problemIds.push(prob.id);
    }
    return prob;
  }
  function removeProblemFromDay(plan, dayId, pid) {
    var d = dayById(plan, dayId);
    if (!d) return false;
    var i = d.problemIds.indexOf(pid);
    if (i > -1) d.problemIds.splice(i, 1);
    return i > -1;
  }
  // drop a problem from the plan entirely (progress, solutions and files are kept)
  function deleteProblem(plan, pid) {
    var days = [];
    plan.days.forEach(function (d) { var i = d.problemIds.indexOf(pid); if (i > -1) { d.problemIds.splice(i, 1); days.push(d.id); } });
    var p = plan.problems[pid];
    delete plan.problems[pid];
    return { problem: p, days: days };
  }

  // ---- progress figures (used by bars and the dashboard) ----
  function stats(plan, progress, dayMinutes) {
    var probIds = {};
    plan.days.forEach(function (d) { d.problemIds.forEach(function (pid) { if (plan.problems[pid]) probIds[pid] = true; }); });
    Object.keys(plan.problems).forEach(function (pid) { probIds[pid] = true; });
    var ids = Object.keys(probIds);
    var solved = 0, review = 0, verified = 0;
    ids.forEach(function (pid) {
      var st = (progress.problems[pid] || {}).status;
      if (st === "solved") solved++; else if (st === "review") review++;
      var v = (plan.problems[pid].verification || {}).status;
      if (v === "verified" || v === "builtin" || v === "overridden") verified++;
    });
    var daysDone = plan.days.filter(function (d) { return progress.days[d.id] && progress.days[d.id].done; }).length;
    var concepts = Object.keys(plan.concepts);
    var conceptsDone = concepts.filter(function (cid) {
      var ds = conceptDays(plan, cid);
      return ds.length && ds.every(function (d) { return progress.days[d.id] && progress.days[d.id].done; });
    }).length;
    var minutes = dayMinutes ? plan.days.reduce(function (t, d) { return t + dayMinutes(progress.days[d.id]); }, 0) : 0;
    return { problems: ids.length, solved: solved, review: review, verified: verified,
      days: plan.days.length, daysDone: daysDone, concepts: concepts.length, conceptsDone: conceptsDone, minutes: minutes };
  }
  // solved / total over a list of problem ids
  function solvedOf(progress, pids) {
    var s = 0;
    pids.forEach(function (pid) { if ((progress.problems[pid] || {}).status === "solved") s++; });
    return { solved: s, total: pids.length };
  }

  return {
    SCHEMA: SCHEMA, KINDS: KINDS,
    slugify: slugify, newId: newId, uniqueKey: uniqueKey, addDays: addDays, diffDays: diffDays, localYmd: localYmd,
    emptyPlan: emptyPlan, emptyProgress: emptyProgress, normalizePlan: normalizePlan, normalizeProgress: normalizeProgress,
    fromCatalog: fromCatalog, migrateProgress: migrateProgress,
    dayIndex: dayIndex, dayById: dayById, dayNumber: dayNumber, phaseById: phaseById, plannedDate: plannedDate,
    conceptDays: conceptDays, conceptProblems: conceptProblems, problemDays: problemDays, homeConcept: homeConcept,
    problemUrl: problemUrl, conceptsOrdered: conceptsOrdered,
    parseLeetCode: parseLeetCode, titleFromSlug: titleFromSlug,
    addConcept: addConcept, addDay: addDay, moveDay: moveDay, deleteDay: deleteDay, deleteConcept: deleteConcept,
    addProblem: addProblem, removeProblemFromDay: removeProblemFromDay, deleteProblem: deleteProblem,
    stats: stats, solvedOf: solvedOf
  };
});
