// Plan editor: phases, days (reorder / add / edit / delete), start date, new concept wizard.
import { state, touchDay, touchOrder, touchPhases, touchMeta, touchConcept, emit } from "../store.js";
import { h, btn, chip, modal, toast, confirmBox, promptBox, kindChip } from "../ui.js";
import { fmtDate } from "../util.js";
const P = window.DSA_PLAN, MD = window.DSA_MD;

export function render(root) {
  const plan = state.plan;
  root.innerHTML = "";
  const rerender = () => { render(root); emit("chrome"); };

  const start = h("input", { type: "date", value: plan.meta.startDate || "", title: "Day 1's date; later days follow in order" });
  start.addEventListener("change", () => { plan.meta.startDate = start.value || null; touchMeta(); rerender(); });
  const st = P.stats(plan, state.progress, MD.dayMinutes);
  root.appendChild(h("div", { class: "view-head" },
    h("div", {}, h("h2", { class: "view-title", text: "Plan" }),
      h("p", { class: "view-sub", text: plan.days.length + " days · " + st.concepts + " concepts · " + st.problems + " problems. Reorder, add or edit days and concepts; progress stays attached." })),
    h("div", { class: "view-tools" },
      h("label", { class: "inline-field" }, h("span", { text: "Start date" }), start),
      btn("+ New concept", () => newConceptDialog({ onDone: (c) => { location.hash = "#concept/" + encodeURIComponent(c.id); } }), "tbtn primary"),
      btn("+ Add day", () => addDayAt({}, rerender), "tbtn"),
      btn("+ Phase", async () => {
        const t = await promptBox("New phase", "Phase title", "", "Add phase");
        if (!t || !t.trim()) return;
        plan.phases.push({ id: P.newId("p-"), title: t.trim() }); touchPhases(); rerender();
      }, "tbtn"))));

  const phases = plan.phases.slice();
  const orphan = plan.days.filter((d) => !P.phaseById(plan, d.phaseId));
  if (orphan.length) phases.push({ id: null, title: "Unphased" });
  phases.forEach((ph, pi) => {
    const days = plan.days.filter((d) => (ph.id ? d.phaseId === ph.id : !P.phaseById(plan, d.phaseId)));
    const title = h("input", { type: "text", class: "phase-title-input", value: ph.title, disabled: !ph.id, "aria-label": "Phase title" });
    title.addEventListener("change", () => { ph.title = title.value.trim() || ph.title; touchPhases(); emit("chrome"); });
    const sec = h("section", { class: "plan-phase" },
      h("div", { class: "phase-head" }, h("span", { class: "phase-idx", text: "PHASE " + (pi + 1) }), title,
        ph.id ? btn("+ day", () => addDayAt({ phaseId: ph.id }, rerender), "chipbtn") : null,
        ph.id && !days.length ? btn("Delete phase", () => { plan.phases.splice(plan.phases.indexOf(ph), 1); touchPhases(); rerender(); }, "chipbtn ghost") : null));
    const list = h("div", { class: "plan-days" });
    days.forEach((d) => list.appendChild(dayRow(d, rerender)));
    if (!days.length) list.appendChild(h("p", { class: "daynote", text: "No days in this phase." }));
    sec.appendChild(list);
    root.appendChild(sec);
  });
}

