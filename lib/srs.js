/* DSA Revision Tracker — revision scheduling (spaced repetition on a fixed ladder).
 *
 * progress.srs["concept:<id>" | "problem:<id>"] = { step, lastReviewed:"YYYY-MM-DD" }
 * progress.revisions[revId] = { id, target:{type,id}, state:"suggested"|"accepted"|"done"|"skipped",
 *                               suggestedDate, dueDate, time, reason, createdAt, acceptedAt, completedAt,
 *                               outcome, calendar }
 *
 * Rules (docs/DESIGN.md §3.5):
 *   - ladder (days): [1, 3, 7, 14, 30, 60] by default; each target sits on a step.
 *   - learn (problem solved / day completed)  -> step 0, due lastReviewed + ladder[0]
 *   - outcome easy +2 steps, good +1, hard -1 (min 0) and due tomorrow. Problem status "review" = hard.
 *   - at most one open (suggested/accepted) revision per target; a new suggestion updates a suggested one,
 *     never an accepted one (the user chose that date).
 *   - load balancing: a date with >= maxPerDay open revisions pushes the suggestion forward (up to +2 days).
 *   - suggested dates are never in the past.
 *
 * Pure functions over a progress object (mutated in place); shared by the browser (window.DSA_SRS) and Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DSA_SRS = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULTS = { ladderDays: [1, 3, 7, 14, 30, 60], maxPerDay: 4 };
  var OPEN = { suggested: true, accepted: true };

  function addDays(ymd, n) {
    var t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) + n * 864e5;
    return new Date(t).toISOString().slice(0, 10);
  }
  function key(target) { return target.type + ":" + target.id; }
  function rules(settings) {
    var r = settings || {};
    var ladder = (r.ladderDays && r.ladderDays.length ? r.ladderDays : DEFAULTS.ladderDays).map(Number).filter(function (n) { return n > 0; });
    return { ladderDays: ladder.length ? ladder : DEFAULTS.ladderDays, maxPerDay: +r.maxPerDay > 0 ? +r.maxPerDay : DEFAULTS.maxPerDay };
  }
  function nextStep(step, outcome, ladderLen) {
    var s = step || 0;
    if (outcome === "easy") s += 2;
    else if (outcome === "hard") s = Math.max(0, s - 1);
    else s += 1;
    return Math.min(s, ladderLen - 1);
  }
  function openFor(progress, target) {
    var k = key(target);
    var ids = Object.keys(progress.revisions || {});
    for (var i = 0; i < ids.length; i++) {
      var r = progress.revisions[ids[i]];
      if (OPEN[r.state] && key(r.target) === k) return r;
    }
    return null;
  }
  function loadByDate(progress, exceptId) {
    var m = {};
    Object.keys(progress.revisions || {}).forEach(function (id) {
      var r = progress.revisions[id];
      if (id !== exceptId && OPEN[r.state] && r.dueDate) m[r.dueDate] = (m[r.dueDate] || 0) + 1;
    });
    return m;
  }
  function balance(date, load, maxPerDay) {
    for (var i = 0; i <= 2; i++) {
      var d = addDays(date, i);
      if ((load[d] || 0) < maxPerDay) return d;
    }
    return date;   // everything nearby is full: keep the ideal date rather than drift further
  }
  function newRevId() { return "r-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function describe(step, ladder, outcome, why) {
    var gap = ladder[step];
    var base = why || (outcome ? "Last review: " + outcome : "Scheduled");
    return base + " → step " + (step + 1) + "/" + ladder.length + ", " + gap + " day" + (gap === 1 ? "" : "s") + " later";
  }

  /* Record a review/learn event for a target and (re)suggest its next revision.
   * ev = { date:"YYYY-MM-DD" (when it was reviewed), outcome: null|"easy"|"good"|"hard", learn:bool, why:string }
   * today = "YYYY-MM-DD". Returns the open revision (new or updated), or the accepted one left untouched. */
  function record(progress, target, ev, today, settings) {
    var R = rules(settings);
    progress.srs = progress.srs || {}; progress.revisions = progress.revisions || {};
    var k = key(target);
    var cur = progress.srs[k];
    var step;
    if (ev.learn || !cur) step = 0;   // first contact starts the ladder
    else step = nextStep(cur.step, ev.outcome, R.ladderDays.length);
    progress.srs[k] = { step: step, lastReviewed: ev.date };

    var gap = ev.outcome === "hard" ? 1 : R.ladderDays[step];
    var ideal = addDays(ev.date, gap);
    if (ideal < today) ideal = today;

    var open = openFor(progress, target);
    if (open && open.state === "accepted") return open;
    var due = balance(ideal, loadByDate(progress, open && open.id), R.maxPerDay);
    var reason = describe(step, R.ladderDays, ev.outcome, ev.why);
    if (open) {
      open.suggestedDate = due; open.dueDate = due; open.reason = reason;
      return open;
    }
    var r = { id: newRevId(), target: { type: target.type, id: target.id }, state: "suggested",
      suggestedDate: due, dueDate: due, time: null, reason: reason, createdAt: new Date().toISOString(),
      acceptedAt: null, completedAt: null, outcome: null, calendar: null };
    progress.revisions[r.id] = r;
    return r;
  }

  function accept(progress, revId, date, time) {
    var r = progress.revisions[revId];
    if (!r || !OPEN[r.state]) return null;
    r.state = "accepted";
    if (date) r.dueDate = date;
    if (time !== undefined) r.time = time || null;
    r.acceptedAt = new Date().toISOString();
    return r;
  }
  function skip(progress, revId) {
    var r = progress.revisions[revId];
    if (!r) return null;
    r.state = "skipped"; r.completedAt = new Date().toISOString();
    return r;
  }
  // mark done with an outcome; returns { done, next } where next is the new suggestion
  function complete(progress, revId, outcome, today, settings) {
    var r = progress.revisions[revId];
    if (!r || !OPEN[r.state]) return null;
    r.state = "done"; r.outcome = outcome || "good"; r.completedAt = new Date().toISOString();
    var next = record(progress, r.target, { date: today, outcome: r.outcome }, today, settings);
    return { done: r, next: next };
  }
  // ad-hoc: schedule a revision for a target on a chosen date (accepted immediately)
  function schedule(progress, target, date, time, settings) {
    var open = openFor(progress, target);
    if (open) { open.state = "accepted"; open.dueDate = date; open.time = time || null; open.acceptedAt = new Date().toISOString(); return open; }
    var r = record(progress, target, { date: date, outcome: null, learn: !progress.srs[key(target)], why: "Scheduled by you" }, date, settings);
    return accept(progress, r.id, date, time);
  }

  function list(progress, filter) {
    return Object.keys(progress.revisions || {}).map(function (id) { return progress.revisions[id]; })
      .filter(filter || function () { return true; })
      .sort(function (a, b) { return (a.dueDate || "").localeCompare(b.dueDate || "") || (a.createdAt || "").localeCompare(b.createdAt || ""); });
  }
  function isOpen(r) { return !!OPEN[r.state]; }

  return {
    DEFAULTS: DEFAULTS, rules: rules, key: key, nextStep: nextStep, addDays: addDays,
    openFor: openFor, loadByDate: loadByDate, balance: balance,
    record: record, accept: accept, skip: skip, complete: complete, schedule: schedule, list: list, isOpen: isOpen
  };
});
