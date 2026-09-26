// Revision planner: suggestions to accept, overdue / today / upcoming, month load grid, calendar actions.
import { state, googleCfg } from "../store.js";
import { h, btn, chip, toast } from "../ui.js";
import { targetInfo, accept, reschedule, done, skip, calendarControls, apiReady } from "../revise.js";
import { fmtDate, relDay, today } from "../util.js";
const P = window.DSA_PLAN, S = window.DSA_SRS;

let monthOffset = 0;

export function render(root) {
  root.innerHTML = "";
  const rerender = () => render(root);
  const t = today();
  const all = S.list(state.progress).filter((r) => targetInfo(r.target));
  const suggested = all.filter((r) => r.state === "suggested");
  const accepted = all.filter((r) => r.state === "accepted");
  const overdue = accepted.filter((r) => r.dueDate < t);
  const dueToday = accepted.filter((r) => r.dueDate === t);
  const soon = accepted.filter((r) => r.dueDate > t && P.diffDays(t, r.dueDate) <= 14);
  const later = accepted.filter((r) => P.diffDays(t, r.dueDate) > 14);
  const recent = all.filter((r) => r.state === "done").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || "")).slice(0, 8);

  const g = googleCfg();
  root.appendChild(h("div", { class: "view-head" },
    h("div", {}, h("h2", { class: "view-title", text: "Revisions" }),
      h("p", { class: "view-sub", text: "Solving a problem or finishing a day suggests a revision on a spaced ladder (" + (state.settings ? state.settings.revision.ladderDays : S.DEFAULTS.ladderDays).join(", ") +
        " days). Accept or change the date; marking it Easy / Good / Hard schedules the next one." })),
    h("div", { class: "view-tools" },
      apiReady() ? chip("Google Calendar connected" + (g.autoCreateOnAccept ? " · auto-add on accept" : ""), "ok") :
        h("a", { class: "chip", href: "#settings", title: "Set up Google Calendar in Settings" }, "Calendar: links & .ics (set up API in Settings)"))));

  root.appendChild(monthGrid(all, rerender));

  if (suggested.length) {
    const sec = section("Suggestions", suggested.length, "Accept to put it on your schedule (and calendar).");
    sec.head.appendChild(btn("Accept all", async () => {
      for (const r of suggested) await accept(r, r.dueDate, r.time || g.defaultTime);
      rerender();
    }, "tbtn primary"));
    suggested.forEach((r) => sec.list.appendChild(suggestionRow(r, rerender)));
    root.appendChild(sec.el);
  }
  [["Overdue", overdue, "warn"], ["Today", dueToday, "ok"], ["Next 14 days", soon, ""], ["Later", later, ""]].forEach(([title, list, cls]) => {
    if (!list.length) return;
    const sec = section(title, list.length, null, cls);
    list.forEach((r) => sec.list.appendChild(acceptedRow(r, rerender)));
    root.appendChild(sec.el);
  });
  if (!suggested.length && !accepted.length) {
    root.appendChild(h("div", { class: "empty" }, h("p", { text: "Nothing planned. Mark a problem Solved or finish a day and a revision will be suggested here." })));
  }
  if (recent.length) {
    const sec = section("Recently done", recent.length);
    recent.forEach((r) => {
      const info = targetInfo(r.target);
      sec.list.appendChild(h("div", { class: "rev-row done" }, h("span", { class: "rev-when", text: fmtDate(r.completedAt.slice(0, 10)) }),
        link(info, r.target), chip(r.outcome || "done", r.outcome === "hard" ? "warn" : "muted")));
    });
    root.appendChild(sec.el);
  }
}

