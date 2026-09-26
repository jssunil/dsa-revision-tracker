// Revision actions shared by views: accept / reschedule / done / skip, with Google Calendar side effects.
import { state, googleCfg, acceptRevision, skipRevision, completeRevision, scheduleRevision, touchRevision, settingsStatus } from "./store.js";
import * as cal from "./calendar.js";
import { h, btn, toast } from "./ui.js";
import { download, fmtDate, relDay } from "./util.js";
const P = window.DSA_PLAN;

export function targetInfo(t) {
  const plan = state.plan;
  if (t.type === "concept") {
    const c = plan.concepts[t.id];
    return c ? { name: c.name, href: "#concept/" + encodeURIComponent(t.id), kind: "Concept" } : null;
  }
  const p = plan.problems[t.id];
  return p ? { name: p.title, href: P.problemUrl(p), kind: "Problem", internal: "#problem/" + encodeURIComponent(t.id) } : null;
}
const appUrl = () => location.origin + location.pathname;

export function eventFor(rev) {
  const g = googleCfg(), t = rev.target, info = targetInfo(t) || { name: t.id };
  const lines = [];
  if (t.type === "concept") {
    lines.push("Revise the " + info.name + " pattern.", "", "Open: " + appUrl() + "#concept/" + encodeURIComponent(t.id));
    const weak = P.conceptProblems(state.plan, t.id).filter((p) => (state.progress.problems[p.id] || {}).status === "review");
    if (weak.length && (state.settings ? state.settings.revision.bundleWeakProblems !== false : true)) {
      lines.push("", "Needs review:");
      weak.forEach((p) => lines.push("• " + p.title + (P.problemUrl(p) ? " — " + P.problemUrl(p) : "")));
    }
  } else {
    const p = state.plan.problems[t.id];
    lines.push("Re-solve " + info.name + " from scratch.", "");
    if (P.problemUrl(p)) lines.push("Problem: " + P.problemUrl(p));
    const hc = P.homeConcept(state.plan, t.id);
    if (hc) lines.push("Pattern: " + hc.name + " — " + appUrl() + "#concept/" + encodeURIComponent(hc.id));
  }
  if (rev.reason) lines.push("", rev.reason);
  return { id: rev.id, summary: "Revise: " + info.name + " (DSA)", description: lines.join("\n"),
    date: rev.dueDate, time: rev.time || g.defaultTime || "19:00", durationMin: +g.durationMin || 45, reminderMin: +g.reminderMin || 30 };
}

export const apiReady = () => settingsStatus() === "unlocked" && cal.hasClient();

// create/update the Google event for an accepted revision (when the API is set up)
export async function syncEvent(rev, interactive) {
  if (!apiReady()) return null;
  if (!cal.connected()) await cal.connect(interactive);
  rev.calendar = await cal.upsert(eventFor(rev), rev.calendar);
  touchRevision(rev.id);
  return rev.calendar;
}
async function dropEvent(rev) {
  if (!rev.calendar || !apiReady()) return;
  try { await cal.remove(rev.calendar); rev.calendar = null; touchRevision(rev.id); }
  catch (e) { toast("Couldn't delete the calendar event: " + e.message, "warn"); }
}

export async function accept(rev, date, time) {
  acceptRevision(rev.id, date, time);
  if (apiReady() && googleCfg().autoCreateOnAccept) {
    try { await syncEvent(rev, true); toast("Accepted · added to Google Calendar", "ok"); }
    catch (e) { toast("Accepted. Calendar: " + e.message, "warn"); }
  } else toast("Revision set for " + fmtDate(rev.dueDate) + " (" + relDay(rev.dueDate) + ")", "ok");
}
export async function reschedule(rev, date, time) {
  rev.dueDate = date; if (time !== undefined) rev.time = time || null;
  touchRevision(rev.id);
  if (rev.calendar && apiReady()) {
    try { await syncEvent(rev, false); } catch (e) { toast("Calendar not updated: " + e.message, "warn"); }
  }
}
export async function done(rev, outcome) {
  const res = completeRevision(rev.id, outcome);
  if (!res) return null;
  toast("Done (" + outcome + "). Next suggested: " + fmtDate(res.next.dueDate) + " (" + relDay(res.next.dueDate) + ")", "ok");
  return res;
}
export async function skip(rev) { skipRevision(rev.id); await dropEvent(rev); }
export async function scheduleFor(target, date, time) {
  const r = scheduleRevision(target, date, time);
  if (apiReady() && googleCfg().autoCreateOnAccept) {
    try { await syncEvent(r, true); } catch (e) { toast("Scheduled. Calendar: " + e.message, "warn"); }
  }
  return r;
}

// calendar buttons for a revision row
export function calendarControls(rev, rerender) {
  const wrap = h("span", { class: "calctl" });
  const ev = () => eventFor(rev);
  if (rev.calendar && rev.calendar.htmlLink) wrap.appendChild(h("a", { class: "lnk", href: rev.calendar.htmlLink, target: "_blank", rel: "noopener", title: "Open in Google Calendar" }, "📅 In calendar"));
  if (apiReady()) {
    wrap.appendChild(btn(rev.calendar ? "Update event" : "Add to calendar", async (e) => {
      e.target.disabled = true;
      try { await syncEvent(rev, true); toast("Calendar updated", "ok"); rerender && rerender(); }
      catch (err) { toast(err.message, "err"); e.target.disabled = false; }
    }, "chipbtn"));
  } else {
    wrap.appendChild(h("a", { class: "chipbtn", href: cal.templateUrl(ev()), target: "_blank", rel: "noopener", title: "Opens Google Calendar with the event filled in" }, "Google Calendar ↗"));
  }
  wrap.appendChild(btn(".ics", () => download("revision-" + rev.dueDate + ".ics", cal.icsText(ev()), "text/calendar"), "chipbtn ghost", { title: "Download an .ics file (any calendar app)" }));
  return wrap;
}
export { cal };
