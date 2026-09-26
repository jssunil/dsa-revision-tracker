// Per-day time log: timer, quick durations, editable sessions (progress.days[id].sessions).
import { isoLocal, fmtClock, fmtDate, pad, esc } from "./util.js";
import { state, dayProg, touchProgDay, emit } from "./store.js";
import { confirmBox } from "./ui.js";
const MD = window.DSA_MD, P = window.DSA_PLAN;

export function runningSession(dp) {
  return ((dp && dp.sessions) || []).filter((s) => s.start && !s.end)[0] || null;
}
export function runningDay() {
  for (const d of state.plan.days) if (runningSession(state.progress.days[d.id])) return d.id;
  return null;
}
function sessions(id) { const dp = dayProg(id); if (!dp.sessions) dp.sessions = []; return dp.sessions; }
const toInput = (iso) => (iso ? isoLocal(new Date(iso)).slice(0, 16) : "");
const fromInput = (v) => (v ? isoLocal(new Date(v)) : null);
function roundedNow() { const d = new Date(); d.setSeconds(0, 0); return d; }

async function startTimer(id) {
  const other = runningDay();
  if (other != null && other !== id) {
    const ok = await confirmBox("Day " + P.dayNumber(state.plan, other) + " has a running timer. Stop it and start this day?", "Switch timer");
    if (!ok) return false;
    stopTimer(other);
  }
  if (runningSession(state.progress.days[id])) return true;
  sessions(id).push({ start: isoLocal(new Date()), end: null });
  touchProgDay(id);
  return true;
}
export function stopTimer(id) {
  const s = runningSession(state.progress.days[id]);
  if (!s) return;
  const end = new Date();
  if (end - Date.parse(s.start) < 60000) sessions(id).splice(sessions(id).indexOf(s), 1);   // under a minute: a misclick
  else s.end = isoLocal(end);
  touchProgDay(id);
}
function logDuration(id, minutes) {
  const end = roundedNow();
  sessions(id).push({ start: isoLocal(new Date(end - minutes * 60000)), end: isoLocal(end) });
  touchProgDay(id);
}

