// Per-problem fields: solution code, image strip, repo links.
import { autoGrow } from "./util.js";
import { ghReady, imageSrc, repoPageUrl } from "./github.js";
import { prob, loadCode, setCode } from "./store.js";
import { toast } from "./ui.js";
const MD = window.DSA_MD;

export function repoLink(path, text) {
  const url = repoPageUrl(path);
  if (!url) return null;
  const a = document.createElement("a"); a.className = "lnk repo"; a.href = url; a.target = "_blank"; a.rel = "noopener";
  a.textContent = text;
  return a;
}

// solution editor -> problems/<id>/solution.<ext>; code loads on open()
export function solutionField(pid) {
  const wrap = document.createElement("div"); wrap.className = "solwrap";
  const head = document.createElement("div"); head.className = "solhead";
  const label = document.createElement("div"); label.className = "mini-label"; label.textContent = "Solution";
  const sel = document.createElement("select"); sel.className = "langsel"; sel.setAttribute("aria-label", "Language");
  Object.keys(MD.LANGS).forEach((k) => {
    const o = document.createElement("option"); o.value = k; o.textContent = MD.LANGS[k].label; sel.appendChild(o);
  });
  const p = prob(pid);
  sel.value = (p.solution && p.solution.lang) || "cpp";
  const fileLink = document.createElement("span"); fileLink.className = "solfile";
  head.append(label, sel, fileLink);
  const ta = document.createElement("textarea"); ta.className = "notes code"; ta.spellcheck = false;
  ta.placeholder = "Paste or type your accepted solution…";
  ta.disabled = true;
  wrap.append(head, ta);

  function showPath() {
    const path = prob(pid).solution && prob(pid).solution.path;
    fileLink.innerHTML = "";
    const a = path && repoLink(path, path.split("/").pop());
    if (a) fileLink.appendChild(a);
  }
  let loaded = false;
  function open() {
    showPath();
    if (loaded) return;
    loaded = true;
    ta.placeholder = "Loading solution…";
    loadCode(pid).then((c) => {
      ta.value = c.code; sel.value = c.lang; ta.disabled = false;
      ta.placeholder = "Paste or type your accepted solution…";
      autoGrow(ta, 600);
    }).catch((err) => {
      console.error(err); loaded = false;
      ta.placeholder = "Couldn't load the solution file — " + err.message;
    });
  }
  ta.addEventListener("input", () => { autoGrow(ta, 600); setCode(pid, ta.value, sel.value); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    }
  });
  sel.addEventListener("change", () => { if (loaded && !ta.disabled) setCode(pid, ta.value, sel.value); });
  return { el: wrap, open };
}

// getList() -> live array of image paths; upload(file) -> Promise<path>; changed() marks dirty
export function imageField(labelText, getList, upload, changed) {
  const imgWrap = document.createElement("div"); imgWrap.className = "imgwrap";
  const ilabel = document.createElement("div"); ilabel.className = "mini-label"; ilabel.textContent = labelText;
  const drop = document.createElement("div"); drop.className = "dropzone"; drop.tabIndex = 0;
  drop.innerHTML = "<span>Paste a screenshot here (Ctrl/⌘+V), or </span>";
  const fileBtn = document.createElement("label"); fileBtn.className = "filebtn"; fileBtn.textContent = "choose image";
  const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
  fileBtn.appendChild(fileInput);
  drop.appendChild(fileBtn);

  const thumbs = document.createElement("div"); thumbs.className = "thumbs";
  function renderThumbs() {
    thumbs.innerHTML = "";
    getList().forEach((path, i) => {
      const t = document.createElement("div"); t.className = "thumb";
      const im = document.createElement("img"); im.src = imageSrc(path); im.loading = "lazy"; im.alt = "note";
      im.addEventListener("click", () => window.open(im.src, "_blank"));
      const x = document.createElement("button"); x.className = "thumbx"; x.textContent = "×"; x.title = "Remove (image file stays in repo)";
      x.addEventListener("click", () => { getList().splice(i, 1); changed(); renderThumbs(); });
      t.append(im, x); thumbs.appendChild(t);
    });
  }
  renderThumbs();
  function handleFile(file) {
    if (!file || file.type.indexOf("image/") !== 0) return;
    drop.classList.add("busy"); drop.setAttribute("data-msg", "Uploading…");
    upload(file).then((path) => {
      getList().push(path); changed(); renderThumbs();
      drop.classList.remove("busy"); drop.removeAttribute("data-msg");
    }).catch((err) => {
      console.error(err); drop.classList.remove("busy");
      toast("Image upload failed: " + err.message + (ghReady() ? "" : " (connect GitHub in Settings to store images in the repo)"), "err");
    });
  }
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); fileInput.value = ""; });
  drop.addEventListener("paste", (e) => {
    const items = (e.clipboardData || {}).items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") === 0) { handleFile(items[i].getAsFile()); e.preventDefault(); return; }
    }
  });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("hover"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("hover"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("hover"); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  imgWrap.append(ilabel, drop, thumbs);
  return imgWrap;
}
