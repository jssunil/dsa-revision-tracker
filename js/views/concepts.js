// Concept library (#concepts) and concept page (#concept/<id>).
import { state, touchConcept, touchProblem, touchDay, touchOrder, emit } from "../store.js";
import { h, btn, chip, pbar, toast, confirmBox, verifyBadge, diffBadge } from "../ui.js";
import { problemRow, addProblemDialog, verifyProblem, gatewayAvailable } from "../problem.js";
import { conceptNotes } from "./day.js";
import { newConceptDialog } from "./plan.js";
import { scheduleFor, accept } from "../revise.js";
import { fmtDate, relDay, today } from "../util.js";
const P = window.DSA_PLAN, MD = window.DSA_MD;

let search = "";

export function renderList(root) {
  const plan = state.plan;
  root.innerHTML = "";
  const q = h("input", { type: "search", placeholder: "Search concepts…", value: search, class: "view-search" });
  const grid = h("div", { class: "concept-grid" });
  const paint = () => {
    grid.innerHTML = "";
    P.conceptsOrdered(plan).filter((c) => !search || (c.name + " " + (c.summary || "") + " " + (c.triggers || []).join(" ")).toLowerCase().includes(search))
      .forEach((c) => grid.appendChild(card(c)));
    if (!grid.children.length) grid.appendChild(h("p", { class: "daynote", text: "No concepts match." }));
  };
  q.addEventListener("input", () => { search = q.value.trim().toLowerCase(); paint(); });
  root.appendChild(h("div", { class: "view-head" },
    h("div", {}, h("h2", { class: "view-title", text: "Concepts" }), h("p", { class: "view-sub", text: Object.keys(plan.concepts).length + " patterns. Open one to edit it, add problems or schedule a revision." })),
    h("div", { class: "view-tools" }, q, btn("+ New concept", () => newConceptDialog({ onDone: (c) => { location.hash = "#concept/" + encodeURIComponent(c.id); } }), "tbtn primary"))));
  root.appendChild(grid);
  paint();
}

function card(c) {
  const plan = state.plan;
  const probs = P.conceptProblems(plan, c.id);
  const so = P.solvedOf(state.progress, probs.map((p) => p.id));
  const unverified = probs.filter((p) => { const s = (p.verification || {}).status; return s === "unverified" || s === "mismatch"; }).length;
  const days = P.conceptDays(plan, c.id);
  const next = MD.nextRevision(state.progress, "concept", c.id);
  return h("a", { class: "ccard", href: "#concept/" + encodeURIComponent(c.id) },
    h("div", { class: "ccard-head" }, h("b", { text: c.name }), c.source === "custom" ? chip("custom", "custom") : null),
    c.summary ? h("p", { class: "focus", text: c.summary }) : null,
    pbar(so.solved, so.total, "Solved"),
    h("div", { class: "ccard-meta" },
      days.length ? "Day " + days.map((d) => P.dayNumber(plan, d.id)).join(", ") : "not scheduled",
      unverified ? h("span", { class: "vbadge warn", text: unverified + " to check" }) : null,
      next ? h("span", { class: "chip rev", text: "↻ " + fmtDate(next.dueDate) }) : null));
}

