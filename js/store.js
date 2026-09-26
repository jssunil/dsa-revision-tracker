/* State + persistence.
 *
 *   data/plan.json          the plan (concepts, days, problems)          -> state.plan
 *   data/progress.json      what you did (status, notes, sessions, revisions) -> state.progress
 *   data/settings.enc.json  encrypted preferences (Google Calendar, revision rules, gateway) -> state.settings
 *   concepts/<id>.md        concept notes live in the file's notes block      -> loadConceptNotes()
 *   problems/<id>/solution.<ext>  solution code                              -> loadCode()
 *
 * GitHub mode: every save is ONE commit (Git Data API). The commit re-reads plan.json/progress.json at the
 * branch head, overlays only the entities changed here (per concept/day/problem/revision), writes solution
 * files and regenerates the affected markdown. Local mode: everything in localStorage.
 */
import { cfg, ghReady, ghGet, ghCommit, imgCache } from "./github.js";
import { clone, lsGet, lsSet, ssGet, ssSet, today } from "./util.js";

const P = window.DSA_PLAN, MD = window.DSA_MD, S = window.DSA_SRS, MIG = window.DSA_MIGRATE, CR = window.DSA_CRYPTO;

export const PATHS = { plan: "data/plan.json", progress: "data/progress.json", settings: "data/settings.enc.json" };
const LOCAL = { plan: "dsa_plan_local", progress: "dsa_progress_local", settings: "dsa_settings_local", notes: "dsa_notes_local" };
const KEY_SS = "dsa_settings_key";

export const SETTINGS_DEFAULTS = {
  google: { clientId: "", calendarId: "primary", defaultTime: "19:00", durationMin: 45, reminderMin: 30, timeZone: "",
    colorId: "", autoCreateOnAccept: true, studyDayEvents: false },
  revision: { ladderDays: [1, 3, 7, 14, 30, 60], maxPerDay: 4, bundleWeakProblems: true },
  gateway: { url: "", tier: "verify" }
};

export const state = {
  plan: P.emptyPlan(),
  progress: P.emptyProgress(),
  settingsEnv: null,      // encrypted envelope as stored (null = none yet)
  settings: null,         // decrypted settings, or null while locked / absent
  settingsKey: null,      // derived key for re-encrypting
  needsMigration: false,  // GitHub repo still on v1 (no data/plan.json)
  codeCache: {},          // pid -> { code, lang }
  conceptCache: {},       // cid -> { text, orig }
  conceptEditors: {},     // cid -> editor (to push merged text back)
  localNotes: {}          // local mode: cid -> notes text
};

// ---------------- events ----------------
const listeners = {};
export function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
export function emit(evt, a, b) { (listeners[evt] || []).forEach((fn) => fn(a, b)); }
export const setSync = (s, msg) => emit("sync", s, msg);

// ---------------- dirty tracking ----------------
function freshDirty() {
  return { plan: { concepts: {}, days: {}, problems: {}, order: false, phases: false, meta: false },
    prog: { problems: {}, days: {}, revisions: {}, srs: {} }, code: {}, notes: {}, settings: false };
}
let dirty = freshDirty();
const hasDirty = () => JSON.stringify(dirty) !== JSON.stringify(freshDirty());

export function touchConcept(id) { dirty.plan.concepts[id] = true; scheduleSave(); }
export function touchDay(id) { dirty.plan.days[id] = true; scheduleSave(); }
export function touchProblem(id) { dirty.plan.problems[id] = true; scheduleSave(); }
export function touchOrder() { dirty.plan.order = true; scheduleSave(); }
export function touchPhases() { dirty.plan.phases = true; scheduleSave(); }
export function touchMeta() { dirty.plan.meta = true; scheduleSave(); }
export function touchProgProblem(id) { dirty.prog.problems[id] = true; scheduleSave(); }
export function touchProgDay(id) { dirty.prog.days[id] = true; scheduleSave(); }
export function touchRevision(id) { dirty.prog.revisions[id] = true; scheduleSave(); }
export function touchSrs(key) { dirty.prog.srs[key] = true; scheduleSave(); }
export function touchSettings() { dirty.settings = true; scheduleSave(); }

