// Problem row (day + concept views), pattern verification, and the "Add problem" dialog.
import { state, prob, touchProgProblem, touchProblem, touchDay, onProblemStatus, emit } from "./store.js";
import { uploadImage } from "./github.js";
import { h, btn, chip, modal, toast, confirmBox, promptBox, verifyBadge, diffBadge } from "./ui.js";
import { solutionField, imageField, repoLink } from "./fields.js";
import { mdEditor, renderMarkdown } from "./editor.js";
import * as gw from "./gateway.js";
import { shortUrl, fmtDate, relDay } from "./util.js";
const P = window.DSA_PLAN, MD = window.DSA_MD;

const STATUSES = ["todo", "solved", "review"];
const STATUS_LABEL = { todo: "To do", solved: "Solved", review: "Needs review" };

// ---------------- verification ----------------
// Verifies pid against conceptId (default: its home concept). Updates plan + marks dirty. Returns verification.
export async function verifyProblem(pid, conceptId) {
  const p = state.plan.problems[pid];
  const cid = conceptId || p.conceptIds[0];
  if (!cid) throw new Error("Assign a concept first");
  const res = await gw.verify(gw.payload(state.plan, p, cid));
  applyResult(p, res, cid);
  touchProblem(pid);
  return p.verification;
}
function applyResult(p, res, cid) {
  p.verification = gw.toVerification(res, cid);
  if (p.kind === "leetcode" && res.known) {
    if (res.title && (!p.title || p.title === P.titleFromSlug(p.slug))) p.title = res.title;
    if (res.diff && /^[EMH]$/.test(res.diff)) p.diff = res.diff;
  }
}
export async function gatewayAvailable() { return (await gw.health()).ok; }

