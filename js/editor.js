// Markdown editor with live preview (Write / Split / Preview), inline image paste, clickable task lists.
import { autoGrow } from "./util.js";
import { imageSrc, repoPageUrl } from "./github.js";
import { toast } from "./ui.js";
const MD = window.DSA_MD;

/* Markdown editor with live preview.
 * o = { label, placeholder, baseFile, upload(file) -> Promise<repoPath | dataURL>, onChange(text) }
 * Modes: write | split | preview. Pasting / dropping an image uploads it and inserts ![](relative/path).
 * In the preview, task-list checkboxes toggle the source; double-click switches to editing. */
var MD_MODE_KEY = "dsa_md_mode";
export function mdEditor(o) {
  var wrap = document.createElement("div"); wrap.className = "mdwrap";
  var head = document.createElement("div"); head.className = "mdhead";
  var label = document.createElement("div"); label.className = "mini-label"; label.textContent = o.label;
  var seg = document.createElement("div"); seg.className = "mdseg"; seg.setAttribute("role", "group");
  var modes = { write: "Write", split: "Split", preview: "Preview" };
  Object.keys(modes).forEach(function (m) {
    var b = document.createElement("button"); b.type = "button"; b.textContent = modes[m]; b.setAttribute("data-m", m);
    b.addEventListener("click", function () {
      setMode(m);
      if (m !== "preview") { try { localStorage.setItem(MD_MODE_KEY, m); } catch (e) {} }
      if (m !== "preview") ta.focus();
    });
    seg.appendChild(b);
  });
  var imgBtn = document.createElement("label"); imgBtn.className = "mdimg"; imgBtn.textContent = "+ image"; imgBtn.title = "Insert an image at the cursor";
  var imgInput = document.createElement("input"); imgInput.type = "file"; imgInput.accept = "image/*"; imgInput.hidden = true;
  imgBtn.appendChild(imgInput);
  head.appendChild(label); head.appendChild(seg); head.appendChild(imgBtn);

  var panes = document.createElement("div"); panes.className = "mdpanes";
  var ta = document.createElement("textarea"); ta.className = "notes mdsrc"; ta.placeholder = o.placeholder || "";
  var pv = document.createElement("div"); pv.className = "mdpreview";
  panes.appendChild(ta); panes.appendChild(pv);
  var status = document.createElement("div"); status.className = "mdstatus"; status.hidden = true;
  wrap.appendChild(head); wrap.appendChild(panes); wrap.appendChild(status);

  var mode = "write", timer = null;
  function setMode(m) {
    mode = m;
    panes.className = "mdpanes mode-" + m;
    Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === m); });
    if (m !== "write") render();
    if (m !== "preview") autoGrow(ta, 700);
  }
  function render() { renderMarkdown(pv, ta.value, o.baseFile, toggleTask); }
  function changed() {
    autoGrow(ta, 700);
    o.onChange(ta.value);
    if (mode !== "write") { clearTimeout(timer); timer = setTimeout(render, 120); }
  }
  ta.addEventListener("input", changed);
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); changed(); }
  });
  pv.addEventListener("dblclick", function (e) {
    if (ta.disabled || e.target.closest("a,input")) return;
    setMode(preferredEditMode());
    ta.focus();
  });

  // nth task-list item in the source <-> nth checkbox in the preview
  function toggleTask(i, checked) {
    var n = -1;
    ta.value = ta.value.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\])/gm, function (m, a, b, c) {
      n++;
      return n === i ? a + (checked ? "x" : " ") + c : m;
    });
    changed();
  }

  function insertImage(file) {
    if (!file || file.type.indexOf("image/") !== 0) return;
    var token = "![uploading " + Date.now() + "…]()";
    var at = ta.selectionStart, before = ta.value.slice(0, at);
    var pre = before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? "\n" : "\n\n") : "";
    ta.setRangeText(pre + token + "\n\n", at, ta.selectionEnd, "end");
    changed();
    o.upload(file).then(function (path) {
      var ref = /^data:/.test(path) ? path : MD.rel(o.baseFile, path);
      ta.value = ta.value.replace(token, "![note](" + ref + ")");
      changed();
    }).catch(function (err) {
      console.error(err);
      ta.value = ta.value.replace(token + "\n\n", "").replace(token, "");
      changed();
      toast("Image upload failed: " + err.message, "err");
    });
  }
  ta.addEventListener("paste", function (e) {
    var items = (e.clipboardData || {}).items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") === 0) { e.preventDefault(); insertImage(items[i].getAsFile()); return; }
    }
  });
  ta.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") > -1) { e.preventDefault(); ta.classList.add("hover"); } });
  ta.addEventListener("dragleave", function () { ta.classList.remove("hover"); });
  ta.addEventListener("drop", function (e) {
    ta.classList.remove("hover");
    var f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && f.type.indexOf("image/") === 0) { e.preventDefault(); insertImage(f); }
  });
  imgInput.addEventListener("change", function () {
    if (imgInput.files[0]) { if (mode === "preview") setMode(preferredEditMode()); insertImage(imgInput.files[0]); }
    imgInput.value = "";
  });

  setMode("write");
  return {
    el: wrap,
    // m: "preview" shows rendered notes (falls back to write for empty notes), "write" uses the preferred edit mode
    setValue: function (text, m) {
      ta.value = text || "";
      setMode(m === "preview" && ta.value ? "preview" : preferredEditMode());
    },
    setDisabled: function (b, msg) {
      ta.disabled = b; imgBtn.classList.toggle("off", b); imgInput.disabled = b;
      status.hidden = !msg; status.textContent = msg || "";
    }
  };
}
function preferredEditMode() {
  var m = null;
  try { m = localStorage.getItem(MD_MODE_KEY); } catch (e) {}
  if (m !== "write" && m !== "split") m = window.matchMedia && matchMedia("(min-width: 760px)").matches ? "split" : "write";
  return m;
}

// Render markdown safely; resolve relative images/links against `baseFile` (a repo path).
export function renderMarkdown(el, text, baseFile, onTask) {
  el.classList.remove("plain");
  if (!String(text || "").trim()) {
    el.innerHTML = '<p class="mdempty">Nothing here yet. Double-click to start writing.</p>';
    return;
  }
  if (!window.marked || !window.DOMPurify) {   // CDN unreachable: show the source rather than raw HTML
    el.textContent = text; el.classList.add("plain");
    return;
  }
  el.innerHTML = DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true }));
  Array.prototype.forEach.call(el.querySelectorAll("img"), function (im) {
    var src = im.getAttribute("src");
    if (MD.isRelative(src)) im.src = imageSrc(MD.resolve(baseFile, src));
    im.loading = "lazy";
    im.addEventListener("click", function () { window.open(im.src, "_blank"); });
  });
  Array.prototype.forEach.call(el.querySelectorAll("a[href]"), function (a) {
    var href = a.getAttribute("href");
    if (MD.isRelative(href)) {
      var url = repoPageUrl(MD.resolve(baseFile, href.split("#")[0]));
      if (url) a.href = url; else a.removeAttribute("href");
    }
    a.target = "_blank"; a.rel = "noopener";
  });
  Array.prototype.forEach.call(el.querySelectorAll('input[type="checkbox"]'), function (cb, i) {
    cb.disabled = false;
    cb.addEventListener("change", function () { onTask(i, cb.checked); });
  });
  if (window.hljs) Array.prototype.forEach.call(el.querySelectorAll("pre code"), function (c) { hljs.highlightElement(c); });
}