// ---------------- accessors ----------------
export function prob(pid) {
  const all = state.progress.problems;
  if (!all[pid]) all[pid] = { status: "todo", notes: "", links: [], images: [], revisedAt: null };
  const p = all[pid];
  p.links = p.links || []; p.images = p.images || [];
  return p;
}
export function dayProg(dayId) {
  if (!state.progress.days[dayId]) state.progress.days[dayId] = {};
  return state.progress.days[dayId];
}
export function srsRules() { return (state.settings && state.settings.revision) || SETTINGS_DEFAULTS.revision; }
export function googleCfg() { return Object.assign({}, SETTINGS_DEFAULTS.google, (state.settings && state.settings.google) || {}); }
export function gatewayCfg() { return Object.assign({}, SETTINGS_DEFAULTS.gateway, (state.settings && state.settings.gateway) || {}); }

// ---------------- code & concept notes ----------------
export function setCode(pid, code, lang) {
  state.codeCache[pid] = { code, lang };
  dirty.code[pid] = true;
  touchProgProblem(pid);
}
export function loadCode(pid) {
  if (state.codeCache[pid]) return Promise.resolve(state.codeCache[pid]);
  const p = prob(pid);
  const lang = (p.solution && p.solution.lang) || "cpp";
  if (p.code != null || !(p.solution && p.solution.path) || !ghReady()) {
    state.codeCache[pid] = { code: p.code || "", lang };
    return Promise.resolve(state.codeCache[pid]);
  }
  return ghGet(p.solution.path).then((res) => {
    if (!state.codeCache[pid]) state.codeCache[pid] = { code: res ? res.content : "", lang };
    return state.codeCache[pid];
  });
}
export function loadConceptNotes(cid) {
  if (state.conceptCache[cid]) return Promise.resolve(state.conceptCache[cid]);
  if (!ghReady()) {
    state.conceptCache[cid] = { text: state.localNotes[cid] || "", orig: null };
    return Promise.resolve(state.conceptCache[cid]);
  }
  return ghGet(MD.conceptPath(cid)).then((res) => {
    const block = MD.extractNotes(res && res.content);
    if (!state.conceptCache[cid]) state.conceptCache[cid] = { text: block || "", orig: block || "" };
    return state.conceptCache[cid];
  });
}
export function setConceptNotes(cid, text) {
  state.conceptCache[cid].text = text;
  dirty.notes[cid] = true;
  scheduleSave();
}

// ---------------- revision triggers ----------------
function recordSrs(target, ev) {
  const r = S.record(state.progress, target, Object.assign({ date: today() }, ev), today(), srsRules());
  touchRevision(r.id); touchSrs(S.key(target));
  return r;
}
export function onProblemStatus(pid, status) {
  const p = prob(pid);
  (p.history = p.history || []).push({ at: new Date().toISOString(), event: status });
  if (status === "solved") recordSrs({ type: "problem", id: pid }, { learn: !state.progress.srs["problem:" + pid], outcome: "good", why: "Solved" });
  else if (status === "review") recordSrs({ type: "problem", id: pid }, { outcome: "hard", why: "Marked needs review" });
}
export function onDayDone(dayId) {
  const d = P.dayById(state.plan, dayId);
  if (!d) return;
  d.conceptIds.forEach((cid) => recordSrs({ type: "concept", id: cid }, { learn: !state.progress.srs["concept:" + cid], outcome: "good",
    why: "Day " + P.dayNumber(state.plan, dayId) + " completed" }));
}
export function acceptRevision(id, date, time) { const r = S.accept(state.progress, id, date, time); if (r) touchRevision(id); return r; }
export function skipRevision(id) { const r = S.skip(state.progress, id); if (r) touchRevision(id); return r; }
export function completeRevision(id, outcome) {
  const res = S.complete(state.progress, id, outcome, today(), srsRules());
  if (!res) return null;
  touchRevision(id); touchRevision(res.next.id); touchSrs(S.key(res.done.target));
  if (res.done.target.type === "problem") prob(res.done.target.id).revisedAt = new Date().toISOString(), touchProgProblem(res.done.target.id);
  return res;
}
export function scheduleRevision(target, date, time) {
  const r = S.schedule(state.progress, target, date, time, srsRules());
  touchRevision(r.id); touchSrs(S.key(target));
  return r;
}

