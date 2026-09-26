// Day view: one day at a time (dropdown / ‹ › / ←→ / #day/<id>), or matches across all days when filtering.
import { state, dayProg, touchProgDay, onDayDone, loadConceptNotes, setConceptNotes, emit } from "../store.js";
import { uploadImage } from "../github.js";
import { h, btn, chip, pbar, kindChip } from "../ui.js";
import { mdEditor } from "../editor.js";
import { renderTimeLog, runningSession } from "../timelog.js";
import { problemRow, addProblemDialog } from "../problem.js";
import { repoLink } from "../fields.js";
import { lsGet, lsSet, fmtDate, relDay } from "../util.js";
const P = window.DSA_PLAN, MD = window.DSA_MD;

const DAY_KEY = "dsa_day";
export const filter = { term: "", status: "all" };   // status: all | todo | solved | review | withnotes
let currentDay = null;

export const filtering = () => !!filter.term || filter.status !== "all";
export function getCurrentDay() { return currentDay; }

function initialDay() {
  const saved = lsGet(DAY_KEY, null);
  if (saved && P.dayById(state.plan, saved)) return saved;
  const open = state.plan.days.filter((d) => !(state.progress.days[d.id] && state.progress.days[d.id].done))[0];
  return (open || state.plan.days[0] || {}).id || null;
}
export function setDay(id) {
  if (!P.dayById(state.plan, id)) return;
  currentDay = String(id);
  lsSet(DAY_KEY, currentDay);
}
export function stepDay(delta) {
  const i = P.dayIndex(state.plan, currentDay) + delta;
  if (i >= 0 && i < state.plan.days.length) location.hash = "#day/" + state.plan.days[i].id;
}
export function clearFilters() {
  filter.term = ""; filter.status = "all";
  const s = document.getElementById("search"); if (s) s.value = "";
  document.querySelectorAll("#filters .fbtn").forEach((x) => x.setAttribute("aria-pressed", x.getAttribute("data-f") === "all"));
}

function problemMatches(pid) {
  const pl = state.plan.problems[pid];
  if (!pl) return false;
  const p = state.progress.problems[pid] || {};
  if (filter.term) {
    const hay = (pl.title + " " + (p.notes || "") + " " + (pl.statement || "")).toLowerCase();
    if (hay.indexOf(filter.term) === -1) return false;
  }
  if (filter.status === "all") return true;
  if (filter.status === "withnotes") return !!(p.notes && p.notes.trim());
  return (p.status || "todo") === filter.status;
}

export function render(root, params) {
  if (params && params.dayId && P.dayById(state.plan, params.dayId)) setDay(params.dayId);
  if (!currentDay || !P.dayById(state.plan, currentDay)) currentDay = initialDay();
  root.innerHTML = "";
  if (!state.plan.days.length) {
    root.appendChild(h("div", { class: "empty" }, h("p", { text: "Your plan has no days yet." }), h("a", { class: "tbtn primary", href: "#plan" }, "Open the plan editor")));
    return;
  }
  const rerender = () => render(root, {});
  if (filtering()) {
    const n = state.plan.days.reduce((t, d) => t + d.problemIds.filter(problemMatches).length, 0);
    root.appendChild(h("div", { class: "results-info" },
      h("span", { text: n + " matching problem" + (n === 1 ? "" : "s") + " across all days" }),
      btn("Back to Day " + P.dayNumber(state.plan, currentDay) + " →", () => { clearFilters(); rerender(); syncDayNav(); }, "linkbtn")));
  }
  const days = filtering() ? state.plan.days : [P.dayById(state.plan, currentDay)];
  let lastPhase = null, wrap = null;
  days.forEach((day) => {
    const card = dayCard(day, !filtering(), rerender);
    if (!card) return;
    if (day.phaseId !== lastPhase) {
      lastPhase = day.phaseId;
      const ph = P.phaseById(state.plan, day.phaseId);
      const idx = state.plan.phases.indexOf(ph);
      const sec = h("section", { class: "phase" }, h("div", { class: "phase-head" },
        h("span", { class: "phase-idx", text: "PHASE " + (idx + 1) }), h("h2", { class: "phase-name", text: ph ? ph.title : "Unphased" })));
      wrap = h("div", { class: "days" });
      sec.appendChild(wrap);
      root.appendChild(sec);
    }
    wrap.appendChild(card);
  });
  if (!filtering()) root.appendChild(pager());
  syncDayNav();
}