export function renderPage(root, params) {
  const plan = state.plan, cid = params.id, c = plan.concepts[cid];
  root.innerHTML = "";
  if (!c) { root.appendChild(h("div", { class: "empty" }, h("p", { text: "Concept not found." }), h("a", { class: "tbtn", href: "#concepts" }, "All concepts"))); return; }
  const rerender = () => { renderPage(root, params); emit("chrome"); };
  const probs = P.conceptProblems(plan, cid);
  const so = P.solvedOf(state.progress, probs.map((p) => p.id));
  const days = P.conceptDays(plan, cid);

  // editable header
  const name = h("input", { type: "text", class: "concept-name", value: c.name, "aria-label": "Concept name" });
  name.addEventListener("change", () => { c.name = name.value.trim() || c.name; touchConcept(cid); emit("chrome"); });
  const summary = h("input", { type: "text", value: c.summary || "", placeholder: "One-line summary" });
  summary.addEventListener("change", () => { c.summary = summary.value.trim(); touchConcept(cid); });
  const triggers = h("input", { type: "text", value: (c.triggers || []).join(", "), placeholder: "Recognise it when… (comma-separated)" });
  triggers.addEventListener("change", () => { c.triggers = triggers.value.split(",").map((x) => x.trim()).filter(Boolean); touchConcept(cid); });
  const tags = h("input", { type: "text", value: (c.leetcodeTags || []).join(", "), placeholder: "LeetCode topic tags (comma-separated)" });
  tags.addEventListener("change", () => { c.leetcodeTags = tags.value.split(",").map((x) => x.trim()).filter(Boolean); touchConcept(cid); });

  const mins = days.reduce((t, d) => t + MD.dayMinutes(state.progress.days[d.id]), 0);
  root.appendChild(h("div", { class: "concept-page" },
    h("a", { class: "linkbtn back", href: "#concepts" }, "← All concepts"),
    name,
    h("div", { class: "cp-fields" },
      h("label", { class: "field" }, h("span", { text: "Summary" }), summary),
      h("label", { class: "field" }, h("span", { text: "Recognise it when…" }), triggers),
      h("label", { class: "field" }, h("span", { text: "LeetCode tags" }), tags)),
    h("div", { class: "day-meta" }, pbar(so.solved, so.total, "Solved"),
      mins ? h("span", { class: "chip", text: "⏱ " + MD.fmtMinutes(mins) }) : null,
      days.length ? days.map((d) => h("a", { class: "chip", href: "#day/" + d.id, text: "Day " + P.dayNumber(plan, d.id) + (P.plannedDate(plan, d) ? " · " + fmtDate(P.plannedDate(plan, d)) : "") }))
        : h("span", { class: "chip warn", text: "Not on any day — add it to one in the Plan" }))));

  root.appendChild(revisionBox(cid, rerender));
  root.appendChild(conceptNotes(cid, { label: "Concept notes", showName: true }));

  // problems
  const verifyAll = btn("Check all unverified", async () => {
    if (!(await gatewayAvailable())) { toast("Pattern checker offline. Run python server/serve.py and open the app from it.", "warn"); return; }
    const todo = probs.filter((p) => { const s = (p.verification || {}).status; return s === "unverified"; });
    if (!todo.length) { toast("Nothing to check", "ok"); return; }
    verifyAll.disabled = true;
    let n = 0, bad = 0;
    for (const p of todo) {
      verifyAll.textContent = "Checking " + (++n) + "/" + todo.length + "…";
      try { const v = await verifyProblem(p.id, cid); if (v.status === "mismatch") bad++; }
      catch (e) { toast(p.title + ": " + e.message, "warn"); }
    }
    toast("Checked " + todo.length + (bad ? " · " + bad + " look like a better fit elsewhere" : " · all fit"), bad ? "warn" : "ok");
    rerender();
  }, "chipbtn");
  const plist = h("div", { class: "problems" });
  probs.forEach((p) => {
    const wrap = h("div", { class: "cp-prob" }, problemRow(p.id, { conceptId: cid, rerender }));
    const acts = h("div", { class: "cp-prob-acts" });
    const v = p.verification || {};
    if (v.status === "mismatch" && (v.suggestedConceptIds || []).some((x) => x !== cid && plan.concepts[x])) {
      v.suggestedConceptIds.filter((x) => x !== cid && plan.concepts[x]).slice(0, 2).forEach((x) => acts.appendChild(
        btn("Move to " + plan.concepts[x].name, () => {
          p.conceptIds = p.conceptIds.filter((y) => y !== cid); if (p.conceptIds.indexOf(x) < 0) p.conceptIds.unshift(x);
          p.verification = Object.assign({}, v, { status: "verified" }); touchProblem(p.id); touchConcept(cid); touchConcept(x); rerender();
        }, "chipbtn")));
      acts.appendChild(btn("Keep here", () => { p.verification = Object.assign({}, v, { status: "overridden" }); touchProblem(p.id); rerender(); }, "chipbtn ghost"));
    }
    acts.appendChild(btn("Remove from concept", async () => {
      if (!(await confirmBox("Remove “" + p.title + "” from " + c.name + "? It stays on its days and keeps its notes.", "Remove"))) return;
      p.conceptIds = p.conceptIds.filter((y) => y !== cid); touchProblem(p.id); touchConcept(cid); rerender();
    }, "chipbtn ghost"));
    wrap.appendChild(acts);
    plist.appendChild(wrap);
  });
  root.appendChild(h("div", { class: "section" },
    h("div", { class: "section-head" }, h("h3", { text: "Problems (" + probs.length + ")" }),
      h("span", { class: "spacer" }), verifyAll,
      btn("+ LeetCode problem", () => addProblemDialog({ conceptId: cid, dayId: days[0] && days[0].id, onDone: rerender }), "tbtn primary"),
      btn("+ Custom problem", () => addProblemDialog({ conceptId: cid, dayId: days[0] && days[0].id, tab: "custom", onDone: rerender }), "tbtn")),
    probs.length ? plist : h("p", { class: "daynote", text: "No problems yet. Add a LeetCode link — the pattern checker will confirm it trains this concept." })));

  // danger zone
  root.appendChild(h("div", { class: "section danger-zone" },
    h("h3", { text: "Delete concept" }),
    h("p", { class: "daynote", text: "Removes the concept from the plan and from its days and problems. Problems, notes and progress are kept; the concept .md is deleted (it stays in git history)." }),
    btn("Delete " + c.name, async () => {
      if (!(await confirmBox("Delete the concept “" + c.name + "”?", "Delete concept", true))) return;
      const t = P.deleteConcept(plan, cid);
      touchConcept(cid); t.days.forEach(touchDay); t.problems.forEach(touchProblem);
      toast("Deleted " + c.name, "ok");
      location.hash = "#concepts";
    }, "tbtn danger")));
}

