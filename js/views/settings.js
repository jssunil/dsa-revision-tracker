// Settings: GitHub connection, encrypted settings (passphrase), Google Calendar, revision rules, LLM gateway, data.
import { state, cfg, settingsStatus, createSettings, unlockSettings, lockSettings, changePassphrase, touchSettings,
  rebuildDocs, load, exportBundle, importBundle, SETTINGS_DEFAULTS, emit } from "../store.js";
import { saveCfg, ghReady } from "../github.js";
import * as cal from "../calendar.js";
import * as gw from "../gateway.js";
import { h, btn, chip, toast, confirmBox } from "../ui.js";
import { download } from "../util.js";

export function render(root) {
  root.innerHTML = "";
  const rerender = () => render(root);
  root.appendChild(h("div", { class: "view-head" }, h("div", {}, h("h2", { class: "view-title", text: "Settings" }),
    h("p", { class: "view-sub", text: "GitHub is per browser. Everything else is saved encrypted in your repo (data/settings.enc.json) and follows you to every device." }))));
  root.appendChild(githubSection(rerender));
  root.appendChild(secureSection(rerender));
  const locked = settingsStatus() !== "unlocked";
  root.appendChild(calendarSection(rerender, locked));
  root.appendChild(revisionSection(locked));
  root.appendChild(gatewaySection(locked));
  root.appendChild(dataSection());
}

const field = (label, input, hint) => h("label", { class: "field" }, h("span", { text: label }), input, hint ? h("small", { class: "hint", html: hint }) : null);
function card(title, sub, ...children) {
  return h("section", { class: "section settings-card" }, h("div", { class: "section-head" }, h("h3", { text: title })), sub ? h("p", { class: "daynote", html: sub }) : null, ...children);
}

// ---- GitHub ----
function githubSection(rerender) {
  const owner = h("input", { type: "text", value: cfg.owner, placeholder: "your GitHub username", autocomplete: "off" });
  const repo = h("input", { type: "text", value: cfg.repo, placeholder: "repository name", autocomplete: "off" });
  const branch = h("input", { type: "text", value: cfg.branch, autocomplete: "off" });
  const token = h("input", { type: "password", value: cfg.token, placeholder: "github_pat_…", autocomplete: "off" });
  return card("GitHub repository", "The app reads and writes <code>data/</code>, <code>problems/</code>, <code>concepts/</code> and <code>schedule.md</code> in your repo. The token stays in this browser only.",
    h("div", { class: "row2" }, field("Owner", owner), field("Repository", repo)),
    h("div", { class: "row2" }, field("Branch", branch), field("Fine-grained token (Contents: read & write, this repo only)", token)),
    h("details", { class: "help" }, h("summary", { text: "How to create the token (60 seconds)" }), h("ol", { html:
      "<li>GitHub → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>" +
      "<li><b>Repository access</b> → Only select repositories → this repo.</li><li><b>Permissions</b> → Contents → <b>Read and write</b>.</li><li>Generate, copy <code>github_pat_…</code>, paste above.</li>" })),
    h("div", { class: "dlg-actions" },
      btn("Clear token", () => { saveCfg({ token: "" }); token.value = ""; toast("Token cleared on this browser", "ok"); emit("reload"); }),
      ghReady() ? btn("Regenerate markdown", async (e) => {
        e.target.disabled = true;
        try { await rebuildDocs(); toast("Markdown regenerated", "ok"); } catch (err) { toast("Rebuild failed: " + err.message, "err"); }
        e.target.disabled = false;
      }) : null,
      btn("Save & connect", () => {
        saveCfg({ owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || "main", token: token.value.trim() });
        toast(ghReady() ? "Connected — loading from GitHub…" : "Saved (local-only until a token is set)", "ok");
        emit("reload");
      }, "tbtn primary")));
}

