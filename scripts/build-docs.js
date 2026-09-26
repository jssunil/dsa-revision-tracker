#!/usr/bin/env node
/* Regenerate every generated markdown file from data/plan.json + data/progress.json.
 *
 *   node scripts/build-docs.js
 *
 * - First run on a v1 repo (no data/plan.json): migrates — builds plan.json from catalog.js, moves each
 *   concept notes block from concepts/day-NN-*.md to concepts/<conceptId>.md, deletes the old pages, and
 *   seeds revision suggestions from what's already solved/done.
 * - Keeps the notes block of every concepts/<id>.md.
 * - Records solution files committed directly (problems/<id>/solution.<ext>) in progress.json.
 * Same generator as the app (lib/mdgen.js), so the output is identical to what the app commits. */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var P = require(path.join(ROOT, "lib", "planlib.js"));
var MD = require(path.join(ROOT, "lib", "mdgen.js"));
var MIG = require(path.join(ROOT, "lib", "migrate.js"));

function read(rel) { var f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null; }
function write(rel, s) { var f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); }
function json(s) { return JSON.stringify(s, null, 2) + "\n"; }

var planText = read("data/plan.json");
var progress = P.normalizeProgress(JSON.parse(read("data/progress.json") || "null"));
var plan, notesByConcept = {};

if (MIG.planNeeded(planText)) {
  var sb = { window: {} };
  vm.runInNewContext(read("catalog.js"), sb);
  var catalog = sb.window.DSA_CATALOG;
  var blocks = {};
  MIG.legacyPaths(catalog).forEach(function (l) { blocks[l.dayId] = MD.extractNotes(read(l.path)); });
  var res = MIG.run(catalog, progress, blocks, P.localYmd());
  plan = res.plan; progress = res.progress; notesByConcept = res.notesByConcept;
  res.removePaths.forEach(function (p) { var f = path.join(ROOT, p); if (fs.existsSync(f)) fs.unlinkSync(f); });
  write("data/plan.json", json(plan));
  console.log("Migrated to plan v2: " + plan.days.length + " days, " + Object.keys(plan.concepts).length + " concepts, " +
    Object.keys(plan.problems).length + " problems; " + res.seeded + " revision suggestion(s) seeded.");
} else {
  plan = P.normalizePlan(JSON.parse(planText));
}

// keep each concept file's notes block
Object.keys(plan.concepts).forEach(function (cid) {
  var block = MD.extractNotes(read(MD.conceptPath(cid)));
  if (block) notesByConcept[cid] = block;
});

// record solution files that exist on disk but aren't in progress.json yet
var byExt = {};
Object.keys(MD.LANGS).forEach(function (k) { byExt[MD.LANGS[k].ext] = k; });
var found = 0;
Object.keys(plan.problems).forEach(function (pid) {
  var dir = path.join(ROOT, MD.problemDir(pid));
  if (!fs.existsSync(dir)) return;
  var p = progress.problems[pid];
  if (p && p.solution && p.solution.path && fs.existsSync(path.join(ROOT, p.solution.path))) return;
  var sol = fs.readdirSync(dir).filter(function (f) { return /^solution\.\w+$/.test(f) && byExt[f.split(".")[1]]; })[0];
  if (!sol) { if (p && p.solution && p.solution.path) delete p.solution; return; }
  p = progress.problems[pid] = progress.problems[pid] || { status: "solved", notes: "", links: [], images: [], revisedAt: null };
  p.solution = { lang: byExt[sol.split(".")[1]], path: MD.problemDir(pid) + "/" + sol };
  found++;
});
if (found) console.log("Recorded " + found + " solution file(s) in data/progress.json");
write("data/progress.json", json(progress));

var files = MD.allDocs(plan, progress, notesByConcept);
files.forEach(function (f) { write(f.path, f.content); });
console.log("Wrote " + files.length + " markdown files.");
