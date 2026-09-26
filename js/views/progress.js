// Progress dashboard: headline bars, per phase, per concept, weekly time, streak.
import { state } from "../store.js";
import { h, pbar } from "../ui.js";
import { today, fmtDate } from "../util.js";
const P = window.DSA_PLAN, MD = window.DSA_MD;

export function render(root) {
  const plan = state.plan, pr = state.progress;
  const st = P.stats(plan, pr, MD.dayMinutes);
  root.innerHTML = "";
  const revs = Object.values(pr.revisions || {});
  const doneRevs = revs.filter((r) => r.state === "done");
  const onTime = doneRevs.filter((r) => r.completedAt && r.completedAt.slice(0, 10) <= r.dueDate).length;
  const dueSoFar = revs.filter((r) => (r.state === "accepted" && r.dueDate < today()) || r.state === "done").length;

  root.appendChild(h("div", { class: "view-head" }, h("div", {}, h("h2", { class: "view-title", text: "Progress" }),
    h("p", { class: "view-sub", text: "Logged " + MD.fmtMinutes(st.minutes) + " across " + st.daysDone + " completed day" + (st.daysDone === 1 ? "" : "s") + "." }))));

  root.appendChild(h("div", { class: "tiles" },
    tile("Problems solved", st.solved, st.problems, st.review ? st.review + " need review" : null),
    tile("Days done", st.daysDone, st.days),
    tile("Concepts completed", st.conceptsDone, st.concepts, "all of their days done"),
    tile("Pattern-checked problems", st.verified, st.problems, "verified, curated or kept"),
    tile("Revisions done on time", onTime, dueSoFar || doneRevs.length, doneRevs.length + " done in total"),
    h("div", { class: "tile" }, h("div", { class: "tile-num", text: streak() + " day" + (streak() === 1 ? "" : "s") }), h("div", { class: "tile-lbl", text: "Current study streak" }),
      h("small", { class: "daynote", text: "Consecutive calendar days with logged time" }))));

  root.appendChild(weekly());

  // phases
  const phases = h("div", { class: "section" }, h("div", { class: "section-head" }, h("h3", { text: "By phase" })));
  plan.phases.forEach((ph) => {
    const days = plan.days.filter((d) => d.phaseId === ph.id);
    if (!days.length) return;
    const pids = [];
    days.forEach((d) => d.problemIds.forEach((pid) => { if (plan.problems[pid] && pids.indexOf(pid) < 0) pids.push(pid); }));
    const so = P.solvedOf(pr, pids);
    const dd = days.filter((d) => pr.days[d.id] && pr.days[d.id].done).length;
    phases.appendChild(h("div", { class: "prow" }, h("span", { class: "prow-name", text: ph.title }),
      pbar(dd, days.length, "Days"), so.total ? pbar(so.solved, so.total, "Solved") : h("span")));
  });
  root.appendChild(phases);

  // concepts
  const cons = h("div", { class: "section" }, h("div", { class: "section-head" }, h("h3", { text: "By concept" })));
  P.conceptsOrdered(plan).forEach((c) => {
    const probs = P.conceptProblems(plan, c.id);
    const so = P.solvedOf(pr, probs.map((p) => p.id));
    const mins = P.conceptDays(plan, c.id).reduce((t, d) => t + MD.dayMinutes(pr.days[d.id]), 0);
    const next = MD.nextRevision(pr, "concept", c.id);
    cons.appendChild(h("div", { class: "prow" },
      h("a", { class: "prow-name", href: "#concept/" + encodeURIComponent(c.id), text: c.name }),
      so.total ? pbar(so.solved, so.total, "") : h("span", { class: "daynote", text: "no problems" }),
      h("span", { class: "prow-extra", text: (mins ? MD.fmtMinutes(mins) : "") + (next ? (mins ? " · " : "") + "↻ " + fmtDate(next.dueDate) : "") })));
  });
  root.appendChild(cons);
}

function tile(label, a, b, sub) {
  return h("div", { class: "tile" }, h("div", { class: "tile-num" }, String(a), h("span", { class: "den", text: " / " + b })),
    h("div", { class: "tile-lbl", text: label }), pbar(a, b, ""), sub ? h("small", { class: "daynote", text: sub }) : null);
}

function allSessions() {
  const out = [];
  Object.values(state.progress.days || {}).forEach((dp) => (dp.sessions || []).forEach((s) => { if (s.end) out.push(s); }));
  return out;
}
function streak() {
  const dates = {};
  Object.values(state.progress.days || {}).forEach((dp) => MD.datesWorked(dp).forEach((d) => { dates[d] = true; }));
  let d = today(), n = 0;
  if (!dates[d]) d = P.addDays(d, -1);   // today not logged yet doesn't break the streak
  while (dates[d]) { n++; d = P.addDays(d, -1); }
  return n;
}
function weekly() {
  // minutes per ISO week (Monday start) for the last 8 weeks, by session start date
  const t = today();
  const dow = (new Date(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)).getDay() + 6) % 7;
  const monday = P.addDays(t, -dow);
  const weeks = [];
  for (let i = 7; i >= 0; i--) weeks.push({ start: P.addDays(monday, -7 * i), mins: 0 });
  allSessions().forEach((s) => {
    const d = s.start.slice(0, 10);
    for (let i = weeks.length - 1; i >= 0; i--) if (d >= weeks[i].start) { if (P.diffDays(weeks[i].start, d) < 7) weeks[i].mins += MD.sessionMinutes(s); break; }
  });
  const max = Math.max(60, ...weeks.map((w) => w.mins));
  return h("div", { class: "section" }, h("div", { class: "section-head" }, h("h3", { text: "Time per week" })),
    h("div", { class: "wbars" }, weeks.map((w) => h("div", { class: "wbar", title: "Week of " + fmtDate(w.start) + ": " + MD.fmtMinutes(w.mins) },
      h("span", { class: "wbar-v", text: w.mins ? MD.fmtMinutes(w.mins) : "" }),
      h("div", { class: "wbar-col" }, h("div", { class: "wbar-fill", style: "height:" + Math.round(100 * w.mins / max) + "%" })),
      h("span", { class: "wbar-l", text: fmtDate(w.start) })))));
}