export function renderTimeLog(dayId) {
  const box = document.createElement("div"); box.className = "timelog";
  const bar = document.createElement("div"); bar.className = "tl-bar";
  const total = document.createElement("div"); total.className = "tl-total";
  const timerBtn = document.createElement("button"); timerBtn.type = "button"; timerBtn.className = "tbtn tl-timer";
  bar.append(total, timerBtn);
  box.appendChild(bar);

  const quick = document.createElement("div"); quick.className = "tl-quick";
  quick.innerHTML = '<span class="mini-label">Log time ending now</span>';
  [[15, "15m"], [30, "30m"], [45, "45m"], [60, "1h"], [90, "1.5h"], [120, "2h"]].forEach(([m, t]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chipbtn"; b.textContent = "+" + t;
    b.addEventListener("click", () => { logDuration(dayId, m); refresh(); });
    quick.appendChild(b);
  });
  const custom = document.createElement("button"); custom.type = "button"; custom.className = "chipbtn ghost"; custom.textContent = "+ custom";
  custom.title = "Add a session and set the start and end yourself";
  custom.addEventListener("click", () => { logDuration(dayId, 60); refresh(true); });
  quick.appendChild(custom);
  box.appendChild(quick);

  const list = document.createElement("div"); list.className = "tl-list";
  box.appendChild(list);

  timerBtn.addEventListener("click", async () => {
    if (runningSession(state.progress.days[dayId])) stopTimer(dayId);
    else if (!(await startTimer(dayId))) return;
    refresh();
  });

  function refresh(focusLast) {
    const dp = state.progress.days[dayId] || {};
    const run = runningSession(dp);
    timerBtn.textContent = run ? "■ Stop timer" : "▶ Start timer";
    timerBtn.classList.toggle("primary", !run);
    timerBtn.classList.toggle("running", !!run);
    paintTotal();
    list.innerHTML = "";
    (dp.sessions || []).map((s, i) => ({ s, i })).sort((a, b) => Date.parse(a.s.start) - Date.parse(b.s.start))
      .forEach((x) => list.appendChild(sessionRow(x.s, x.i)));
    if (focusLast) { const rows = list.querySelectorAll(".tl-row"); const last = rows[rows.length - 1]; if (last) last.querySelector("input").focus(); }
    emit("chrome");
  }
  function paintTotal() {
    const dp = state.progress.days[dayId] || {};
    const mins = MD.dayMinutes(dp), dates = MD.datesWorked(dp), run = runningSession(dp), n = (dp.sessions || []).length;
    total.innerHTML =
      '<span class="tl-mins">' + MD.fmtMinutes(mins) + "</span>" +
      '<span class="tl-meta">' + (n ? n + " session" + (n === 1 ? "" : "s") : "no time logged yet") +
      (dates.length ? " · " + dates.map((d) => fmtDate(d)).join(", ") : "") + "</span>" +
      (run ? '<span class="tl-live" data-start="' + esc(run.start) + '">⏱ ' + fmtClock(Date.now() - Date.parse(run.start)) + "</span>" : "");
  }
  box._paint = paintTotal;

  function sessionRow(s, idx) {
    const row = document.createElement("div"); row.className = "tl-row";
    const a = document.createElement("input"); a.type = "datetime-local"; a.step = 60; a.value = toInput(s.start); a.setAttribute("aria-label", "Start");
    const arrow = document.createElement("span"); arrow.className = "tl-arrow"; arrow.textContent = "→";
    const b = document.createElement("input"); b.type = "datetime-local"; b.step = 60; b.value = toInput(s.end); b.setAttribute("aria-label", "End");
    const dur = document.createElement("span"); dur.className = "tl-dur";
    const x = document.createElement("button"); x.type = "button"; x.className = "lnkx"; x.textContent = "×"; x.title = "Delete session";
    function paintDur() {
      const bad = s.end && Date.parse(s.end) <= Date.parse(s.start);
      row.classList.toggle("bad", !!bad);
      dur.textContent = !s.end ? "running" : bad ? "end before start" : MD.fmtMinutes(MD.sessionMinutes(s));
      const spans = s.end && s.start.slice(0, 10) !== s.end.slice(0, 10);
      dur.title = spans ? "Crosses midnight: counts for " + MD.datesWorked({ sessions: [s] }).map((d) => fmtDate(d)).join(" and ") : "";
      if (spans && !bad) dur.textContent += " ☾";
    }
    a.addEventListener("change", () => {
      if (!a.value) { a.value = toInput(s.start); return; }
      const shift = s.end ? Date.parse(s.end) - Date.parse(s.start) : 0;
      const wasValid = s.end && shift > 0;
      s.start = fromInput(a.value);
      // moving the start keeps the duration when the session was valid (easy to shift a whole block)
      if (wasValid && Date.parse(s.end) <= Date.parse(s.start)) { s.end = isoLocal(new Date(Date.parse(s.start) + shift)); b.value = toInput(s.end); }
      changed();
    });
    b.addEventListener("change", () => {
      if (!b.value) { if (s.end) b.value = toInput(s.end); return; }
      s.end = fromInput(b.value);
      changed();
    });
    x.addEventListener("click", () => { sessions(dayId).splice(idx, 1); touchProgDay(dayId); refresh(); });
    function changed() { paintDur(); touchProgDay(dayId); paintTotal(); emit("chrome"); }
    paintDur();
    if (!s.end) b.disabled = true;
    row.append(a, arrow, b, dur, x);
    return row;
  }
  refresh();
  return box;
}

// live clock for a running timer (day card + header pill)
let tickTimer = null;
export function ensureTicker() {
  const running = runningDay() != null;
  if (running && !tickTimer) tickTimer = setInterval(tick, 1000);
  if (!running && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  tick();
}
function tick() {
  document.querySelectorAll(".tl-live").forEach((el) => {
    el.textContent = "⏱ " + fmtClock(Date.now() - Date.parse(el.getAttribute("data-start")));
  });
  const pill = document.getElementById("runningPill");
  const rd = runningDay();
  if (!pill) return;
  if (rd == null) { pill.hidden = true; return; }
  const run = runningSession(state.progress.days[rd]);
  pill.hidden = false;
  pill.textContent = "⏱ Day " + P.dayNumber(state.plan, rd) + " · " + fmtClock(Date.now() - Date.parse(run.start));
  pill.onclick = () => { location.hash = "#day/" + rd; };
  if (new Date().getSeconds() === 0) document.querySelectorAll(".timelog").forEach((b) => { if (b._paint) b._paint(); });
}
export { pad };