// ---- encrypted settings ----
function secureSection(rerender) {
  const status = settingsStatus();
  const pass = h("input", { type: "password", placeholder: "Passphrase", autocomplete: "new-password" });
  const pass2 = h("input", { type: "password", placeholder: "Repeat passphrase", autocomplete: "new-password" });
  const body = [];
  if (status === "none") {
    body.push(h("p", { class: "daynote", text: "No settings file yet. Choose a passphrase to create data/settings.enc.json (AES-GCM, key derived with PBKDF2). You'll enter it once per browser session. There's no recovery — if you forget it, just create new settings." }),
      h("div", { class: "row2" }, pass, pass2),
      h("div", { class: "dlg-actions" }, btn("Create encrypted settings", async () => {
        if (pass.value.length < 8) { toast("Use at least 8 characters", "warn"); return; }
        if (pass.value !== pass2.value) { toast("Passphrases don't match", "warn"); return; }
        await createSettings(pass.value); toast("Encrypted settings created", "ok"); rerender();
      }, "tbtn primary")));
  } else if (status === "locked") {
    body.push(h("p", { class: "daynote", text: "Settings are encrypted. Unlock to use Google Calendar and your revision rules on this device." }),
      h("div", { class: "vrow" }, pass, btn("Unlock", async () => {
        try { await unlockSettings(pass.value); toast("Unlocked", "ok"); rerender(); } catch (e) { toast(e.message, "err"); pass.select(); }
      }, "tbtn primary")));
    pass.addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.nextSibling.click(); });
  } else {
    body.push(h("p", {}, chip("Unlocked", "ok"), h("span", { class: "daynote", text: " Changes below are encrypted and committed with your next save." })),
      h("details", { class: "help" }, h("summary", { text: "Change passphrase" }), h("div", { class: "row2" }, pass, pass2),
        btn("Change passphrase", async () => {
          if (pass.value.length < 8 || pass.value !== pass2.value) { toast("Passphrases must match (8+ characters)", "warn"); return; }
          await changePassphrase(pass.value); toast("Passphrase changed", "ok"); rerender();
        }, "tbtn")),
      h("div", { class: "dlg-actions" }, btn("Lock on this device", () => { lockSettings(); cal.disconnect(); rerender(); })));
  }
  return card("Encrypted settings", null, ...body);
}
function lockedNote(locked) { return locked ? h("p", { class: "locked-note", text: "🔒 Create or unlock the encrypted settings above to edit this." }) : null; }