function dayRow(d, rerender) {
  const plan = state.plan, i = P.dayIndex(plan, d.id);
  const dp = state.progress.days[d.id] || {};
  const row = h("div", { class: "plan-day" + (dp.done ? " done" : "") });

  const up = btn("↑", () => { P.moveDay(plan, d.id, -1); touchOrder(); touchDay(d.id); rerender(); }, "navbtn sm", { title: "Move up", disabled: i === 0 });
  const down = btn("↓", () => { P.moveDay(plan, d.id, 1); touchOrder(); touchDay(d.id); rerender(); }, "navbtn sm", { title: "Move down", disabled: i === plan.days.length - 1 });

  const title = h("input", { type: "text", class: "pd-title", value: d.title, "aria-label": "Day title" });
  title.addEventListener("change", () => { d.title = title.value.trim() || d.title; touchDay(d.id); emit("chrome"); });
  const kind = h("select", { class: "sel sm", "aria-label": "Kind" }, Object.keys(P.KINDS).map((k) => h("option", { value: k, text: P.KINDS[k] })));
  kind.value = d.kind;
  kind.addEventListener("change", () => { d.kind = kind.value; touchDay(d.id); });

  const date = h("input", { type: "date", class: "pd-date", value: d.plannedDate || "", title: "Planned date (leave empty to follow the start date)" });
  const computed = P.plannedDate(plan, Object.assign({}, d, { plannedDate: null }));
  if (!d.plannedDate && computed) date.placeholder = computed;
  date.addEventListener("change", () => { d.plannedDate = date.value || null; touchDay(d.id); rerender(); });

  // concepts
  const concepts = h("div", { class: "pd-concepts" });
  d.conceptIds.forEach((cid) => {
    const c = plan.concepts[cid];
    if (!c) return;
    concepts.appendChild(h("span", { class: "chip concept" },
      h("a", { href: "#concept/" + encodeURIComponent(cid), text: c.name }),
      h("button", { type: "button", class: "lnkx", title: "Remove concept from this day", on: { click: () => { d.conceptIds.splice(d.conceptIds.indexOf(cid), 1); touchDay(d.id); rerender(); } } }, "×")));
  });
  const addSel = h("select", { class: "sel sm", "aria-label": "Add concept" }, h("option", { value: "", text: "+ concept" }),
    P.conceptsOrdered(plan).filter((c) => d.conceptIds.indexOf(c.id) < 0).map((c) => h("option", { value: c.id, text: c.name })),
    h("option", { value: "__new", text: "New concept…" }));
  addSel.addEventListener("change", () => {
    if (addSel.value === "__new") { newConceptDialog({ dayId: d.id, onDone: rerender }); addSel.value = ""; return; }
    if (addSel.value) { d.conceptIds.push(addSel.value); touchDay(d.id); rerender(); }
  });
  concepts.appendChild(addSel);

  const so = P.solvedOf(state.progress, d.problemIds.filter((pid) => plan.problems[pid]));
  const info = h("span", { class: "pd-info" },
    h("a", { href: "#day/" + d.id, title: "Open day" }, so.total ? so.solved + "/" + so.total + " solved" : "no problems"),
    MD.dayMinutes(dp) ? " · " + MD.fmtMinutes(MD.dayMinutes(dp)) : "", dp.done ? " · ✓" : "");

  const focus = h("textarea", { class: "notes sm", rows: 2, placeholder: "Focus (one line shown under the title)" });
  focus.value = d.focus || "";
  focus.addEventListener("change", () => { d.focus = focus.value; touchDay(d.id); });
  const note = h("textarea", { class: "notes sm", rows: 2, placeholder: "Note (small print)" });
  note.value = d.note || "";
  note.addEventListener("change", () => { d.note = note.value; touchDay(d.id); });
  const phaseSel = h("select", { class: "sel sm", "aria-label": "Phase" }, state.plan.phases.map((p) => h("option", { value: p.id, text: p.title })));
  phaseSel.value = d.phaseId;
  phaseSel.addEventListener("change", () => {
    d.phaseId = phaseSel.value;
    // keep the array grouped by phase: move the day to the end of its new phase
    plan.days.splice(P.dayIndex(plan, d.id), 1);
    let at = plan.days.length;
    for (let k = plan.days.length - 1; k >= 0; k--) if (plan.days[k].phaseId === d.phaseId) { at = k + 1; break; }
    plan.days.splice(at, 0, d);
    touchDay(d.id); touchOrder(); rerender();
  });
  const details = h("details", { class: "pd-details" }, h("summary", { text: "Details" }),
    h("div", { class: "pd-detail-grid" }, h("label", { class: "field" }, h("span", { text: "Phase" }), phaseSel), focus, note));

  const del = btn("Delete", async () => {
    const ok = await confirmBox("Delete Day " + (i + 1) + " “" + d.title + "”? Problems stay in the plan (and in their concepts); the day's time log stays in progress.json.", "Delete day", true);
    if (!ok) return;
    P.deleteDay(plan, d.id); touchDay(d.id); touchOrder(); rerender();
    toast("Day deleted", "ok");
  }, "chipbtn ghost danger-text");

  row.append(
    h("div", { class: "pd-order" }, up, h("span", { class: "pd-num", text: i + 1 }), down),
    h("div", { class: "pd-main" },
      h("div", { class: "pd-line" }, title, kind, date),
      h("div", { class: "pd-line" }, concepts),
      h("div", { class: "pd-line" }, info, h("span", { class: "spacer" }),
        btn("+ day after", () => addDayAt({ afterDayId: d.id }, rerender), "chipbtn"), del),
      details));
  return row;
}