function dayCard(day, single, rerender) {
  const plan = state.plan;
  const visible = day.problemIds.filter(problemMatches);
  if (!single && !visible.length) return null;
  const dp = state.progress.days[day.id] || {};
  const card = h("div", { class: "day" + (dp.done ? " day-done" : "") });

  const check = h("button", { class: "daycheck" + (dp.done ? " on" : ""), title: "Mark day complete", "aria-label": "Mark day complete",
    html: '<svg viewBox="0 0 24 24"><path d="M4 12l6 6L20 5"/></svg>' });
  check.addEventListener("click", () => {
    const d = dayProg(day.id);
    d.done = !d.done;
    d.doneAt = d.done ? new Date().toISOString() : null;
    if (d.done) onDayDone(day.id);
    touchProgDay(day.id);
    card.classList.toggle("day-done", d.done);
    check.classList.toggle("on", d.done);
    emit("chrome");
    if (single) rerender();
  });
  const planned = P.plannedDate(plan, day);
  const head = h("div", { class: "day-head" }, check,
    h("span", { class: "daynum", text: "DAY " + P.dayNumber(plan, day.id) }), kindChip(day.kind),
    h("span", { class: "pattern", text: day.title }),
    planned ? h("span", { class: "planned", title: "Planned date", text: "📅 " + fmtDate(planned) }) : null,
    single ? h("a", { class: "linkbtn edit-day", href: "#plan", title: "Edit this day in the plan" }, "Edit") :
      btn("Open day →", () => { clearFilters(); location.hash = "#day/" + day.id; }, "linkbtn open-day"));
  card.appendChild(head);

  if (day.focus) card.appendChild(h("p", { class: "focus", text: day.focus }));
  if (day.note) card.appendChild(h("p", { class: "daynote", text: day.note }));

  if (single) {
    const so = P.solvedOf(state.progress, day.problemIds.filter((pid) => plan.problems[pid]));
    const meta = h("div", { class: "day-meta" }, so.total ? pbar(so.solved, so.total, "Solved") : null);
    day.conceptIds.forEach((cid) => {
      const c = plan.concepts[cid];
      if (!c) return;
      meta.appendChild(h("a", { class: "chip concept", href: "#concept/" + encodeURIComponent(cid), title: "Open concept page" }, c.name));
      const next = MD.nextRevision(state.progress, "concept", cid);
      if (next) meta.appendChild(h("a", { class: "chip rev", href: "#revisions", title: next.reason || "" }, "↻ " + fmtDate(next.dueDate) + " · " + relDay(next.dueDate) + (next.state === "suggested" ? " (suggested)" : "")));
    });
    card.appendChild(meta);
    card.appendChild(renderTimeLog(day.id));
    day.conceptIds.forEach((cid) => { if (plan.concepts[cid]) card.appendChild(conceptNotes(cid)); });
  }

  const shown = single ? day.problemIds : visible;
  const list = h("div", { class: "problems" });
  shown.forEach((pid) => list.appendChild(problemRow(pid, { dayId: day.id, conceptId: null, rerender })));
  if (shown.length) card.appendChild(list);
  else if (single) card.appendChild(h("p", { class: "daynote", text: "No problems scheduled for this day yet." }));
  if (single) card.appendChild(h("div", { class: "day-actions" },
    btn("+ Add problem", () => addProblemDialog({ dayId: day.id, conceptId: day.conceptIds[0], onDone: rerender }), "tbtn"),
    btn("+ Custom problem", () => addProblemDialog({ dayId: day.id, conceptId: day.conceptIds[0], tab: "custom", onDone: rerender }), "tbtn ghost")));
  return card;
}

