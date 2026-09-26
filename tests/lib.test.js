// node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const P = require("../lib/planlib.js");
const S = require("../lib/srs.js");
const MD = require("../lib/mdgen.js");
const C = require("../lib/crypto.js");

function catalog() {
  const sb = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "catalog.js"), "utf8"), sb);
  return sb.window.DSA_CATALOG;
}

test("fromCatalog keeps day ids, builds concepts and problem homes", () => {
  const plan = P.fromCatalog(catalog());
  assert.equal(plan.days.length, 60);
  assert.equal(plan.days[0].id, "1");
  assert.deepEqual(plan.days[0].conceptIds, ["two-pointers-converging"]);
  assert.equal(Object.keys(plan.problems).length, 150);
  assert.deepEqual(plan.problems["3sum"].conceptIds, ["two-pointers-converging"]);
  assert.equal(plan.problems["3sum"].verification.status, "builtin");
  assert.deepEqual(plan.days[6].conceptIds, [], "revision day has no concept");
  assert.ok(Object.keys(plan.concepts).length >= 41);
  assert.equal(P.dayNumber(plan, "5"), 5);
});

test("plan mutations: add/move/delete day, concept, problem", () => {
  const plan = P.fromCatalog(catalog());
  const c = P.addConcept(plan, { name: "Two Pointers (Converging)" });
  assert.equal(c.id, "two-pointers-converging-2", "unique concept id");
  const d = P.addDay(plan, { title: "Extra" }, { afterDayId: "3" });
  assert.equal(P.dayNumber(plan, d.id), 4);
  assert.equal(P.dayNumber(plan, "4"), 5, "later days shift, ids stay");
  assert.equal(d.phaseId, "p1");
  assert.ok(P.moveDay(plan, d.id, -1));
  assert.equal(P.dayNumber(plan, d.id), 3);
  const lc = P.addProblem(plan, { kind: "leetcode", slug: "two-sum" }, { conceptId: c.id, dayId: d.id });
  assert.equal(lc.title, "Two Sum");
  assert.deepEqual(P.dayById(plan, d.id).problemIds, ["two-sum"]);
  const again = P.addProblem(plan, { kind: "leetcode", slug: "3sum" }, { conceptId: c.id });
  assert.deepEqual(again.conceptIds, ["two-pointers-converging", c.id], "existing problem reused and linked");
  const cu = P.addProblem(plan, { kind: "custom", title: "My Problem", statement: "x" }, { conceptId: c.id });
  assert.equal(cu.id, "custom-my-problem");
  assert.equal(P.addProblem(plan, { kind: "custom", title: "My Problem" }).id, "custom-my-problem-2");
  const touched = P.deleteConcept(plan, c.id);
  assert.ok(touched.problems.includes("3sum"));
  assert.deepEqual(plan.problems["3sum"].conceptIds, ["two-pointers-converging"]);
  assert.ok(P.deleteDay(plan, d.id));
  assert.equal(P.dayNumber(plan, "4"), 4);
});

test("parseLeetCode", () => {
  assert.equal(P.parseLeetCode("https://leetcode.com/problems/two-sum/description/"), "two-sum");
  assert.equal(P.parseLeetCode("leetcode.cn/problems/3sum"), "3sum");
  assert.equal(P.parseLeetCode("https://leetcode.com/problemset/all/problems/lru-cache/"), "lru-cache");
  assert.equal(P.parseLeetCode("Two-Sum"), "two-sum");
  assert.equal(P.parseLeetCode("not a slug!"), null);
});

test("planned dates follow order and start date", () => {
  const plan = P.fromCatalog(catalog());
  plan.meta.startDate = "2026-09-30";
  assert.equal(P.plannedDate(plan, plan.days[0]), "2026-09-30");
  assert.equal(P.plannedDate(plan, plan.days[2]), "2026-10-02");
  plan.days[2].plannedDate = "2026-12-25";
  assert.equal(P.plannedDate(plan, plan.days[2]), "2026-12-25");
});