// ---- Google Calendar ----
function calendarSection(rerender, locked) {
  const g = locked ? SETTINGS_DEFAULTS.google : state.settings.google;
  const set = (k, v) => { state.settings.google[k] = v; touchSettings(); };
  const clientId = h("input", { type: "text", value: g.clientId || "", placeholder: "1234…-abc.apps.googleusercontent.com", disabled: locked });
  clientId.addEventListener("change", () => { set("clientId", clientId.value.trim()); cal.disconnect(); rerender(); });
  const calSel = h("select", { class: "sel", disabled: locked }, h("option", { value: g.calendarId || "primary", text: g.calendarId === "primary" || !g.calendarId ? "Primary calendar" : g.calendarId }));
  calSel.addEventListener("change", () => set("calendarId", calSel.value));
  const time = h("input", { type: "time", value: g.defaultTime, disabled: locked });
  time.addEventListener("change", () => set("defaultTime", time.value || "19:00"));
  const dur = h("input", { type: "number", min: 5, max: 480, step: 5, value: g.durationMin, disabled: locked });
  dur.addEventListener("change", () => set("durationMin", +dur.value || 45));
  const rem = h("input", { type: "number", min: 0, max: 1440, step: 5, value: g.reminderMin, disabled: locked });
  rem.addEventListener("change", () => set("reminderMin", +rem.value));
  const tzIn = h("input", { type: "text", value: g.timeZone || "", placeholder: Intl.DateTimeFormat().resolvedOptions().timeZone, disabled: locked });
  tzIn.addEventListener("change", () => set("timeZone", tzIn.value.trim()));
  const auto = h("input", { type: "checkbox", checked: !!g.autoCreateOnAccept, disabled: locked });
  auto.addEventListener("change", () => set("autoCreateOnAccept", auto.checked));
  const statusChip = h("span");
  const paintStatus = () => { statusChip.innerHTML = ""; statusChip.appendChild(cal.connected() ? chip("Connected", "ok") : chip(g.clientId ? "Not connected" : "No client ID", "muted")); };
  paintStatus();

  const origins = [location.origin].concat(location.origin.indexOf("localhost") < 0 ? ["http://localhost:8765"] : []).filter((o) => /^https?:/.test(o));
  const guide = h("details", { class: "help" }, h("summary", { text: "Set up Google OAuth (about 10 minutes, once)" }), h("ol", { html:
    '<li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud Console → New project</a> (any name, e.g. “DSA tracker”).</li>' +
    '<li><a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener">APIs &amp; Services → Library → Google Calendar API</a> → <b>Enable</b>.</li>' +
    '<li><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">OAuth consent screen</a>: User type <b>External</b>, app name, your email. Leave it in <b>Testing</b> and add <b>your own Google account</b> under <b>Test users</b>.</li>' +
    '<li><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credentials</a> → <b>Create credentials → OAuth client ID</b> → type <b>Web application</b>.</li>' +
    "<li><b>Authorized JavaScript origins</b>: add " + origins.map((o) => "<code>" + o + "</code>").join(" and ") + " (and your GitHub Pages origin, e.g. <code>https://&lt;you&gt;.github.io</code>). No redirect URIs are needed.</li>" +
    "<li>Copy the <b>Client ID</b> into the field below and click <b>Connect</b>. The client ID is not a secret, but it's stored encrypted anyway; access tokens stay in memory only.</li>" }));

  return card("Google Calendar", "Without setup, every revision still has an <b>Add to Google Calendar</b> link and an <b>.ics</b> download. With an OAuth client ID, accepted revisions become real events that move when you reschedule and disappear when you skip.",
    lockedNote(locked), guide,
    field("OAuth client ID", clientId),
    h("div", { class: "vrow" }, statusChip,
      btn("Connect", async () => {
        try { await cal.connect(true); paintStatus(); toast("Google Calendar connected", "ok"); await loadCals(); }
        catch (e) { toast(e.message, "err"); }
      }, "tbtn primary", { disabled: locked || !g.clientId }),
      btn("Disconnect", () => { cal.disconnect(); paintStatus(); }, "tbtn", { disabled: locked }),
      btn("Send test event", async () => {
        try {
          const d = new Date(Date.now() + 864e5), ymd = window.DSA_PLAN.localYmd(d);
          const res = await cal.upsert({ id: "test-" + Date.now(), summary: "DSA tracker test event", description: "Created from Settings. Safe to delete.",
            date: ymd, time: time.value || "19:00", durationMin: 15, reminderMin: 10 });
          toast("Test event created for tomorrow", "ok");
          window.open(res.htmlLink, "_blank", "noopener");
        } catch (e) { toast(e.message, "err"); }
      }, "tbtn", { disabled: locked || !g.clientId })),
    h("div", { class: "row2" }, field("Calendar", calSel, "Connect to pick another calendar"), field("Time zone", tzIn)),
    h("div", { class: "row3" }, field("Default time", time), field("Duration (min)", dur), field("Reminder (min before)", rem)),
    h("label", { class: "check" }, auto, h("span", { text: " Create the event automatically when I accept a revision" })));

  async function loadCals() {
    try {
      const list = await cal.listCalendars();
      calSel.innerHTML = "";
      list.forEach((c) => calSel.appendChild(h("option", { value: c.primary ? "primary" : c.id, text: c.summary + (c.primary ? " (primary)" : "") })));
      calSel.value = g.calendarId || "primary";
    } catch (e) { toast("Couldn't list calendars: " + e.message, "warn"); }
  }
  if (!locked && cal.connected()) loadCals();
}

// ---- revision rules ----
function revisionSection(locked) {
  const r = locked ? SETTINGS_DEFAULTS.revision : state.settings.revision;
  const ladder = h("input", { type: "text", value: r.ladderDays.join(", "), disabled: locked });
  ladder.addEventListener("change", () => {
    const v = ladder.value.split(/[,\s]+/).map(Number).filter((n) => n > 0);
    if (!v.length) { toast("Enter day gaps like 1, 3, 7, 14, 30", "warn"); return; }
    state.settings.revision.ladderDays = v; touchSettings();
  });
  const max = h("input", { type: "number", min: 1, max: 30, value: r.maxPerDay, disabled: locked });
  max.addEventListener("change", () => { state.settings.revision.maxPerDay = Math.max(1, +max.value || 4); touchSettings(); });
  const bundle = h("input", { type: "checkbox", checked: r.bundleWeakProblems !== false, disabled: locked });
  bundle.addEventListener("change", () => { state.settings.revision.bundleWeakProblems = bundle.checked; touchSettings(); });
  return card("Revision rules", "Each concept/problem climbs a ladder of gaps. <b>Easy</b> skips a rung, <b>Good</b> climbs one, <b>Hard</b> drops one and comes back tomorrow.",
    lockedNote(locked),
    h("div", { class: "row2" }, field("Ladder (days)", ladder, "Default 1, 3, 7, 14, 30, 60"), field("Max revisions per day", max, "Busier days push new suggestions forward (up to 2 days)")),
    h("label", { class: "check" }, bundle, h("span", { text: " List a concept's “needs review” problems in its revision event" })));
}