// ---------------- load ----------------
export async function load() {
  state.codeCache = {}; state.conceptCache = {}; state.conceptEditors = {};
  state.needsMigration = false;
  if (ghReady()) {
    try {
      const [pl, pr, se] = await Promise.all([ghGet(PATHS.plan), ghGet(PATHS.progress), ghGet(PATHS.settings)]);
      state.progress = P.normalizeProgress(pr && pr.content ? JSON.parse(pr.content) : null);
      state.settingsEnv = se && se.content ? JSON.parse(se.content) : null;
      if (pl && pl.content) state.plan = P.normalizePlan(JSON.parse(pl.content));
      else {
        state.needsMigration = true;
        const res = MIG.run(window.DSA_CATALOG, state.progress, {}, today(), srsRules());
        state.plan = res.plan; state.progress = res.progress;   // preview only; nothing saves until upgraded
      }
      mirrorLocal();
    } catch (err) {
      console.warn("GitHub load failed, using the local copy:", err);
      setSync("error", "Couldn't reach GitHub — using local copy");
      loadLocal();
    }
  } else loadLocal();
  state.settings = null; state.settingsKey = null;
  await tryAutoUnlock();
}
function loadLocal() {
  let prog = null, plan = null;
  try { prog = JSON.parse(lsGet(LOCAL.progress, "null")); } catch (e) {}
  try { plan = JSON.parse(lsGet(LOCAL.plan, "null")); } catch (e) {}
  try { state.settingsEnv = JSON.parse(lsGet(LOCAL.settings, "null")); } catch (e) { state.settingsEnv = null; }
  try { state.localNotes = JSON.parse(lsGet(LOCAL.notes, "{}")) || {}; } catch (e) { state.localNotes = {}; }
  if (plan) {
    state.plan = P.normalizePlan(plan);
    state.progress = P.normalizeProgress(prog);
  } else {   // first run / v1 local data: migrate silently
    const res = MIG.run(window.DSA_CATALOG, prog, {}, today(), srsRules());
    state.plan = res.plan; state.progress = res.progress;
    Object.keys(res.notesByConcept).forEach((cid) => { state.localNotes[cid] = res.notesByConcept[cid]; });
    mirrorLocal();
  }
}
function mirrorLocal() {
  lsSet(LOCAL.plan, JSON.stringify(state.plan));
  lsSet(LOCAL.progress, JSON.stringify(state.progress));
  lsSet(LOCAL.settings, state.settingsEnv ? JSON.stringify(state.settingsEnv) : null);
  lsSet(LOCAL.notes, JSON.stringify(state.localNotes));
}

// ---------------- migration (GitHub repo on v1 -> v2, one commit) ----------------
export function migrateRepo() {
  setSync("saving");
  return ghCommit(async (head) => {
    const pr = await ghGet(PATHS.progress, head);
    const legacy = MIG.legacyPaths(window.DSA_CATALOG);
    const blocks = {}, exists = {};
    await Promise.all(legacy.map((l) => ghGet(l.path, head).then((r) => { if (r) { exists[l.path] = true; blocks[l.dayId] = MD.extractNotes(r.content); } })));
    const res = MIG.run(window.DSA_CATALOG, pr && pr.content ? JSON.parse(pr.content) : null, blocks, today(), srsRules());
    const files = MD.allDocs(res.plan, res.progress, res.notesByConcept);
    files.push({ path: PATHS.plan, content: json(res.plan) }, { path: PATHS.progress, content: json(res.progress) });
    res.removePaths.forEach((p) => { if (exists[p]) files.push({ path: p, remove: true }); });
    return { files, message: "Migrate data to plan v2 (plan.json, concept pages, schedule)", result: res };
  }).then((res) => {
    state.plan = res.plan; state.progress = res.progress; state.needsMigration = false;
    state.conceptCache = {};
    mirrorLocal(); setSync("synced");
    return res;
  }).catch((err) => { console.error(err); setSync("error", "Upgrade failed"); throw err; });
}