// ---------------- problem row ----------------
// ctx = { dayId?, conceptId?, rerender? }
export function problemRow(pid, ctx) {
  ctx = ctx || {};
  const plan = state.plan, P0 = plan.problems[pid];
  if (!P0) return h("div", { class: "prob missing" }, "Missing problem: " + pid);
  const p = prob(pid);
  const row = h("div", { class: "prob status-" + (p.status || "todo") });
  const url = P.problemUrl(P0);

  const title = h("div", { class: "prob-title" },
    url ? h("a", { href: url, target: "_blank", rel: "noopener", text: P0.title }) : h("span", { class: "ptitle", text: P0.title }),
    diffBadge(P0.diff),
    P0.kind === "custom" ? chip("custom", "custom") : null,
    verifyBadge(P0));
  const statusSel = h("div", { class: "statusseg" });
  STATUSES.forEach((s) => {
    const b = h("button", { type: "button", class: "seg " + s + (p.status === s ? " on" : ""), text: STATUS_LABEL[s] });
    b.addEventListener("click", () => {
      if (prob(pid).status === s) return;
      prob(pid).status = s;
      if (s === "solved" || s === "review") prob(pid).revisedAt = new Date().toISOString();
      onProblemStatus(pid, s);
      touchProgProblem(pid);
      statusSel.querySelectorAll(".seg").forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
      row.className = "prob status-" + s;
      emit("chrome");
      if (s !== "todo") {
        const r = window.DSA_SRS.openFor(state.progress, { type: "problem", id: pid });
        if (r && r.state === "suggested") toast("Revision suggested for " + fmtDate(r.dueDate) + " (" + relDay(r.dueDate) + ") — see Revisions", "ok");
      }
    });
    statusSel.appendChild(b);
  });
  const toggle = h("button", { type: "button", class: "prob-toggle", text: bodyLabel(pid) });
  const header = h("div", { class: "prob-head" }, title, statusSel, toggle);
  row.appendChild(header);

  const body = h("div", { class: "prob-body", hidden: true });
  row.appendChild(body);
  let built = false, sol = null, notesEd = null;
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? bodyLabel(pid) : "Hide";
    if (!body.hidden && !built) { build(); built = true; }
    if (!body.hidden) { sol.open(); }
  });

  function build() {
    // meta: concepts, days, next revision, actions
    const meta = h("div", { class: "prob-meta" });
    P0.conceptIds.forEach((cid) => { if (plan.concepts[cid]) meta.appendChild(h("a", { class: "chip concept", href: "#concept/" + encodeURIComponent(cid), text: plan.concepts[cid].name })); });
    if (!P0.conceptIds.length) meta.appendChild(chip("no concept", "warn"));
    const next = MD.nextRevision(state.progress, "problem", pid);
    if (next) meta.appendChild(h("a", { class: "chip rev", href: "#revisions", title: next.reason || "" }, "↻ " + fmtDate(next.dueDate) + (next.state === "suggested" ? " (suggested)" : "")));
    if (P0.verification && P0.verification.reason) meta.appendChild(h("span", { class: "vreason", text: P0.verification.reason }));
    body.appendChild(meta);

    // links
    const links = h("div", { class: "linkrow" });
    if (url) links.appendChild(h("a", { class: "lnk", href: url, target: "_blank", rel: "noopener" }, P0.kind === "leetcode" ? "LeetCode" : "Problem link"));
    if (P0.kind === "leetcode") links.appendChild(h("a", { class: "lnk", href: url + "solutions/", target: "_blank", rel: "noopener" }, "Worked solutions"));
    const page = repoLink(MD.problemReadmePath(pid), "Repo page");
    if (page) links.appendChild(page);
    const custom = h("span", { class: "linkrow custom" });
    function renderCustomLinks() {
      custom.innerHTML = "";
      prob(pid).links.forEach((u, i) => {
        custom.appendChild(h("span", { class: "lnkwrap" },
          h("a", { class: "lnk user", href: u, target: "_blank", rel: "noopener", text: shortUrl(u) }),
          h("button", { type: "button", class: "lnkx", title: "Remove link", on: { click: () => { prob(pid).links.splice(i, 1); touchProgProblem(pid); renderCustomLinks(); } } }, "×")));
      });
      custom.appendChild(btn("+ link", async () => {
        const u = await promptBox("Add a reference", "Worked example / editorial / video URL", "", "Add");
        if (!u) return;
        if (!/^https?:\/\//i.test(u.trim())) { toast("Enter a full URL starting with http(s)://", "warn"); return; }
        prob(pid).links.push(u.trim()); touchProgProblem(pid); renderCustomLinks();
      }, "lnkadd"));
    }
    renderCustomLinks();
    links.appendChild(custom);
    body.appendChild(links);

    // actions
    const actions = h("div", { class: "prob-actions" });
    const vbtn = btn("Check pattern", async () => {
      vbtn.disabled = true; vbtn.textContent = "Checking…";
      try {
        const v = await verifyProblem(pid, ctx.conceptId);
        toast(v.status === "verified" ? "Fits the pattern (" + Math.round((v.confidence || 0) * 100) + "%)" : v.status === "mismatch" ? "Better fit elsewhere — see the reason" : "Couldn't verify: " + (v.reason || "unknown problem"), v.status === "verified" ? "ok" : "warn");
        ctx.rerender && ctx.rerender();
      } catch (e) { toast("Pattern check unavailable: " + e.message + ". Run python server/serve.py locally.", "warn"); }
      vbtn.disabled = false; vbtn.textContent = "Check pattern";
    }, "chipbtn");
    actions.appendChild(vbtn);
    if (P0.kind === "custom") actions.appendChild(btn("Edit problem", () => editCustomDialog(pid, ctx.rerender), "chipbtn"));
    if (ctx.dayId != null) actions.appendChild(btn("Remove from this day", async () => {
      if (!(await confirmBox("Remove “" + P0.title + "” from this day? Its notes, status and solution are kept.", "Remove"))) return;
      P.removeProblemFromDay(plan, ctx.dayId, pid); touchDay(ctx.dayId); ctx.rerender && ctx.rerender();
    }, "chipbtn ghost"));
    body.appendChild(actions);

    if (P0.kind === "custom" && P0.statement) {
      const st = h("div", { class: "mdpreview statement" });
      renderMarkdown(st, P0.statement, MD.problemReadmePath(pid), () => {});
      body.appendChild(h("div", {}, h("div", { class: "mini-label", text: "Problem" }), st));
    }

    sol = solutionField(pid);
    body.appendChild(sol.el);

    const slot = h("div");
    body.appendChild(slot);
    notesEd = mdEditor({
      label: "Notes", placeholder: "Key idea, pitfalls, complexity, why it works…\nPaste images straight in.",
      baseFile: MD.problemReadmePath(pid),
      upload: (file) => uploadImage(file, (ext) => MD.problemImagePath(pid, ext), "Add note image for " + pid),
      onChange: (v) => { prob(pid).notes = v; touchProgProblem(pid); }
    });
    const text = prob(pid).notes || "";
    notesEd.setValue(text, text ? "preview" : "write");
    slot.appendChild(notesEd.el);

    body.appendChild(imageField("Handwritten notes (paste or upload images)", () => prob(pid).images,
      (file) => uploadImage(file, (ext) => MD.problemImagePath(pid, ext), "Add note image for " + pid),
      () => touchProgProblem(pid)));
  }
  return row;
}
function bodyLabel(pid) {
  const p = state.progress.problems[pid] || {}, bits = [];
  if (p.solution && (p.solution.path || p.code)) bits.push("code");
  if (p.notes && p.notes.trim()) bits.push("notes");
  if (p.images && p.images.length) bits.push(p.images.length + " img");
  if (p.links && p.links.length) bits.push(p.links.length + " link");
  return bits.length ? "Notes (" + bits.join(", ") + ")" : "Add notes";
}