test("srs: learn, outcomes, one open revision per target, accepted is sticky", () => {
  const pr = P.emptyProgress();
  const t = { type: "problem", id: "3sum" };
  const r1 = S.record(pr, t, { date: "2026-09-26", learn: true }, "2026-09-26");
  assert.equal(r1.dueDate, "2026-09-27");
  assert.equal(r1.state, "suggested");
  const r1b = S.record(pr, t, { date: "2026-09-26", learn: true }, "2026-09-26");
  assert.equal(r1b.id, r1.id, "updates the open suggestion");
  S.accept(pr, r1.id, "2026-09-28", "19:00");
  const done = S.complete(pr, r1.id, "good", "2026-09-28");
  assert.equal(done.done.state, "done");
  assert.equal(pr.srs["problem:3sum"].step, 1);
  assert.equal(done.next.dueDate, "2026-10-01", "step 1 = 3 days");
  const n2 = S.complete(pr, done.next.id, "easy", "2026-10-01");
  assert.equal(pr.srs["problem:3sum"].step, 3);
  assert.equal(n2.next.dueDate, "2026-10-15", "step 3 = 14 days");
  const n3 = S.complete(pr, n2.next.id, "hard", "2026-10-15");
  assert.equal(pr.srs["problem:3sum"].step, 2);
  assert.equal(n3.next.dueDate, "2026-10-16", "hard = tomorrow");
  S.accept(pr, n3.next.id, "2026-10-20");
  const kept = S.record(pr, t, { date: "2026-10-15", outcome: "hard" }, "2026-10-15");
  assert.equal(kept.dueDate, "2026-10-20", "accepted date not overwritten");
});

test("srs: never in the past, load balancing, custom ladder", () => {
  const pr = P.emptyProgress();
  const r = S.record(pr, { type: "concept", id: "a" }, { date: "2026-01-01", learn: true }, "2026-09-26");
  assert.equal(r.dueDate, "2026-09-26");
  ["b", "c"].forEach(id => S.record(pr, { type: "concept", id }, { date: "2026-09-25", learn: true }, "2026-09-25", { maxPerDay: 3 }));
  const fourth = S.record(pr, { type: "concept", id: "d" }, { date: "2026-09-25", learn: true }, "2026-09-25", { maxPerDay: 3 });
  assert.equal(fourth.dueDate, "2026-09-27", "26th full (3) -> pushed");
  const pr2 = P.emptyProgress();
  const r2 = S.record(pr2, { type: "concept", id: "x" }, { date: "2026-09-25", learn: true }, "2026-09-25", { ladderDays: [2, 5] });
  assert.equal(r2.dueDate, "2026-09-27");
});

test("mdgen v2: concept page keeps notes, shows problems, sessions, revisions", () => {
  const plan = P.fromCatalog(catalog());
  const pr = P.emptyProgress();
  pr.problems["3sum"] = { status: "solved", notes: "see ![s](images/a.png)" };
  pr.days["1"] = { done: true, sessions: [{ start: "2026-09-24T23:30:00+05:30", end: "2026-09-25T00:45:00+05:30" }] };
  S.record(pr, { type: "concept", id: "two-pointers-converging" }, { date: "2026-09-25", learn: true }, "2026-09-25");
  const md = MD.conceptMd(plan, pr, "two-pointers-converging", "My **notes**");
  assert.equal(MD.extractNotes(md), "My **notes**");
  assert.match(md, /1\/7 solved/);
  assert.match(md, /1h 15m/);
  assert.match(md, /2026-09-24, 2026-09-25/);
  assert.match(md, /\*\*Next:\*\* 2026-09-26 \(suggested\)/);
  assert.match(md, /\(\.\.\/problems\/3sum\/images\/a\.png\)/, "problem note image rebased");
  const sched = MD.scheduleMd(plan, pr);
  assert.match(sched, /\| 1 \| Two Pointers \(Converging\) \|/);
  assert.match(sched, /Upcoming revisions/);
  const custom = P.addProblem(plan, { kind: "custom", title: "Bucket merge", statement: "Merge **k** buckets." }, { conceptId: "k-way-merge" });
  const readme = MD.problemReadme(plan, pr, custom.id);
  assert.match(readme, /## Problem\n\nMerge \*\*k\*\* buckets\./);
  assert.match(readme, /❔ unverified/);
  const files = MD.allDocs(plan, pr, {});
  assert.ok(files.some(f => f.path === "schedule.md"));
  assert.ok(files.some(f => f.path === "concepts/two-pointers-converging.md"));
});

test("crypto: round trip, wrong passphrase, key reuse", async () => {
  const { envelope, key } = await C.encrypt({ google: { clientId: "abc" } }, "correct horse");
  assert.equal(envelope.kdf.name, "PBKDF2");
  const back = await C.decrypt(envelope, "correct horse");
  assert.deepEqual(back.data, { google: { clientId: "abc" } });
  await assert.rejects(C.decrypt(envelope, "wrong"), /Wrong passphrase/);
  const saved = await C.exportKey(key);
  const k2 = await C.importKey(saved);
  const env2 = await C.encryptWithKey({ v: 2 }, k2);
  assert.notEqual(env2.cipher.iv, envelope.cipher.iv, "fresh IV");
  assert.deepEqual((await C.decrypt(env2, "correct horse")).data, { v: 2 });
});
