// GitHub connection (config in localStorage) + Contents / Git Data API.
import { b64ToUtf8, fileToBase64, lsGet, lsSet } from "./util.js";

const CFG_KEY = "dsa_gh_cfg";

export const cfg = loadCfg();
function loadCfg() {
  try {
    const c = JSON.parse(lsGet(CFG_KEY, "{}"));
    return { owner: c.owner || "", repo: c.repo || "", branch: c.branch || "main", token: c.token || "" };
  } catch (e) { return { owner: "", repo: "", branch: "main", token: "" }; }
}
export function saveCfg(next) { Object.assign(cfg, next); lsSet(CFG_KEY, JSON.stringify(cfg)); }
export const ghReady = () => !!(cfg.owner && cfg.repo && cfg.token);

function headers() {
  return { "Authorization": "Bearer " + cfg.token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}
const repoUrl = () => "https://api.github.com/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo);
const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");

export function ghApi(method, path, body) {
  const opts = { method, headers: headers(), cache: "no-store" };
  if (body) opts.body = JSON.stringify(body);
  return fetch(repoUrl() + path, opts).then((r) => {
    if (!r.ok) return r.text().then((t) => { const e = new Error("GitHub " + method + " " + path + " -> " + r.status + " " + t); e.status = r.status; throw e; });
    return r.status === 204 ? null : r.json();
  });
}
// { content, sha } or null on 404. `ref` defaults to the configured branch.
export function ghGet(path, ref) {
  return ghApi("GET", "/contents/" + encPath(path) + "?ref=" + encodeURIComponent(ref || cfg.branch) + "&t=" + Date.now())
    .then((d) => ({ sha: d.sha, content: d.content ? b64ToUtf8(d.content) : "" }))
    .catch((e) => { if (e.status === 404) return null; throw e; });
}
export function ghPut(path, b64, message) {
  return ghApi("PUT", "/contents/" + encPath(path), { message: message || "add " + path, content: b64, branch: cfg.branch });
}

/* One atomic commit of many files.
 * build(headSha) -> Promise<{ files:[{path, content}|{path, b64}|{path, remove:true}], message, result }>
 * Retries on the new head if the branch moved (another device committed meanwhile). */
export function ghCommit(build) {
  let attempt = 0;
  function run() {
    let head, plan;
    return ghApi("GET", "/git/ref/heads/" + encPath(cfg.branch)).then((ref) => {
      head = ref.object.sha;
      return ghApi("GET", "/git/commits/" + head);
    }).then((commit) => Promise.resolve(build(head)).then((p) => {
      plan = p;
      return Promise.all(plan.files.map(treeEntry));
    }).then((entries) => ghApi("POST", "/git/trees", { base_tree: commit.tree.sha, tree: entries })))
      .then((tree) => ghApi("POST", "/git/commits", { message: plan.message, tree: tree.sha, parents: [head] }))
      .then((c) => ghApi("PATCH", "/git/refs/heads/" + encPath(cfg.branch), { sha: c.sha }))
      .then(() => plan.result)
      .catch((err) => {
        if (err.status === 422 && ++attempt < 3) return run();
        throw err;
      });
  }
  return run();
}
function treeEntry(f) {
  if (f.remove) return Promise.resolve({ path: f.path, mode: "100644", type: "blob", sha: null });
  if (f.b64 != null) {
    return ghApi("POST", "/git/blobs", { content: f.b64, encoding: "base64" })
      .then((b) => ({ path: f.path, mode: "100644", type: "blob", sha: b.sha }));
  }
  return Promise.resolve({ path: f.path, mode: "100644", type: "blob", content: f.content });
}

// ---- images / links into the repo ----
export const imgCache = {};   // repo path -> data URL, so fresh uploads show before raw.githubusercontent catches up
export function imageSrc(path) {
  if (/^data:/.test(path)) return path;
  if (imgCache[path]) return imgCache[path];
  if (cfg.owner && cfg.repo) return "https://raw.githubusercontent.com/" + cfg.owner + "/" + cfg.repo + "/" + cfg.branch + "/" + path;
  return path;
}
export function repoPageUrl(path) {
  if (!(cfg.owner && cfg.repo)) return null;
  return "https://github.com/" + cfg.owner + "/" + cfg.repo + "/blob/" + cfg.branch + "/" + path;
}
// pathFor(ext) -> repo path. Resolves to the stored path, or a data URL in local mode (pushed on first sync).
export function uploadImage(file, pathFor, message) {
  return fileToBase64(file).then((b64) => {
    const ext = file.type && file.type.includes("/") ? file.type.split("/")[1].replace("jpeg", "jpg") : "png";
    const dataUrl = "data:" + (file.type || "image/png") + ";base64," + b64;
    if (!ghReady()) return dataUrl;
    const name = pathFor(ext);
    return ghPut(name, b64, message).then(() => { imgCache[name] = dataUrl; return name; });
  });
}