// ---------------- encrypted settings ----------------
export function settingsStatus() { return state.settings ? "unlocked" : state.settingsEnv ? "locked" : "none"; }
async function cacheKey(k) { ssSet(KEY_SS, JSON.stringify(await CR.exportKey(k))); }
async function tryAutoUnlock() {
  const saved = ssGet(KEY_SS);
  if (!saved || !state.settingsEnv) return;
  try {
    const k = await CR.importKey(JSON.parse(saved));
    if (k.salt !== state.settingsEnv.kdf.salt) return;
    state.settings = withDefaults(await CR.decryptWithKey(state.settingsEnv, k));
    state.settingsKey = k;
  } catch (e) { ssSet(KEY_SS, null); }
}
function withDefaults(s) {
  const out = clone(SETTINGS_DEFAULTS);
  Object.keys(s || {}).forEach((k) => { out[k] = Object.assign(out[k] || {}, s[k]); });
  return out;
}
export async function createSettings(passphrase) {
  const k = await CR.deriveKey(passphrase);
  state.settings = withDefaults(state.settings || {});
  state.settingsKey = k;
  await cacheKey(k);
  touchSettings();
}
export async function unlockSettings(passphrase) {
  const res = await CR.decrypt(state.settingsEnv, passphrase);   // throws "Wrong passphrase"
  state.settings = withDefaults(res.data); state.settingsKey = res.key;
  await cacheKey(res.key);
  emit("settings");
}
export function lockSettings() { state.settings = null; state.settingsKey = null; ssSet(KEY_SS, null); emit("settings"); }
export async function changePassphrase(passphrase) { await createSettings(passphrase); emit("settings"); }

// ---------------- save ----------------
let saveTimer = null, saving = false, saveQueued = false;
export function scheduleSave() {
  setSync("dirty");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1200);
}
const json = (o) => JSON.stringify(o, null, 2) + "\n";

