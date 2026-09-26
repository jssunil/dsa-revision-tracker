/* DSA Revision Tracker — application logic.
 *
 * Data model
 * ----------
 *  catalog.js        -> window.DSA_CATALOG        (static reference; the plan)
 *  data/progress.json-> the SOURCE OF TRUTH for your mutable state:
 *      {
 *        updatedAt: ISO string,
 *        days:     { "1": { done:true }, ... },
 *        problems: { "<slug>": { status, notes, links:[], images:[], revisedAt } }
 *      }
 *  notes-images/     -> committed handwritten-note images referenced by problems[].images
 *
 * Two modes:
 *  - GitHub mode  (owner/repo/branch/token set): reads & writes data/progress.json and
 *                 notes-images/* through the GitHub Contents API. The repo is the truth.
 *  - Local mode   (no token): everything persists in this browser's localStorage. A banner
 *                 explains how to connect GitHub to sync. Export/Import JSON is always available.
 */
(function () {
  "use strict";

  var CAT = window.DSA_CATALOG;
  var PROGRESS_PATH = "data/progress.json";
  var CFG_KEY = "dsa_gh_cfg";
  var LOCAL_KEY = "dsa_progress_local";
  var THEME_KEY = "dsa_theme";

  var STATUSES = ["todo", "solved", "review"];
  var STATUS_LABEL = { todo: "To do", solved: "Solved", review: "Needs review" };

  // ---- state ----
  var cfg = loadCfg();
  var progress = { updatedAt: null, days: {}, problems: {} };
  var progressSha = null;        // sha of data/progress.json for the next commit
  var dirtyProblems = {};        // slug -> true (fields we changed locally)
  var dirtyDays = {};            // day  -> true
  var saveTimer = null;
  var saving = false;
  var saveQueued = false;

  // ---- boot ----
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    applyTheme(loadTheme());
    wireChrome();
    renderSkeleton();
    loadProgress().then(function () {
      renderAll();
      updateStats();
      setSyncState(cfg.token ? "synced" : "local");
    });
  }

  // ================= config =================
  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
      return { owner: c.owner || "", repo: c.repo || "", branch: c.branch || "main", token: c.token || "" };
    } catch (e) { return { owner: "", repo: "", branch: "main", token: "" }; }
  }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function ghReady() { return !!(cfg.owner && cfg.repo && cfg.token); }

  // ================= GitHub Contents API =================
  function ghHeaders() {
    return {
      "Authorization": "Bearer " + cfg.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  function ghUrl(path) {
    return "https://api.github.com/repos/" + encodeURIComponent(cfg.owner) + "/" +
      encodeURIComponent(cfg.repo) + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  }
  // returns { json?, text?, sha } or null on 404
  function ghGet(path) {
    return fetch(ghUrl(path) + "?ref=" + encodeURIComponent(cfg.branch) + "&t=" + Date.now(),
      { headers: ghHeaders(), cache: "no-store" }
    ).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("GitHub GET " + path + " -> " + r.status);
      return r.json();
    }).then(function (data) {
      if (!data) return null;
      return { sha: data.sha, content: data.content ? b64ToUtf8(data.content) : "" };
    });
  }
  function ghPut(path, base64Content, sha, message) {
    var body = { message: message || ("update " + path), content: base64Content, branch: cfg.branch };
    if (sha) body.sha = sha;
    return fetch(ghUrl(path), { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) })
      .then(function (r) {
        if (r.status === 409) { var e = new Error("conflict"); e.conflict = true; throw e; }
        if (!r.ok) return r.text().then(function (t) { throw new Error("GitHub PUT " + path + " -> " + r.status + " " + t); });
        return r.json();
      });
  }

  // ================= progress load / save =================
  function emptyProgress() { return { updatedAt: null, days: {}, problems: {} }; }

  function loadProgress() {
    if (ghReady()) {
      return ghGet(PROGRESS_PATH).then(function (res) {
        if (res && res.content) {
          try { progress = normalize(JSON.parse(res.content)); } catch (e) { progress = emptyProgress(); }
          progressSha = res.sha;
        } else {
          progress = emptyProgress(); progressSha = null;
        }
      }).catch(function (err) {
        console.warn("GitHub load failed, falling back to local:", err);
        setSyncState("error", "Couldn't reach GitHub — using local copy");
        loadLocal();
      });
    }
    loadLocal();
    return Promise.resolve();
  }
  function loadLocal() {
    try { progress = normalize(JSON.parse(localStorage.getItem(LOCAL_KEY) || "null") || emptyProgress()); }
    catch (e) { progress = emptyProgress(); }
  }
  function normalize(p) {
    p = p || {}; p.days = p.days || {}; p.problems = p.problems || {};
    return p;
  }

  function markDirtyProblem(slug) { dirtyProblems[slug] = true; scheduleSave(); }
  function markDirtyDay(d) { dirtyDays[d] = true; scheduleSave(); }

  function scheduleSave() {
    setSyncState("dirty");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1200);
  }

  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (saving) { saveQueued = true; return; }
    progress.updatedAt = new Date().toISOString();

    if (!ghReady()) {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(progress)); setSyncState("local"); }
      catch (e) { setSyncState("error", "Local save failed"); }
      dirtyProblems = {}; dirtyDays = {};
      return;
    }

    saving = true; setSyncState("saving");
    // Read-modify-write: fetch the latest truth, overlay only the keys we changed,
    // then commit. This preserves edits made from other devices.
    ghGet(PROGRESS_PATH).then(function (res) {
      var base = emptyProgress();
      if (res && res.content) { try { base = normalize(JSON.parse(res.content)); } catch (e) {} }
      var sha = res ? res.sha : null;

      Object.keys(dirtyProblems).forEach(function (slug) {
        if (progress.problems[slug]) base.problems[slug] = progress.problems[slug];
        else delete base.problems[slug];
      });
      Object.keys(dirtyDays).forEach(function (d) {
        if (progress.days[d]) base.days[d] = progress.days[d];
        else delete base.days[d];
      });
      base.updatedAt = new Date().toISOString();

      var body = utf8ToB64(JSON.stringify(base, null, 2));
      return ghPut(PROGRESS_PATH, body, sha, "Update progress").then(function (r) {
        progress = base;
        progressSha = r && r.content ? r.content.sha : null;
        dirtyProblems = {}; dirtyDays = {};
        // keep a local mirror as backup
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify(progress)); } catch (e) {}
        setSyncState("synced");
      });
    }).catch(function (err) {
      console.error(err);
      setSyncState("error", err.conflict ? "Sync conflict — retrying…" : "Save failed — kept locally");
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(progress)); } catch (e) {}
    }).then(function () {
      saving = false;
      if (saveQueued) { saveQueued = false; scheduleSave(); }
    });
  }

  // ================= per-problem accessors =================
  function prob(slug) {
    if (!progress.problems[slug]) progress.problems[slug] = { status: "todo", notes: "", links: [], images: [], revisedAt: null };
    var p = progress.problems[slug];
    if (!p.links) p.links = [];
    if (!p.images) p.images = [];
    return p;
  }
  function setStatus(slug, status) {
    var p = prob(slug); p.status = status;
    if (status === "solved" || status === "review") p.revisedAt = new Date().toISOString();
    markDirtyProblem(slug);
  }
  function setNotes(slug, text) { prob(slug).notes = text; markDirtyProblem(slug); }
  function addLink(slug, url) { prob(slug).links.push(url); markDirtyProblem(slug); }
  function removeLink(slug, i) { prob(slug).links.splice(i, 1); markDirtyProblem(slug); }
  function addImage(slug, path) { prob(slug).images.push(path); markDirtyProblem(slug); }
  function removeImageRef(slug, i) { prob(slug).images.splice(i, 1); markDirtyProblem(slug); }

  // ================= image upload =================
  function uploadImage(slug, file) {
    return fileToBase64(file).then(function (b64) {
      var ext = (file.type && file.type.indexOf("/") > -1) ? file.type.split("/")[1].replace("jpeg", "jpg") : "png";
      var name = "notes-images/" + slug + "-" + Date.now() + "." + ext;
      if (ghReady()) {
        return ghPut(name, b64, null, "Add note image for " + slug).then(function () { return name; });
      } else {
        // local mode: keep a data URL so the image is at least visible in this browser
        return "data:" + (file.type || "image/png") + ";base64," + b64;
      }
    });
  }
  function imageSrc(path) {
    if (/^data:/.test(path)) return path;
    if (ghReady() || (cfg.owner && cfg.repo)) {
      return "https://raw.githubusercontent.com/" + cfg.owner + "/" + cfg.repo + "/" + cfg.branch + "/" + path;
    }
    return path;
  }

  // ================= rendering =================
  var els = {};
  function renderSkeleton() {
    els.plan = document.getElementById("plan");
    els.stats = document.getElementById("stats");
    els.sync = document.getElementById("syncState");
    els.search = document.getElementById("search");
    els.filters = document.getElementById("filters");
  }

  var activeFilter = "all"; // all | todo | solved | review | withnotes
  var searchTerm = "";

  function renderAll() {
    els.plan.innerHTML = "";
    var lastPhase = null, phaseWrap = null, daysWrap = null;

    CAT.days.forEach(function (day) {
      if (day.phase !== lastPhase) {
        lastPhase = day.phase;
        phaseWrap = document.createElement("section"); phaseWrap.className = "phase";
        var head = document.createElement("div"); head.className = "phase-head";
        head.innerHTML = '<span class="phase-idx">PHASE ' + day.phaseIdx + '</span>' +
          '<h2 class="phase-name">' + esc(day.phase) + '</h2>';
        phaseWrap.appendChild(head);
        daysWrap = document.createElement("div"); daysWrap.className = "days";
        phaseWrap.appendChild(daysWrap);
        els.plan.appendChild(phaseWrap);
      }
      var card = renderDay(day);
      if (card) daysWrap.appendChild(card);
    });
    // hide empty phases after filtering
    Array.prototype.forEach.call(els.plan.querySelectorAll(".phase"), function (ph) {
      if (!ph.querySelector(".day")) ph.style.display = "none";
    });
  }

  function dayMatches(day) {
    if (!searchTerm && activeFilter === "all") return true;
    // day-level match if any problem matches OR (no problems and search empty)
    if (!day.problems || !day.problems.length) {
      return activeFilter === "all" && !searchTerm;
    }
    return day.problems.some(problemMatches);
  }
  function problemMatches(pr) {
    var p = progress.problems[pr.slug] || {};
    if (searchTerm) {
      var hay = (pr.title + " " + (p.notes || "")).toLowerCase();
      if (hay.indexOf(searchTerm) === -1) return false;
    }
    if (activeFilter === "all") return true;
    if (activeFilter === "withnotes") return !!(p.notes && p.notes.trim());
    var st = p.status || "todo";
    return st === activeFilter;
  }

  function renderDay(day) {
    var visibleProblems = (day.problems || []).filter(problemMatches);
    if (searchTerm || activeFilter !== "all") {
      if (!visibleProblems.length) return null;
    }
    var card = document.createElement("div"); card.className = "day";
    var dayDone = !!(progress.days[day.d] && progress.days[day.d].done);
    if (dayDone) card.classList.add("day-done");

    var chip = tagChip(day.tag);
    var head = document.createElement("div"); head.className = "day-head";
    head.innerHTML =
      '<button class="daycheck' + (dayDone ? " on" : "") + '" title="Mark day complete" aria-label="Mark day ' + day.d + ' complete">' +
        '<svg viewBox="0 0 24 24"><path d="M4 12l6 6L20 5"/></svg></button>' +
      '<span class="daynum">DAY ' + day.d + '</span>' +
      chip +
      '<span class="pattern">' + esc(day.pattern) + '</span>';
    head.querySelector(".daycheck").addEventListener("click", function () {
      var cur = !!(progress.days[day.d] && progress.days[day.d].done);
      progress.days[day.d] = { done: !cur };
      markDirtyDay(day.d);
      card.classList.toggle("day-done", !cur);
      this.classList.toggle("on", !cur);
      updateStats();
    });
    card.appendChild(head);

    if (day.focus) {
      var f = document.createElement("p"); f.className = "focus"; f.textContent = day.focus; card.appendChild(f);
    }
    if (day.note) {
      var n = document.createElement("p"); n.className = "daynote"; n.textContent = day.note; card.appendChild(n);
    }

    var list = day.problems && day.problems.length ? day.problems : [];
    var shown = (searchTerm || activeFilter !== "all") ? visibleProblems : list;
    if (shown.length) {
      var wrap = document.createElement("div"); wrap.className = "problems";
      shown.forEach(function (pr) { wrap.appendChild(renderProblem(pr)); });
      card.appendChild(wrap);
    }
    return card;
  }

  function renderProblem(pr) {
    var p = prob(pr.slug);
    var row = document.createElement("div"); row.className = "prob status-" + (p.status || "todo");

    var lc = "https://leetcode.com/problems/" + pr.slug + "/";
    var lcSol = lc + "solutions/";

    var header = document.createElement("div"); header.className = "prob-head";
    header.innerHTML =
      '<div class="prob-title">' +
        '<a href="' + lc + '" target="_blank" rel="noopener">' + esc(pr.title) + '</a>' +
        '<span class="diff diff-' + pr.diff + '">' + pr.diff + '</span>' +
      '</div>';

    var statusSel = document.createElement("div"); statusSel.className = "statusseg";
    STATUSES.forEach(function (s) {
      var b = document.createElement("button");
      b.className = "seg " + s + (p.status === s ? " on" : "");
      b.textContent = STATUS_LABEL[s];
      b.addEventListener("click", function () {
        setStatus(pr.slug, s);
        Array.prototype.forEach.call(statusSel.children, function (c) { c.classList.remove("on"); });
        b.classList.add("on");
        row.className = "prob status-" + s;
        updateStats();
      });
      statusSel.appendChild(b);
    });
    header.appendChild(statusSel);
    row.appendChild(header);

    // expandable body
    var body = document.createElement("div"); body.className = "prob-body";

    // links
    var linksBox = document.createElement("div"); linksBox.className = "links";
    var defaults = document.createElement("div"); defaults.className = "linkrow";
    defaults.innerHTML =
      '<a class="lnk" href="' + lc + '" target="_blank" rel="noopener">LeetCode</a>' +
      '<a class="lnk" href="' + lcSol + '" target="_blank" rel="noopener">Worked solutions</a>';
    linksBox.appendChild(defaults);
    var custom = document.createElement("div"); custom.className = "linkrow custom";
    renderCustomLinks();
    function renderCustomLinks() {
      custom.innerHTML = "";
      p.links.forEach(function (u, i) {
        var a = document.createElement("a"); a.className = "lnk user"; a.href = u; a.target = "_blank"; a.rel = "noopener";
        a.textContent = shortUrl(u);
        var x = document.createElement("button"); x.className = "lnkx"; x.textContent = "×"; x.title = "Remove link";
        x.addEventListener("click", function (e) { e.preventDefault(); removeLink(pr.slug, i); renderCustomLinks(); });
        var span = document.createElement("span"); span.className = "lnkwrap"; span.appendChild(a); span.appendChild(x);
        custom.appendChild(span);
      });
      var add = document.createElement("button"); add.className = "lnkadd"; add.textContent = "+ link";
      add.addEventListener("click", function () {
        var u = window.prompt("Paste a worked-example / reference URL (NeetCode, editorial, blog, video):");
        if (u && /^https?:\/\//i.test(u)) { addLink(pr.slug, u.trim()); renderCustomLinks(); }
        else if (u) { alert("Please enter a full URL starting with http(s)://"); }
      });
      custom.appendChild(add);
    }
    linksBox.appendChild(custom);
    body.appendChild(linksBox);

    // notes
    var noteWrap = document.createElement("div"); noteWrap.className = "notewrap";
    var label = document.createElement("div"); label.className = "mini-label"; label.textContent = "Notes";
    var ta = document.createElement("textarea"); ta.className = "notes"; ta.placeholder = "Key idea, pitfalls, complexity, why it works…";
    ta.value = p.notes || "";
    autoGrow(ta);
    ta.addEventListener("input", function () { autoGrow(ta); setNotes(pr.slug, ta.value); });
    noteWrap.appendChild(label); noteWrap.appendChild(ta);
    body.appendChild(noteWrap);

    // images (paste / upload)
    var imgWrap = document.createElement("div"); imgWrap.className = "imgwrap";
    var ilabel = document.createElement("div"); ilabel.className = "mini-label"; ilabel.textContent = "Handwritten notes (paste or upload images)";
    var drop = document.createElement("div"); drop.className = "dropzone"; drop.tabIndex = 0;
    drop.innerHTML = '<span>Paste a screenshot here (Ctrl/⌘+V), or </span>';
    var fileBtn = document.createElement("label"); fileBtn.className = "filebtn"; fileBtn.textContent = "choose image";
    var fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
    fileBtn.appendChild(fileInput);
    drop.appendChild(fileBtn);

    var thumbs = document.createElement("div"); thumbs.className = "thumbs";
    renderThumbs();
    function renderThumbs() {
      thumbs.innerHTML = "";
      p.images.forEach(function (path, i) {
        var t = document.createElement("div"); t.className = "thumb";
        var im = document.createElement("img"); im.src = imageSrc(path); im.loading = "lazy"; im.alt = "note";
        im.addEventListener("click", function () { window.open(im.src, "_blank"); });
        var x = document.createElement("button"); x.className = "thumbx"; x.textContent = "×"; x.title = "Remove (image file stays in repo)";
        x.addEventListener("click", function () { removeImageRef(pr.slug, i); renderThumbs(); });
        t.appendChild(im); t.appendChild(x); thumbs.appendChild(t);
      });
    }

    function handleFile(file) {
      if (!file || file.type.indexOf("image/") !== 0) return;
      drop.classList.add("busy"); drop.setAttribute("data-msg", "Uploading…");
      uploadImage(pr.slug, file).then(function (path) {
        addImage(pr.slug, path); renderThumbs();
        drop.classList.remove("busy"); drop.removeAttribute("data-msg");
      }).catch(function (err) {
        console.error(err); drop.classList.remove("busy");
        alert("Image upload failed: " + err.message + (ghReady() ? "" : "\n(Connect GitHub in Settings to store images in the repo.)"));
      });
    }
    fileInput.addEventListener("change", function () { if (fileInput.files[0]) handleFile(fileInput.files[0]); fileInput.value = ""; });
    drop.addEventListener("paste", function (e) {
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") === 0) { handleFile(items[i].getAsFile()); e.preventDefault(); return; }
      }
    });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("hover"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("hover"); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault(); drop.classList.remove("hover");
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    imgWrap.appendChild(ilabel); imgWrap.appendChild(drop); imgWrap.appendChild(thumbs);
    body.appendChild(imgWrap);

    // collapse/expand
    var toggle = document.createElement("button"); toggle.className = "prob-toggle";
    toggle.textContent = bodyLabel(p);
    body.hidden = true;
    toggle.addEventListener("click", function () {
      body.hidden = !body.hidden;
      toggle.textContent = body.hidden ? bodyLabel(prob(pr.slug)) : "Hide notes";
    });
    header.appendChild(toggle);
    row.appendChild(body);
    return row;
  }
  function bodyLabel(p) {
    var bits = [];
    if (p.notes && p.notes.trim()) bits.push("notes");
    if (p.images && p.images.length) bits.push(p.images.length + " img");
    if (p.links && p.links.length) bits.push(p.links.length + " link");
    return bits.length ? "Notes (" + bits.join(", ") + ")" : "Add notes";
  }

  function tagChip(tag) {
    var m = { new: ["new", "New"], rev: ["rev", "Revision"], mock: ["mock", "Mock"], cap: ["cap", "Capstone"], buf: ["buf", "Buffer"] };
    var c = m[tag] || ["new", tag];
    return '<span class="chip ' + c[0] + '">' + c[1] + '</span>';
  }

  // ================= stats =================
  function updateStats() {
    var days = 0, patterns = 0, solved = 0, review = 0, total = 0;
    CAT.days.forEach(function (d) {
      if (progress.days[d.d] && progress.days[d.d].done) { days++; patterns += patternsOnDay(d); }
      (d.problems || []).forEach(function (pr) {
        total++;
        var st = (progress.problems[pr.slug] || {}).status;
        if (st === "solved") solved++; else if (st === "review") review++;
      });
    });
    els.stats.innerHTML =
      statTile(days, 60, "days") +
      statTile(patterns, 41, "patterns") +
      statTile(solved, total, "solved") +
      statTile(review, total, "to review", "warn");
  }
  function patternsOnDay(d) {
    // count of distinct patterns introduced; new-pattern days = 1, Day 34 pairs two
    if (d.tag !== "new") return 0;
    return d.d === 34 ? 2 : 1;
  }
  function statTile(v, t, label, mod) {
    return '<div class="stat ' + (mod || "") + '"><span class="num">' + v + '</span>' +
      '<span class="den">/' + t + '</span><span class="lbl">' + label + '</span></div>';
  }

  // ================= chrome / settings / theme =================
  function wireChrome() {
    // search
    var s = document.getElementById("search");
    s.addEventListener("input", function () { searchTerm = s.value.trim().toLowerCase(); renderAll(); });

    // filters
    Array.prototype.forEach.call(document.querySelectorAll("#filters .fbtn"), function (b) {
      b.addEventListener("click", function () {
        activeFilter = b.getAttribute("data-f");
        Array.prototype.forEach.call(document.querySelectorAll("#filters .fbtn"), function (x) { x.setAttribute("aria-pressed", x === b); });
        renderAll();
      });
    });

    // theme
    document.getElementById("themeBtn").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") || (sysDark() ? "dark" : "light");
      applyTheme(cur === "dark" ? "light" : "dark", true);
    });

    // settings
    var dlg = document.getElementById("settings");
    document.getElementById("settingsBtn").addEventListener("click", function () { openSettings(dlg); });
    document.getElementById("closeSettings").addEventListener("click", function () { dlg.close(); });
    document.getElementById("saveSettings").addEventListener("click", function () {
      cfg.owner = val("cfgOwner").trim();
      cfg.repo = val("cfgRepo").trim();
      cfg.branch = val("cfgBranch").trim() || "main";
      cfg.token = val("cfgToken").trim();
      saveCfg(); dlg.close();
      setSyncState(cfg.token ? "synced" : "local");
      loadProgress().then(function () { renderAll(); updateStats(); });
    });
    document.getElementById("clearToken").addEventListener("click", function () {
      cfg.token = ""; saveCfg(); document.getElementById("cfgToken").value = "";
      setSyncState("local"); updateBanner();
    });

    // export / import
    document.getElementById("exportBtn").addEventListener("click", exportJson);
    document.getElementById("importInput").addEventListener("change", importJson);

    // banner connect
    var bc = document.getElementById("bannerConnect");
    if (bc) bc.addEventListener("click", function () { openSettings(document.getElementById("settings")); });

    updateBanner();
  }

  function openSettings(dlg) {
    document.getElementById("cfgOwner").value = cfg.owner;
    document.getElementById("cfgRepo").value = cfg.repo;
    document.getElementById("cfgBranch").value = cfg.branch;
    document.getElementById("cfgToken").value = cfg.token;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function val(id) { return document.getElementById(id).value; }

  function updateBanner() {
    var b = document.getElementById("banner");
    if (!b) return;
    if (ghReady()) { b.hidden = true; }
    else { b.hidden = false; }
  }

  function setSyncState(state, msg) {
    var el = els.sync; if (!el) return;
    var map = {
      synced: ["Synced to GitHub", "ok"],
      saving: ["Saving…", "busy"],
      dirty: ["Unsaved changes", "busy"],
      local: ["Local only (not synced)", "warn"],
      error: [msg || "Error", "err"]
    };
    var m = map[state] || [state, ""];
    el.textContent = m[0];
    el.className = "sync " + m[1];
    updateBanner();
  }

  // ================= export / import =================
  function exportJson() {
    var blob = new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = "progress.json"; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importJson(e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = normalize(JSON.parse(r.result));
        progress = data;
        Object.keys(progress.problems).forEach(function (k) { dirtyProblems[k] = true; });
        Object.keys(progress.days).forEach(function (k) { dirtyDays[k] = true; });
        renderAll(); updateStats(); scheduleSave();
        alert("Imported. " + (ghReady() ? "Syncing to GitHub…" : "Saved locally."));
      } catch (err) { alert("Import failed: " + err.message); }
    };
    r.readAsText(f); e.target.value = "";
  }

  // ================= theme =================
  function loadTheme() { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } }
  function applyTheme(t, persist) {
    if (t) document.documentElement.setAttribute("data-theme", t);
    if (persist) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
  }
  function sysDark() { return window.matchMedia && matchMedia("(prefers-color-scheme:dark)").matches; }

  // ================= helpers =================
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function shortUrl(u) { try { var h = new URL(u).hostname.replace(/^www\./, ""); return h.length > 22 ? h.slice(0, 22) + "…" : h; } catch (e) { return u.slice(0, 22); } }
  function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 400) + "px"; }

  function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64ToUtf8(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, "")))); }
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = r.result; var comma = s.indexOf(","); resolve(comma > -1 ? s.slice(comma + 1) : s);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
})();