// ---------------- dialogs ----------------
function conceptSelect(value, allowNone) {
  const sel = h("select", { class: "sel" });
  if (allowNone) sel.appendChild(h("option", { value: "", text: "— no concept —" }));
  P.conceptsOrdered(state.plan).forEach((c) => sel.appendChild(h("option", { value: c.id, text: c.name })));
  sel.value = value || (allowNone ? "" : (sel.options[0] || {}).value);
  return sel;
}
function daySelect(value) {
  const sel = h("select", { class: "sel" }, h("option", { value: "", text: "— not scheduled —" }));
  state.plan.days.forEach((d, i) => sel.appendChild(h("option", { value: d.id, text: "Day " + (i + 1) + " · " + d.title })));
  sel.value = value == null ? "" : String(value);
  return sel;
}
const diffSelect = (v) => { const s = h("select", { class: "sel" }, ["E", "M", "H"].map((d) => h("option", { value: d, text: { E: "Easy", M: "Medium", H: "Hard" }[d] }))); s.value = v || "M"; return s; };
const field = (label, input, hint) => h("label", { class: "field" }, h("span", { text: label }), input, hint ? h("small", { class: "hint", text: hint }) : null);

/* Add problem: LeetCode (URL/slug) or custom. opts = { dayId, conceptId, tab, onDone } */
export function addProblemDialog(opts) {
  opts = opts || {};
  let tab = opts.tab || "leetcode";
  let result = null;          // last verification result (server JSON)
  let resultFor = null;       // key of the input it was computed for
  let override = false;

  const tabs = h("div", { class: "mdseg tabs" });
  const lcPane = h("div", { class: "pane" });
  const cuPane = h("div", { class: "pane" });

  // LeetCode inputs
  const lcInput = h("input", { type: "text", placeholder: "https://leetcode.com/problems/two-sum/  or  two-sum", autocomplete: "off" });
  const lcParsed = h("small", { class: "hint" });
  const lcTitle = h("input", { type: "text", placeholder: "Title (filled in by the check)" });
  const lcDiff = diffSelect("M");
  lcPane.append(field("LeetCode URL or slug", lcInput), lcParsed, h("div", { class: "row2" }, field("Title", lcTitle), field("Difficulty", lcDiff)));
  lcInput.addEventListener("input", () => {
    const slug = P.parseLeetCode(lcInput.value);
    const existing = slug && state.plan.problems[slug];
    lcParsed.textContent = !lcInput.value.trim() ? "" : !slug ? "Not a LeetCode problem URL or slug" :
      existing ? "Already in your plan as “" + existing.title + "” — it will be linked to this concept/day" : "Slug: " + slug;
    lcParsed.className = "hint" + (lcInput.value.trim() && !slug ? " bad" : "");
    if (slug && !lcTitle.value) lcTitle.placeholder = existing ? existing.title : P.titleFromSlug(slug);
    if (existing) { lcTitle.value = existing.title; lcDiff.value = existing.diff; }
    clearResult();
  });

  // custom inputs
  const cuTitle = h("input", { type: "text", placeholder: "e.g. Merge K sorted buckets" });
  const cuDiff = diffSelect("M");
  const cuUrl = h("input", { type: "url", placeholder: "Optional link (HackerRank, blog, book page…)" });
  let cuText = "";
  const cuStatement = mdEditor({ label: "Problem statement", placeholder: "Describe the problem, input/output, constraints and an example.",
    baseFile: "problems/new/README.md", upload: (file) => uploadImage(file, (ext) => "problems/_uploads/" + Date.now() + "." + ext, "Add problem image"), onChange: (v) => { cuText = v; clearResult(); } });
  cuPane.append(h("div", { class: "row2" }, field("Title", cuTitle), field("Difficulty", cuDiff)), field("Link", cuUrl), cuStatement.el);
  cuTitle.addEventListener("input", clearResult);

  // shared
  const conceptSel = conceptSelect(opts.conceptId, true);
  const daySel = daySelect(opts.dayId);
  conceptSel.addEventListener("change", clearResult);
  const shared = h("div", { class: "row2" }, field("Concept (pattern)", conceptSel), field("Schedule on day", daySel));
  const resultBox = h("div", { class: "vresult", hidden: true });
  const verifyBtn = btn("Check pattern fit", runVerify, "tbtn");
  const status = h("small", { class: "hint gwstatus" });
  const saveBtn = btn("Add problem", save, "tbtn primary");

  function setTab(t) {
    tab = t;
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === t));
    lcPane.hidden = t !== "leetcode"; cuPane.hidden = t !== "custom";
    clearResult();
  }
  [["leetcode", "LeetCode problem"], ["custom", "Custom problem"]].forEach(([t, label]) => {
    const b = h("button", { type: "button", text: label }); b.dataset.t = t;
    b.addEventListener("click", () => setTab(t));
    tabs.appendChild(b);
  });

  function key() {
    return tab + "|" + (tab === "leetcode" ? P.parseLeetCode(lcInput.value) : cuTitle.value + "|" + cuText) + "|" + conceptSel.value;
  }
  function clearResult() { result = null; resultFor = null; override = false; resultBox.hidden = true; resultBox.innerHTML = ""; }
  function draft() {
    if (tab === "leetcode") {
      const slug = P.parseLeetCode(lcInput.value);
      if (!slug) throw new Error("Enter a LeetCode problem URL or slug");
      return { kind: "leetcode", slug, title: lcTitle.value.trim() || P.titleFromSlug(slug), diff: lcDiff.value };
    }
    if (!cuTitle.value.trim()) throw new Error("Give the problem a title");
    return { kind: "custom", title: cuTitle.value.trim(), diff: cuDiff.value, url: cuUrl.value.trim() || null, statement: cuText };
  }

  async function runVerify() {
    let d;
    try { d = draft(); } catch (e) { toast(e.message, "warn"); return; }
    if (!conceptSel.value) { toast("Pick the concept to check against", "warn"); return; }
    verifyBtn.disabled = true; verifyBtn.textContent = "Checking…";
    try {
      result = await gw.verify(gw.payload(state.plan, d, conceptSel.value));
      resultFor = key();
      if (tab === "leetcode" && result.known) {
        if (result.title && !lcTitle.value.trim()) lcTitle.value = result.title;
        if (result.diff && /^[EMH]$/.test(result.diff)) lcDiff.value = result.diff;
      }
      showResult();
    } catch (e) {
      resultBox.hidden = false;
      resultBox.className = "vresult muted";
      resultBox.innerHTML = "";
      resultBox.append(h("b", { text: "Pattern check unavailable. " }),
        h("span", { text: e.message + ". The problem can still be added — it's saved as unverified and you can check it later from the laptop (python server/serve.py)." }));
    }
    verifyBtn.disabled = false; verifyBtn.textContent = "Check pattern fit";
  }
  function showResult() {
    const v = gw.toVerification(result, conceptSel.value);
    resultBox.hidden = false; resultBox.innerHTML = "";
    const pctTxt = v.confidence != null ? " (" + Math.round(v.confidence * 100) + "%)" : "";
    const name = (id) => (state.plan.concepts[id] || {}).name || id;
    if (v.status === "verified") {
      resultBox.className = "vresult ok";
      resultBox.append(h("b", { text: "✓ Fits " + name(conceptSel.value) + pctTxt + ". " }), h("span", { text: v.reason }));
    } else if (v.status === "mismatch") {
      resultBox.className = "vresult warn";
      const better = v.suggestedConceptIds.filter((id) => id !== conceptSel.value && state.plan.concepts[id]);
      resultBox.append(h("b", { text: "⚠ Doesn't clearly train " + name(conceptSel.value) + ". " }), h("span", { text: v.reason }));
      const acts = h("div", { class: "vacts" });
      better.slice(0, 3).forEach((id) => acts.appendChild(btn("Move to " + name(id), () => { conceptSel.value = id; result.fits = true; result.bestConceptIds = [id]; resultFor = key(); showResult(); }, "chipbtn")));
      acts.appendChild(btn(override ? "✓ Keeping it here" : "Keep here anyway", () => { override = true; showResult(); }, "chipbtn ghost"));
      resultBox.appendChild(acts);
    } else {
      resultBox.className = "vresult muted";
      resultBox.append(h("b", { text: "? Couldn't verify. " }), h("span", { text: v.reason || "The model didn't recognise this problem — add it as a custom problem with its statement." }));
    }
    if (result.provider) resultBox.appendChild(h("small", { class: "hint", text: "via " + result.provider + " / " + result.model }));
  }

  function save() {
    let d;
    try { d = draft(); } catch (e) { toast(e.message, "warn"); return; }
    if (result && resultFor === key()) {
      d.verification = gw.toVerification(result, conceptSel.value);
      if (d.verification.status === "mismatch" && override) d.verification.status = "overridden";
    }
    const existing = d.kind === "leetcode" && state.plan.problems[d.slug];
    const pr = P.addProblem(state.plan, d, { conceptId: conceptSel.value || null, dayId: daySel.value || null });
    if (existing) {
      if (d.verification) pr.verification = d.verification;
      if (lcTitle.value.trim()) pr.title = lcTitle.value.trim();
      pr.diff = lcDiff.value;
    }
    touchProblem(pr.id);
    if (daySel.value) touchDay(daySel.value);
    m.close();
    toast("Added “" + pr.title + "”" + (pr.verification.status === "unverified" ? " (unverified)" : ""), "ok");
    opts.onDone && opts.onDone(pr);
  }

  const body = h("div", { class: "addprob" }, tabs, lcPane, cuPane, shared, h("div", { class: "vrow" }, verifyBtn, status), resultBox);
  const m = modal("Add problem", body, [btn("Cancel", () => m.close()), saveBtn], { wide: true });
  setTab(tab);
  gw.health().then((hl) => {
    status.textContent = hl.ok ? "Pattern checker online (" + hl.providers.filter((x) => x.keyPresent).map((x) => x.name).join(", ") + ")"
      : "Pattern checker offline — problems are added as unverified";
    status.classList.toggle("bad", !hl.ok);
  });
  setTimeout(() => (tab === "leetcode" ? lcInput : cuTitle).focus(), 30);
}

// edit a custom problem's title / difficulty / link / statement
export function editCustomDialog(pid, rerender) {
  const p = state.plan.problems[pid];
  const t = h("input", { type: "text", value: p.title });
  const d = diffSelect(p.diff);
  const u = h("input", { type: "url", value: p.url || "" });
  let text = p.statement || "";
  const ed = mdEditor({ label: "Problem statement", placeholder: "", baseFile: MD.problemReadmePath(pid),
    upload: (file) => uploadImage(file, (ext) => MD.problemImagePath(pid, ext), "Add problem image for " + pid), onChange: (v) => { text = v; } });
  ed.setValue(text, "write");
  const m = modal("Edit problem", h("div", {}, h("div", { class: "row2" }, field("Title", t), field("Difficulty", d)), field("Link", u), ed.el), [
    btn("Cancel", () => m.close()),
    btn("Save", () => {
      p.title = t.value.trim() || p.title; p.diff = d.value; p.url = u.value.trim() || null; p.statement = text;
      if (p.verification && p.verification.status !== "unverified") p.verification = Object.assign({}, p.verification, { status: "unverified", reason: "Edited since the last check" });
      touchProblem(pid); m.close(); rerender && rerender();
    }, "tbtn primary")
  ], { wide: true });
}