export async function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  if (saving) { saveQueued = true; return; }
  state.progress.updatedAt = new Date().toISOString();

  let envelope = null;
  if (dirty.settings && state.settings && state.settingsKey) {
    envelope = await CR.encryptWithKey(state.settings, state.settingsKey);
    state.settingsEnv = envelope;
  }

  if (!ghReady()) {
    Object.keys(dirty.code).forEach((pid) => {
      const p = prob(pid), c = state.codeCache[pid];
      p.code = c.code; p.solution = { lang: c.lang, path: p.solution && p.solution.path };
    });
    Object.keys(dirty.notes).forEach((cid) => { if (state.conceptCache[cid]) state.localNotes[cid] = state.conceptCache[cid].text; });
    mirrorLocal();
    dirty = freshDirty();
    setSync("local");
    return;
  }
  if (state.needsMigration) { setSync("error", "Upgrade the repo data first"); return; }

  const snap = dirty; dirty = freshDirty();
  const codeSnap = {}, notesSnap = {};
  Object.keys(snap.code).forEach((pid) => { codeSnap[pid] = clone(state.codeCache[pid]); });
  Object.keys(snap.notes).forEach((cid) => { if (state.conceptCache[cid]) notesSnap[cid] = clone(state.conceptCache[cid]); });
  const localPlan = clone(state.plan), localProg = clone(state.progress);

  saving = true; setSync("saving");
  let merged = [];
  try {
    const res = await ghCommit((head) => buildSave(head, snap, codeSnap, notesSnap, envelope, localPlan, localProg));
    // adopt the committed truth, re-overlaying anything edited while the commit ran
    mergePlan(res.plan, state.plan, dirty.plan);
    mergeProg(res.progress, state.progress, dirty.prog);
    syncInto(res.plan, res.progress);
    Object.keys(res.concepts).forEach((cid) => {
      const r = res.concepts[cid], c = state.conceptCache[cid];
      if (!c) return;
      c.orig = r.text;
      if (c.text === r.mine) {
        c.text = r.text;
        if (r.merged) { merged.push(cid); if (state.conceptEditors[cid]) state.conceptEditors[cid].setValue(r.text, "write"); }
      }
    });
    mirrorLocal();
    setSync("synced");
    emit("saved");
    if (merged.length) emit("toast", "Notes for " + merged.map((c) => (state.plan.concepts[c] || {}).name || c).join(", ") +
      " were also edited on GitHub. Both versions are in the note — merge them and delete the MERGE marker.", "warn");
  } catch (err) {
    console.error(err);
    restore(snap);
    setSync("error", "Save failed — kept locally");
    mirrorLocal();
  } finally {
    saving = false;
    if (saveQueued || hasDirty()) { saveQueued = false; scheduleSave(); }
  }
}
// Copy committed data into the live objects IN PLACE: open views hold references to concept/day/problem/
// revision objects, so identity must survive a save (otherwise later edits would go to detached copies).
function replaceContents(obj, src) {
  Object.keys(obj).forEach((k) => { delete obj[k]; });
  return Object.assign(obj, src);
}
function syncMap(target, source) {
  Object.keys(target).forEach((k) => { if (!(k in source)) delete target[k]; });
  Object.keys(source).forEach((k) => {
    if (target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) replaceContents(target[k], source[k]);
    else target[k] = source[k];
  });
}
function syncInto(plan, progress) {
  const sp = state.plan, pr = state.progress;
  replaceContents(sp.meta, plan.meta);
  sp.phases.splice(0, sp.phases.length, ...plan.phases.map((ph) => { const old = sp.phases.find((x) => x.id === ph.id); return old ? replaceContents(old, ph) : ph; }));
  syncMap(sp.concepts, plan.concepts);
  syncMap(sp.problems, plan.problems);
  const oldDays = {};
  sp.days.forEach((d) => { oldDays[d.id] = d; });
  sp.days.splice(0, sp.days.length, ...plan.days.map((d) => (oldDays[d.id] ? replaceContents(oldDays[d.id], d) : d)));
  ["problems", "days", "revisions", "srs"].forEach((k) => syncMap(pr[k], progress[k]));
  pr.updatedAt = progress.updatedAt; pr.schemaVersion = progress.schemaVersion;
}
function restore(snap) {
  const d = dirty;
  ["concepts", "days", "problems"].forEach((k) => Object.assign(d.plan[k], snap.plan[k]));
  ["order", "phases", "meta"].forEach((k) => { d.plan[k] = d.plan[k] || snap.plan[k]; });
  ["problems", "days", "revisions", "srs"].forEach((k) => Object.assign(d.prog[k], snap.prog[k]));
  Object.assign(d.code, snap.code); Object.assign(d.notes, snap.notes);
  d.settings = d.settings || snap.settings;
}