function section(title, n, sub, cls) {
  const head = h("div", { class: "section-head" }, h("h3", { text: title + " (" + n + ")" }), h("span", { class: "spacer" }));
  const list = h("div", { class: "rev-list" });
  const el = h("div", { class: "section " + (cls || "") }, head, sub ? h("p", { class: "daynote", text: sub }) : null, list);
  return { el, head, list };
}
function link(info, target) {
  const href = target.type === "concept" ? info.href : "#day/" + ((P.problemDays(state.plan, target.id)[0] || {}).id || "");
  return h("span", { class: "rev-what" }, chip(info.kind, target.type === "concept" ? "new" : "muted"),
    h("a", { href: target.type === "concept" ? href : (info.href || href), target: target.type === "concept" ? null : "_blank", rel: "noopener", text: info.name }));
}
function dateTime(r) {
  const d = h("input", { type: "date", value: r.dueDate, min: today() });
  const t = h("input", { type: "time", value: r.time || googleCfg().defaultTime || "19:00", step: 300 });
  return { d, t, el: h("span", { class: "rev-dt" }, d, t) };
}
function suggestionRow(r, rerender) {
  const info = targetInfo(r.target), dt = dateTime(r);
  return h("div", { class: "rev-row" },
    h("span", { class: "rev-when", title: r.reason || "" }, fmtDate(r.dueDate), h("small", { text: relDay(r.dueDate) })),
    h("div", { class: "rev-main" }, link(info, r.target), h("small", { class: "daynote", text: r.reason || "" })),
    dt.el,
    btn("Accept", async () => { await accept(r, dt.d.value, dt.t.value); rerender(); }, "tbtn primary"),
    btn("Skip", async () => { await skip(r); toast("Skipped", "ok"); rerender(); }, "chipbtn ghost"));
}
function acceptedRow(r, rerender) {
  const info = targetInfo(r.target), dt = dateTime(r);
  const change = async () => { await reschedule(r, dt.d.value, dt.t.value); rerender(); };
  dt.d.addEventListener("change", change); dt.t.addEventListener("change", change);
  return h("div", { class: "rev-row" + (r.dueDate < today() ? " overdue" : "") },
    h("span", { class: "rev-when" }, fmtDate(r.dueDate), h("small", { text: relDay(r.dueDate) })),
    h("div", { class: "rev-main" }, link(info, r.target), calendarControls(r, rerender)),
    dt.el,
    h("span", { class: "rev-outcome", title: "How did it go? Sets the next gap." },
      ["easy", "good", "hard"].map((o) => btn(o[0].toUpperCase() + o.slice(1), async () => { await done(r, o); rerender(); }, "chipbtn out-" + o))),
    btn("Skip", async () => { await skip(r); rerender(); }, "chipbtn ghost"));
}

function monthGrid(all, rerender) {
  const open = all.filter((r) => r.state === "suggested" || r.state === "accepted");
  const load = {};
  open.forEach((r) => { (load[r.dueDate] = load[r.dueDate] || { s: 0, a: 0 })[r.state === "suggested" ? "s" : "a"]++; });
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
  const y = base.getFullYear(), m = base.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;   // Monday first
  const daysIn = new Date(y, m + 1, 0).getDate();
  const grid = h("div", { class: "mgrid" }, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => h("div", { class: "mg-h", text: d })));
  for (let i = 0; i < first; i++) grid.appendChild(h("div", { class: "mg-c empty" }));
  const t = today();
  for (let d = 1; d <= daysIn; d++) {
    const ymd = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const l = load[ymd];
    grid.appendChild(h("div", { class: "mg-c" + (ymd === t ? " today" : "") + (l ? " has" : ""), title: l ? (l.a ? l.a + " scheduled" : "") + (l.a && l.s ? ", " : "") + (l.s ? l.s + " suggested" : "") : "" },
      h("span", { class: "mg-d", text: d }),
      l ? h("span", { class: "mg-n" + (l.a ? "" : " sugg"), text: l.a + l.s }) : null));
  }
  const title = base.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return h("div", { class: "section mcal" },
    h("div", { class: "section-head" },
      btn("‹", () => { monthOffset--; rerender(); }, "navbtn sm"), h("h3", { text: title }), btn("›", () => { monthOffset++; rerender(); }, "navbtn sm"),
      h("span", { class: "spacer" }), h("small", { class: "daynote", text: "Numbers = revisions due (hollow = suggested only)" })),
    grid);
}
