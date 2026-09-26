/* DSA Revision Tracker — one-time migration v1 (catalog.js + day-keyed concept pages) -> v2 (plan.json).
 *
 * Pure: the caller does the I/O. Used by the app (reads/writes through the GitHub API) and by
 * scripts/build-docs.js (local files). Idempotent: running it on v2 data changes nothing.
 *
 *   planNeeded(planJson)                       -> true when data/plan.json is missing
 *   legacyPaths(catalog)                       -> [{ dayId, cid, path }] v1 concept files to read (and delete)
 *   run(catalog, progress, legacyBlocks, today, srsSettings)
 *        legacyBlocks[dayId] = notes block text read from the v1 file (or null)
 *     -> { plan, progress, notesByConcept, removePaths, seeded }
 */
(function (root, factory) {
  var node = typeof module === "object" && module.exports;
  var api = factory(node ? require("./planlib.js") : root.DSA_PLAN, node ? require("./mdgen.js") : root.DSA_MD,
    node ? require("./srs.js") : root.DSA_SRS);
  if (node) module.exports = api;
  else root.DSA_MIGRATE = api;
})(typeof self !== "undefined" ? self : this, function (P, MD, S) {
  "use strict";

  function planNeeded(planJson) { return !planJson; }

  function legacyPaths(catalog) {
    return catalog.days.map(function (cd) {
      var cid = (cd.tag === "new" || cd.tag === "cap") ? P.slugify(cd.pattern) : null;
      return { dayId: String(cd.d), cid: cid, path: MD.legacyConceptPath(cd.d, cd.pattern) };
    });
  }

  function run(catalog, progress, legacyBlocks, today, srsSettings) {
    legacyBlocks = legacyBlocks || {};
    var plan = P.fromCatalog(catalog);
    progress = P.migrateProgress(JSON.parse(JSON.stringify(progress || {})));

    // concept notes: v1 page blocks (by day), else v1 progress.concepts[day]
    var notesByConcept = {};
    legacyPaths(catalog).forEach(function (l) {
      if (!l.cid) return;
      var text = legacyBlocks[l.dayId];
      if (!text && progress.concepts[l.dayId]) text = MD.legacyNotes(l.cid, progress.concepts[l.dayId]);
      if (text) notesByConcept[l.cid] = notesByConcept[l.cid] ? notesByConcept[l.cid] + "\n\n" + text : text;
    });
    progress.concepts = {};

    // v1 notes images pointed relative to the old day file (concepts/…) — same folder, so links still work.

    // seed revision suggestions from what's already done
    var seeded = 0;
    if (S && !Object.keys(progress.srs).length) {
      Object.keys(progress.problems).forEach(function (pid) {
        var pp = progress.problems[pid];
        if (!plan.problems[pid] || (pp.status !== "solved" && pp.status !== "review")) return;
        var date = (pp.revisedAt || "").slice(0, 10) || today;
        S.record(progress, { type: "problem", id: pid }, { date: date, learn: true, outcome: pp.status === "review" ? "hard" : null,
          why: pp.status === "review" ? "Marked needs review" : "Solved" }, today, srsSettings);
        seeded++;
      });
      plan.days.forEach(function (d) {
        var dp = progress.days[d.id];
        if (!dp || !dp.done) return;
        var date = (dp.doneAt || "").slice(0, 10) || lastSessionDate(dp) || today;
        d.conceptIds.forEach(function (cid) {
          S.record(progress, { type: "concept", id: cid }, { date: date, learn: true, why: "Day " + P.dayNumber(plan, d.id) + " completed" }, today, srsSettings);
          seeded++;
        });
      });
    }

    var removePaths = legacyPaths(catalog).map(function (l) { return l.path; });
    return { plan: plan, progress: progress, notesByConcept: notesByConcept, removePaths: removePaths, seeded: seeded };
  }
  function lastSessionDate(dp) {
    var ends = (dp.sessions || []).map(function (s) { return (s.end || s.start || "").slice(0, 10); }).filter(Boolean).sort();
    return ends[ends.length - 1] || null;
  }

  return { planNeeded: planNeeded, legacyPaths: legacyPaths, run: run };
});