// overlay `local` entities flagged in `d` onto `base` (both plan docs)
function mergePlan(base, local, d) {
  ["concepts", "problems"].forEach((k) => {
    Object.keys(d[k]).forEach((id) => { if (local[k][id]) base[k][id] = clone(local[k][id]); else delete base[k][id]; });
  });
  const byId = {};
  base.days.forEach((x) => { byId[x.id] = x; });
  const localById = {};
  local.days.forEach((x) => { localById[x.id] = x; });
  Object.keys(d.days).forEach((id) => { if (localById[id]) byId[id] = clone(localById[id]); else delete byId[id]; });
  let order;
  if (d.order) {
    order = local.days.map((x) => x.id).filter((id) => byId[id]);
    base.days.forEach((x) => { if (byId[x.id] && order.indexOf(x.id) < 0) order.push(x.id); });   // added on another device
  } else {
    order = base.days.map((x) => x.id).filter((id) => byId[id]);
    local.days.forEach((x, i) => {
      if (byId[x.id] && order.indexOf(x.id) < 0) {
        const prev = i > 0 ? order.indexOf(local.days[i - 1].id) : -1;
        order.splice(prev + 1, 0, x.id);
      }
    });
  }
  base.days = order.map((id) => byId[id]);
  if (d.phases) base.phases = clone(local.phases);
  if (d.meta) base.meta = clone(local.meta);
}
function mergeProg(base, local, d) {
  ["problems", "days", "revisions", "srs"].forEach((k) => {
    Object.keys(d[k]).forEach((id) => { if (local[k][id]) base[k][id] = clone(local[k][id]); else delete base[k][id]; });
  });
  base.updatedAt = new Date().toISOString();
}