function revisionBox(cid, rerender) {
  const target = { type: "concept", id: cid };
  const next = MD.nextRevision(state.progress, "concept", cid);
  const done = MD.revisionsFor(state.progress, "concept", cid).filter((r) => r.state === "done");
  const date = h("input", { type: "date", value: next ? next.dueDate : P.addDays(today(), 1), min: today() });
  const box = h("div", { class: "section revbox" }, h("div", { class: "section-head" }, h("h3", { text: "Revision" })));
  if (next) {
    box.appendChild(h("p", {}, h("b", { text: (next.state === "suggested" ? "Suggested: " : "Scheduled: ") + fmtDate(next.dueDate) + " (" + relDay(next.dueDate) + ")" }),
      next.reason ? h("span", { class: "daynote", text: " — " + next.reason }) : null));
  } else box.appendChild(h("p", { class: "daynote", text: "No revision planned. Completing a day for this concept suggests one automatically." }));
  box.appendChild(h("div", { class: "vrow" }, date,
    btn(next && next.state === "suggested" ? "Accept this date" : next ? "Reschedule" : "Schedule revision", async () => {
      if (next && next.state === "suggested") await accept(next, date.value, next.time);
      else if (next) { const { reschedule } = await import("../revise.js"); await reschedule(next, date.value); }
      else await scheduleFor(target, date.value, null);
      rerender();
    }, "tbtn primary"),
    h("a", { class: "linkbtn", href: "#revisions" }, "All revisions →")));
  if (done.length) box.appendChild(h("p", { class: "daynote", text: "Done " + done.length + "×, last " + fmtDate(done[done.length - 1].completedAt.slice(0, 10)) + " (" + done[done.length - 1].outcome + ")" }));
  return box;
}
export { verifyBadge, diffBadge, touchOrder };