// concept notes block (concepts/<cid>.md), loaded on first open
export function conceptNotes(cid, opts) {
  opts = opts || {};
  const c = state.plan.concepts[cid];
  const box = h("div", { class: "concept" });
  const toggle = h("button", { type: "button", class: "prob-toggle", text: (opts.label || "Concept notes") + (opts.showName ? "" : " · " + c.name) });
  const bar = h("div", { class: "concept-bar" }, toggle);
  const link = repoLink(MD.conceptPath(cid), "concept .md");
  if (link) bar.appendChild(link);
  const body = h("div", { class: "prob-body concept-body", hidden: !opts.open });
  box.append(bar, body);
  let ed = null;
  function openEditor() {
    if (ed) return;
    body.innerHTML = "";
    ed = mdEditor({
      label: "Concept notes — " + c.name,
      placeholder: "Template, invariant, when to reach for it, common traps…\nPaste images straight in. - [ ] task lists are clickable in the preview.",
      baseFile: MD.conceptPath(cid),
      upload: (file) => uploadImage(file, (ext) => MD.conceptImagePath(cid, ext), "Add concept image for " + cid),
      onChange: (v) => setConceptNotes(cid, v)
    });
    ed.setDisabled(true, "Loading notes from " + MD.conceptPath(cid) + "…");
    body.appendChild(ed.el);
    state.conceptEditors[cid] = ed;
    loadConceptNotes(cid).then((n) => { ed.setValue(n.text, n.text ? "preview" : "write"); ed.setDisabled(false); })
      .catch((err) => { console.error(err); ed.setDisabled(true, "Couldn't load concept notes (" + err.message + "). Close and reopen to retry."); ed = null; delete state.conceptEditors[cid]; });
  }
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? (opts.label || "Concept notes") + (opts.showName ? "" : " · " + c.name) : "Hide concept notes";
    if (!body.hidden) openEditor();
  });
  if (opts.open) openEditor();
  return box;
}

function pager() {
  const plan = state.plan, i = P.dayIndex(plan, currentDay);
  const nav = h("div", { class: "pager" });
  [[i - 1, 0], [i + 1, 1]].forEach(([j, k]) => {
    const d = plan.days[j];
    const b = btn(d ? (k ? "" : "← ") + "Day " + (j + 1) + ": " + d.title + (k ? " →" : "") : "-", () => { if (d) location.hash = "#day/" + d.id; }, "tbtn");
    if (!d) b.style.visibility = "hidden";
    nav.appendChild(b);
  });
  return nav;
}

// ---- header day navigation ----
function optionLabel(d, i) {
  const dp = state.progress.days[d.id] || {};
  const mins = MD.dayMinutes(dp);
  return "Day " + (i + 1) + " · " + d.title + (dp.done ? "  ✓" : "") + (mins ? "  · " + MD.fmtMinutes(mins) : "") + (runningSession(dp) ? "  ⏱" : "");
}
export function syncDayNav() {
  const sel = document.getElementById("daySelect");
  if (!sel) return;
  const plan = state.plan;
  const sig = plan.days.map((d) => d.id + d.phaseId).join("|") + plan.phases.map((p) => p.title).join("|");
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = "";
    let group = null, last = null;
    plan.days.forEach((d, i) => {
      if (d.phaseId !== last) {
        last = d.phaseId;
        const ph = P.phaseById(plan, d.phaseId);
        group = h("optgroup", { label: ph ? ph.title : "Unphased" });
        sel.appendChild(group);
      }
      group.appendChild(h("option", { value: d.id }));
    });
    sel.dataset.sig = sig;
  }
  Array.prototype.forEach.call(sel.options, (o) => { const i = P.dayIndex(plan, o.value); o.textContent = optionLabel(plan.days[i], i); });
  if (currentDay) sel.value = currentDay;
  const i = P.dayIndex(plan, currentDay);
  document.getElementById("prevDay").disabled = i <= 0;
  document.getElementById("nextDay").disabled = i >= plan.days.length - 1;
}