async function buildSave(head, snap, codeSnap, notesSnap, envelope, localPlan, localProg) {
  const [plR, prR] = await Promise.all([ghGet(PATHS.plan, head), ghGet(PATHS.progress, head)]);
  const plan = P.normalizePlan(plR && plR.content ? JSON.parse(plR.content) : clone(localPlan));
  const progress = P.normalizeProgress(prR && prR.content ? JSON.parse(prR.content) : null);
  const files = [];
  const prevConcepts = {};
  Object.keys(plan.problems).forEach((pid) => { prevConcepts[pid] = plan.problems[pid].conceptIds.slice(); });
  const prevDayConcepts = {};
  plan.days.forEach((d) => { prevDayConcepts[d.id] = d.conceptIds.slice(); });

  mergePlan(plan, localPlan, snap.plan);

  // progress problems: code files, data-URL images -> repo files
  const progPids = Object.keys(Object.assign({}, snap.prog.problems, snap.code));
  progPids.forEach((pid) => {
    const local = localProg.problems[pid];
    if (!local) { delete progress.problems[pid]; return; }
    const p = clone(local);
    const old = progress.problems[pid] && progress.problems[pid].solution && progress.problems[pid].solution.path;
    const c = codeSnap[pid] || (p.code != null ? { code: p.code, lang: (p.solution && p.solution.lang) || "cpp" } : null);
    delete p.code;
    if (c) {
      if (c.code.trim()) {
        const path = MD.solutionPath(pid, c.lang);
        files.push({ path, content: c.code.replace(/\s*$/, "\n") });
        p.solution = { lang: c.lang, path };
        if (old && old !== path) files.push({ path: old, remove: true });
      } else {
        if (old) files.push({ path: old, remove: true });
        delete p.solution;
      }
    }
    const imgPath = (ext, i) => MD.problemImagePath(pid, ext).replace(/(\.\w+)$/, "-" + i + "$1");
    p.images = uploadDataImages(p.images, imgPath, files);
    p.notes = uploadDataImagesInMd(p.notes, imgPath, files, MD.problemReadmePath(pid));
    progress.problems[pid] = p;
  });
  ["days", "revisions", "srs"].forEach((k) => {
    Object.keys(snap.prog[k]).forEach((id) => { if (localProg[k][id]) progress[k][id] = clone(localProg[k][id]); else delete progress[k][id]; });
  });
  progress.updatedAt = new Date().toISOString();
  progress.schemaVersion = P.SCHEMA;

  // what to regenerate
  const full = snap.plan.order;
  const affP = {}, affC = {};
  const addC = (ids) => (ids || []).forEach((c) => { affC[c] = true; });
  Object.keys(snap.plan.problems).concat(progPids).forEach((pid) => {
    affP[pid] = true; addC(prevConcepts[pid]); addC(plan.problems[pid] && plan.problems[pid].conceptIds);
  });
  Object.keys(snap.plan.concepts).concat(Object.keys(snap.notes)).forEach((c) => { affC[c] = true; });
  Object.keys(Object.assign({}, snap.plan.days, snap.prog.days)).forEach((id) => {
    addC(prevDayConcepts[id]);
    const d = P.dayById(plan, id);
    if (d) { addC(d.conceptIds); if (snap.plan.days[id]) d.problemIds.forEach((pid) => { affP[pid] = true; }); }
  });
  Object.keys(snap.prog.revisions).forEach((id) => {
    const r = progress.revisions[id];
    if (!r) return;
    if (r.target.type === "concept") affC[r.target.id] = true; else affP[r.target.id] = true;
  });
  if (full) { Object.keys(plan.concepts).forEach((c) => { affC[c] = true; }); Object.keys(plan.problems).forEach((p) => { affP[p] = true; }); }

  Object.keys(affP).forEach((pid) => {
    if (plan.problems[pid]) files.push({ path: MD.problemReadmePath(pid), content: MD.problemReadme(plan, progress, pid) });
  });

  const conceptResults = {};
  await Promise.all(Object.keys(affC).map(async (cid) => {
    const res = await ghGet(MD.conceptPath(cid), head);
    if (!plan.concepts[cid]) { if (res) files.push({ path: MD.conceptPath(cid), remove: true }); return; }
    const remote = MD.extractNotes(res && res.content) || "";
    const mine = notesSnap[cid];
    let text = remote, mergedFlag = false;
    if (mine) {
      text = mine.text;
      if (mine.orig != null && remote !== mine.orig && remote !== mine.text && remote.trim()) {
        text = mine.text + "\n\n<!-- MERGE: the text below was edited on GitHub at the same time. Merge it into the above, then delete this marker and the copy. -->\n\n" + remote;
        mergedFlag = true;
      }
    }
    const imgPath = (ext, i) => MD.conceptImagePath(cid, ext).replace(/(\.\w+)$/, "-" + i + "$1");
    text = uploadDataImagesInMd(text, imgPath, files, MD.conceptPath(cid));
    conceptResults[cid] = { text, mine: mine && mine.text, merged: mergedFlag };
    files.push({ path: MD.conceptPath(cid), content: MD.conceptMd(plan, progress, cid, text) });
  }));

  files.push({ path: MD.CONCEPTS_INDEX, content: MD.conceptsIndex(plan, progress) });
  files.push({ path: MD.SCHEDULE, content: MD.scheduleMd(plan, progress) });
  const planDirty = snap.plan.order || snap.plan.phases || snap.plan.meta ||
    Object.keys(snap.plan.concepts).length || Object.keys(snap.plan.days).length || Object.keys(snap.plan.problems).length;
  if (planDirty) files.push({ path: PATHS.plan, content: json(plan) });
  files.push({ path: PATHS.progress, content: json(progress) });
  if (envelope) files.push({ path: PATHS.settings, content: json(envelope) });

  return { files, message: commitMessage(snap, plan, !!envelope), result: { plan, progress, concepts: conceptResults } };
}
function commitMessage(snap, plan, settings) {
  const bits = [];
  const n = (o) => Object.keys(o).length;
  const pp = Object.keys(Object.assign({}, snap.prog.problems, snap.code));
  if (pp.length) bits.push(pp.slice(0, 3).join(", ") + (pp.length > 3 ? " +" + (pp.length - 3) : ""));
  if (n(snap.plan.concepts) || n(snap.plan.days) || n(snap.plan.problems) || snap.plan.order) bits.push("plan");
  if (n(snap.notes)) bits.push("notes: " + Object.keys(snap.notes).join(", "));
  if (n(snap.prog.days)) bits.push("time/days");
  if (n(snap.prog.revisions)) bits.push("revisions");
  if (settings) bits.push("settings");
  return "Update " + (bits.join("; ") || "progress");
}
// data: URLs (local mode) -> committed files
function uploadDataImages(list, pathFor, files) {
  return (list || []).map((src, i) => {
    const m = /^data:image\/(\w+);base64,(.*)$/.exec(src);
    if (!m) return src;
    const path = pathFor(m[1].replace("jpeg", "jpg"), i);
    files.push({ path, b64: m[2] });
    imgCache[path] = src;
    return path;
  });
}
function uploadDataImagesInMd(text, pathFor, files, mdFile) {
  let i = 0;
  return String(text || "").replace(/\(data:image\/(\w+);base64,([A-Za-z0-9+/=]+)\)/g, (m, ext, b64) => {
    const path = pathFor(ext.replace("jpeg", "jpg"), "md" + i++);
    files.push({ path, b64 });
    imgCache[path] = "data:image/" + ext + ";base64," + b64;
    return "(" + MD.rel(mdFile, path) + ")";
  });
}

