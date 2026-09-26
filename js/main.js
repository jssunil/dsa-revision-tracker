// Boot, hash router, header chrome (stats, progress bar, nav, sync state, banners).
import { state, on, load, migrateRepo, saveNow } from "./store.js";
import { ghReady, cfg } from "./github.js";
import { h, btn, pbar, toast } from "./ui.js";
import { ensureTicker } from "./timelog.js";
import { lsGet, lsSet } from "./util.js";
import * as dayView from "./views/day.js";
import * as planView from "./views/plan.js";
import * as conceptsView from "./views/concepts.js";
import * as revisionsView from "./views/revisions.js";
import * as progressView from "./views/progress.js";
import * as settingsView from "./views/settings.js";
const P = window.DSA_PLAN, MD = window.DSA_MD;

const view = () => document.getElementById("view");
let route = { view: "day" };

function parseHash() {
  const s = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  let m;
  if (!s) return { view: "day" };
  if ((m = /^day[-/](.+)$/.exec(s))) return { view: "day", dayId: m[1] };
  if (s === "plan") return { view: "plan" };
  if (s === "concepts") return { view: "concepts" };
  if ((m = /^concept\/(.+)$/.exec(s))) return { view: "concept", id: m[1] };
  if (s === "revisions") return { view: "revisions" };
  if (s === "progress") return { view: "progress" };
  if (s === "settings") return { view: "settings" };
  return { view: "day" };
}

function render(scroll) {
  route = parseHash();
  const root = view();
  document.body.dataset.view = route.view;
  document.getElementById("dayTools").hidden = route.view !== "day";
  document.querySelectorAll("#nav a").forEach((a) => {
    const v = a.dataset.v;
    a.setAttribute("aria-current", v === route.view || (v === "concepts" && route.view === "concept") ? "page" : "false");
  });
  switch (route.view) {
    case "plan": planView.render(root); break;
    case "concepts": conceptsView.renderList(root); break;
    case "concept": conceptsView.renderPage(root, route); break;
    case "revisions": revisionsView.render(root); break;
    case "progress": progressView.render(root); break;
    case "settings": settingsView.render(root); break;
    default: dayView.render(root, route);
  }
  chrome();
  if (scroll) window.scrollTo(0, 0);
}

// ---- header ----
function chrome() {
  const st = P.stats(state.plan, state.progress, MD.dayMinutes);
  document.getElementById("brandTitle").textContent = state.plan.meta.title || "DSA Revision Tracker";
  const g = document.getElementById("globalBar");
  g.innerHTML = "";
  g.appendChild(pbar(st.solved, st.problems, "Problems solved"));
  const due = Object.values(state.progress.revisions || {}).filter((r) => (r.state === "accepted" && r.dueDate <= window.DSA_PLAN.localYmd()) || r.state === "suggested").length;
  document.getElementById("stats").innerHTML =
    tile(st.daysDone, st.days, "days") + tile(st.conceptsDone, st.concepts, "concepts") + tile(st.solved, st.problems, "solved") +
    tile(st.review, st.problems, "to review", "warn") +
    '<div class="stat"><span class="num">' + MD.fmtMinutes(st.minutes) + '</span><span class="lbl">logged</span></div>';
  const badge = document.getElementById("revBadge");
  badge.textContent = due ? String(due) : ""; badge.hidden = !due;
  if (route.view === "day") dayView.syncDayNav();
  ensureTicker();
}
const tile = (v, t, label, mod) => '<div class="stat ' + (mod || "") + '"><span class="num">' + v + '</span><span class="den">/' + t + '</span><span class="lbl">' + label + "</span></div>";

function setSync(stateName, msg) {
  const el = document.getElementById("syncState");
  const map = {
    synced: ["Synced to GitHub", "ok"], saving: ["Saving…", "busy"], dirty: ["Unsaved changes", "busy"],
    local: ["Local only (not synced)", "warn"], error: [msg || "Error", "err"]
  };
  const m = map[stateName] || [stateName, ""];
  el.textContent = m[0]; el.className = "sync " + m[1];
}
function banners() {
  document.getElementById("banner").hidden = ghReady();
  const mig = document.getElementById("migrateBanner");
  mig.hidden = !state.needsMigration;
}

function wire() {
  document.getElementById("themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next); lsSet("dsa_theme", next);
  });
  document.getElementById("bannerConnect").addEventListener("click", () => { location.hash = "#settings"; });
  document.getElementById("migrateBtn").addEventListener("click", async (e) => {
    e.target.disabled = true; e.target.textContent = "Upgrading…";
    try {
      const res = await migrateRepo();
      toast("Upgraded: plan.json, " + Object.keys(res.plan.concepts).length + " concept pages, schedule.md" + (res.seeded ? ", " + res.seeded + " revision suggestions" : ""), "ok");
      banners(); render();
    } catch (err) { toast("Upgrade failed: " + err.message, "err"); e.target.disabled = false; e.target.textContent = "Upgrade now"; }
  });

  // day toolbar
  document.getElementById("daySelect").addEventListener("change", (e) => { dayView.clearFilters(); location.hash = "#day/" + e.target.value; });
  document.getElementById("prevDay").addEventListener("click", () => { dayView.clearFilters(); dayView.stepDay(-1); });
  document.getElementById("nextDay").addEventListener("click", () => { dayView.clearFilters(); dayView.stepDay(1); });
  const search = document.getElementById("search");
  search.addEventListener("input", () => { dayView.filter.term = search.value.trim().toLowerCase(); render(); });
  document.querySelectorAll("#filters .fbtn").forEach((b) => b.addEventListener("click", () => {
    dayView.filter.status = b.getAttribute("data-f");
    document.querySelectorAll("#filters .fbtn").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  }));
  document.addEventListener("keydown", (e) => {
    if (route.view !== "day" || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowLeft") dayView.stepDay(-1);
    else if (e.key === "ArrowRight") dayView.stepDay(1);
  });

  window.addEventListener("hashchange", () => render(true));
  window.addEventListener("beforeunload", (e) => {
    if (document.getElementById("syncState").classList.contains("busy")) { saveNow(); e.preventDefault(); e.returnValue = ""; }
  });

  on("sync", setSync);
  on("chrome", chrome);
  on("toast", (msg, kind) => toast(msg, kind));
  on("reload", async () => { await boot(); });
  on("reload-soft", () => { banners(); render(); });
  on("settings", () => { if (route.view === "settings") render(); });
}

async function boot() {
  view().innerHTML = '<p class="loading">Loading…</p>';
  await load();
  banners();
  setSync(ghReady() ? (state.needsMigration ? "error" : "synced") : "local", state.needsMigration ? "Upgrade needed" : null);
  render();
}

const t = lsGet("dsa_theme", null);
if (t) document.documentElement.setAttribute("data-theme", t);
wire();
boot();
export { cfg };