async function addDayAt(where, rerender) {
  const t = await promptBox("Add a day", "Title (e.g. the pattern or “Revision — week 5”)", "", "Add day");
  if (t == null) return;
  const plan = state.plan;
  if (!plan.phases.length) { plan.phases.push({ id: P.newId("p-"), title: "Phase 1" }); touchPhases(); }
  const d = P.addDay(plan, { title: t.trim() || "New day", kind: "custom" }, where);
  touchDay(d.id); touchOrder();
  rerender();
  toast("Added Day " + P.dayNumber(plan, d.id), "ok");
}

/* New concept wizard. opts = { dayId? (attach to this day), onDone(concept) } */
export function newConceptDialog(opts) {
  opts = opts || {};
  const plan = state.plan;
  const name = h("input", { type: "text", placeholder: "e.g. Meet in the Middle" });
  const summary = h("input", { type: "text", placeholder: "One line: what it is / the core move" });
  const triggers = h("input", { type: "text", placeholder: "Comma-separated cues, e.g. n ≤ 40, subset sums, split in halves" });
  const tags = h("input", { type: "text", placeholder: "LeetCode tags, e.g. Bit Manipulation, Divide and Conquer" });
  const makeDay = h("input", { type: "checkbox", checked: !opts.dayId });
  const phaseSel = h("select", { class: "sel" }, plan.phases.map((p) => h("option", { value: p.id, text: p.title })), h("option", { value: "__new", text: "New phase…" }));
  phaseSel.value = (plan.phases[plan.phases.length - 1] || {}).id || "__new";
  const afterSel = h("select", { class: "sel" }, h("option", { value: "", text: "At the end of the phase" }),
    plan.days.map((d, i) => h("option", { value: d.id, text: "After Day " + (i + 1) + " · " + d.title })));
  const dayOpts = h("div", { class: "row2" }, h("label", { class: "field" }, h("span", { text: "Phase" }), phaseSel), h("label", { class: "field" }, h("span", { text: "Position" }), afterSel));
  const syncDayOpts = () => { dayOpts.hidden = !makeDay.checked; };
  makeDay.addEventListener("change", syncDayOpts);
  const body = h("div", {},
    h("label", { class: "field" }, h("span", { text: "Name *" }), name),
    h("label", { class: "field" }, h("span", { text: "Summary" }), summary),
    h("label", { class: "field" }, h("span", { text: "Recognise it when…" }), triggers),
    h("label", { class: "field" }, h("span", { text: "LeetCode topic tags" }), tags),
    opts.dayId ? h("p", { class: "hint", text: "It will be added to Day " + P.dayNumber(plan, opts.dayId) + "." }) :
      h("label", { class: "check" }, makeDay, h("span", { text: " Create a day for this concept" })),
    opts.dayId ? null : dayOpts);
  syncDayOpts();
  const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const m = modal("New concept", body, [
    btn("Cancel", () => m.close()),
    btn("Create concept", async () => {
      if (!name.value.trim()) { toast("Give the concept a name", "warn"); name.focus(); return; }
      const c = P.addConcept(plan, { name: name.value, summary: summary.value.trim(), triggers: split(triggers.value), leetcodeTags: split(tags.value) });
      touchConcept(c.id);
      if (opts.dayId) {
        const d = P.dayById(plan, opts.dayId);
        d.conceptIds.push(c.id); touchDay(d.id);
      } else if (makeDay.checked) {
        let phaseId = phaseSel.value;
        if (phaseId === "__new") {
          const t = await promptBox("New phase", "Phase title", "Custom concepts", "Add phase");
          phaseId = P.newId("p-"); plan.phases.push({ id: phaseId, title: (t || "Custom concepts").trim() }); touchPhases();
        }
        const d = P.addDay(plan, { title: c.name, kind: "new", conceptIds: [c.id], focus: c.summary, phaseId: afterSel.value ? null : phaseId },
          afterSel.value ? { afterDayId: afterSel.value } : { phaseId });
        touchDay(d.id); touchOrder();
        toast("Created " + c.name + " and Day " + P.dayNumber(plan, d.id), "ok");
      } else toast("Created " + c.name, "ok");
      m.close();
      emit("chrome");
      opts.onDone && opts.onDone(c);
    }, "tbtn primary")
  ]);
  setTimeout(() => name.focus(), 30);
}
export { fmtDate, chip, kindChip };