// Regenerate every markdown file (concept notes blocks kept).
export function rebuildDocs() {
  setSync("saving");
  return ghCommit(async (head) => {
    const [plR, prR] = await Promise.all([ghGet(PATHS.plan, head), ghGet(PATHS.progress, head)]);
    const plan = P.normalizePlan(JSON.parse(plR.content));
    const progress = P.normalizeProgress(prR && prR.content ? JSON.parse(prR.content) : null);
    const notes = {};
    await Promise.all(Object.keys(plan.concepts).map((cid) => ghGet(MD.conceptPath(cid), head).then((r) => { notes[cid] = MD.extractNotes(r && r.content) || ""; })));
    const files = MD.allDocs(plan, progress, notes);
    return { files, message: "Regenerate markdown (" + files.length + " files)", result: null };
  }).then(() => setSync("synced"), (err) => { console.error(err); setSync("error", "Rebuild failed"); throw err; });
}

// ---------------- export / import ----------------
export function exportBundle() {
  const notes = {};
  Object.keys(state.conceptCache).forEach((cid) => { notes[cid] = state.conceptCache[cid].text; });
  return { format: "dsa-tracker-export", schemaVersion: P.SCHEMA, exportedAt: new Date().toISOString(),
    plan: state.plan, progress: state.progress, conceptNotes: Object.assign({}, state.localNotes, notes) };
}
// accepts an export bundle, or a bare progress.json (v1 or v2)
export function importBundle(data) {
  if (data && data.format === "dsa-tracker-export") {
    state.plan = P.normalizePlan(data.plan);
    state.progress = P.normalizeProgress(data.progress);
    Object.keys(data.conceptNotes || {}).forEach((cid) => {
      state.conceptCache[cid] = { text: data.conceptNotes[cid], orig: null };
      state.localNotes[cid] = data.conceptNotes[cid];
      dirty.notes[cid] = true;
    });
    Object.keys(state.plan.concepts).forEach((k) => { dirty.plan.concepts[k] = true; });
    state.plan.days.forEach((d) => { dirty.plan.days[d.id] = true; });
    Object.keys(state.plan.problems).forEach((k) => { dirty.plan.problems[k] = true; });
    dirty.plan.order = dirty.plan.phases = dirty.plan.meta = true;
  } else {
    const legacy = (data && data.concepts) || {};
    state.progress = P.migrateProgress(data);
    Object.keys(legacy).forEach((dayId) => {
      const d = P.dayById(state.plan, dayId);
      if (!d || !d.conceptIds[0]) return;
      const cid = d.conceptIds[0];
      state.conceptCache[cid] = { text: MD.legacyNotes(cid, legacy[dayId]), orig: null };
      dirty.notes[cid] = true;
    });
    state.progress.concepts = {};
  }
  ["problems", "days", "revisions", "srs"].forEach((k) => Object.keys(state.progress[k]).forEach((id) => { dirty.prog[k][id] = true; }));
  scheduleSave();
}

export { cfg };