// ---- LLM gateway ----
function gatewaySection(locked) {
  const g = locked ? SETTINGS_DEFAULTS.gateway : state.settings.gateway;
  const url = h("input", { type: "url", value: g.url || "", placeholder: "Blank = the server this page came from (" + gw.base() + ")", disabled: locked });
  url.addEventListener("change", () => { state.settings.gateway.url = url.value.trim(); touchSettings(); });
  const tier = h("select", { class: "sel", disabled: locked }, ["verify", "fast", "quality", "default"].map((t) => h("option", { value: t, text: t })));
  tier.value = g.tier || "verify";
  tier.addEventListener("change", () => { state.settings.gateway.tier = tier.value; touchSettings(); });
  const out = h("div", { class: "gw-out" });
  async function check() {
    out.innerHTML = "Checking " + gw.base() + " …";
    const r = await gw.health(true);
    out.innerHTML = "";
    if (!r.ok) {
      out.appendChild(h("p", { class: "locked-note", html: "Offline (" + r.error + "). Start it with <code>python server/serve.py</code> and open the app from <code>http://localhost:8765</code>. Keys come from <code>.env</code> (see <code>.env.example</code>)." }));
      return;
    }
    out.appendChild(h("table", { class: "gw-table" }, h("tr", {}, h("th", { text: "Provider" }), h("th", { text: "Model" }), h("th", { text: "Key" }), h("th", { text: "Calls" })),
      r.providers.map((p) => h("tr", {}, h("td", { text: p.name }), h("td", { text: p.model || "" }), h("td", { text: p.keyPresent ? "✓" : "—" }), h("td", { text: (r.ledger.byProvider || {})[p.name] || "" })))));
    out.appendChild(h("small", { class: "daynote", text: "Tier order (" + (r.tiers[g.tier || "verify"] || []).join(" → ") + "). Session: " + r.ledger.calls + " call(s), ~" + r.ledger.tokens + " tokens, ~$" + (r.ledger.costUsd || 0).toFixed(4) + "." }));
  }
  const c = card("LLM pattern checker", "Runs through the local companion server (<code>server/serve.py</code>) using the multi-provider gateway with free providers first. Only available when you open the app from that server.",
    lockedNote(locked), h("div", { class: "row2" }, field("Gateway URL", url), field("Tier", tier)), h("div", { class: "vrow" }, btn("Check connection", check, "tbtn")), out);
  check();
  return c;
}

// ---- data ----
function dataSection() {
  const file = h("input", { type: "file", accept: "application/json", hidden: true });
  file.addEventListener("change", () => {
    const f = file.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const data = JSON.parse(r.result);
        if (!(await confirmBox("Import " + f.name + "? It replaces " + (data.format === "dsa-tracker-export" ? "the plan, progress and notes" : "progress") + " and saves.", "Import", true))) return;
        importBundle(data); emit("reload-soft"); toast("Imported — saving…", "ok");
      } catch (e) { toast("Import failed: " + e.message, "err"); }
    };
    r.readAsText(f); file.value = "";
  });
  return card("Data", "Export everything (plan, progress, concept notes) as one JSON file; import it on another setup or to restore. A plain <code>progress.json</code> (old format) can be imported too.",
    h("div", { class: "dlg-actions" },
      btn("Export", () => download("dsa-tracker-export.json", JSON.stringify(exportBundle(), null, 2), "application/json")),
      h("label", { class: "tbtn" }, "Import", file),
      btn("Reload from GitHub", async () => { await load(); emit("reload-soft"); toast("Reloaded", "ok"); }, "tbtn", { disabled: !ghReady() })));
}
