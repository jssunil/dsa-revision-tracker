// Small helpers shared by every module.

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
export function shortUrl(u) {
  try { const h = new URL(u).hostname.replace(/^www\./, ""); return h.length > 22 ? h.slice(0, 22) + "…" : h; }
  catch (e) { return String(u).slice(0, 22); }
}
export function autoGrow(ta, max) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, max || 400) + "px"; }
export function b64ToUtf8(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, "")))); }
export function utf8ToB64(s) { return btoa(unescape(encodeURIComponent(s))); }
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = r.result, i = s.indexOf(","); resolve(i > -1 ? s.slice(i + 1) : s); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
export const pad = (n) => (n < 10 ? "0" : "") + n;
// ISO with the local UTC offset ("2026-09-24T22:30:05+05:30"): wall-clock and date read the same everywhere
export function isoLocal(date) {
  const off = -date.getTimezoneOffset(), a = Math.abs(off);
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" +
    pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds()) +
    (off >= 0 ? "+" : "-") + pad(Math.floor(a / 60)) + ":" + pad(a % 60);
}
export const today = () => window.DSA_PLAN.localYmd();
export function fmtDate(ymd, opts) {
  if (!ymd) return "";
  const d = new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
  const o = Object.assign({ month: "short", day: "numeric" }, opts || {});
  if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
  return d.toLocaleDateString(undefined, o);
}
export function relDay(ymd) {
  if (!ymd) return "";
  const n = window.DSA_PLAN.diffDays(today(), ymd);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? "in " + n + " days" : -n + " days ago";
}
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 3600) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
}
export const clone = (o) => JSON.parse(JSON.stringify(o));
export function debounce(fn, ms) {
  let t = null;
  return function () { const a = arguments, self = this; clearTimeout(t); t = setTimeout(() => fn.apply(self, a), ms); };
}
export function lsGet(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : v; } catch (e) { return fallback; } }
export function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
export function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
export function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
