// DOM helpers: element builder, progress bars, dialogs, toasts.
import { esc } from "./util.js";

// h("div", { class:"x", text:"hi", on:{ click: fn }, title:"…" }, child, "text", [children])
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "on") Object.entries(v).forEach(([e, fn]) => el.addEventListener(e, fn));
    else if (k === "style") el.style.cssText = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  });
  add(el, children);
  return el;
}
function add(el, children) {
  children.forEach((c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) add(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
}
export const btn = (text, onClick, cls, attrs) => h("button", Object.assign({ type: "button", class: cls || "tbtn", on: { click: onClick } }, attrs || {}), text);

// progress bar: done/total with label
export function pbar(done, total, label, cls) {
  const pct = total ? Math.round(100 * done / total) : 0;
  return h("div", { class: "pbar " + (cls || ""), title: done + " / " + total },
    h("div", { class: "pbar-track" }, h("div", { class: "pbar-fill", style: "width:" + pct + "%" })),
    h("span", { class: "pbar-label" }, (label ? label + " " : "") + done + "/" + total + " · " + pct + "%"));
}

export function chip(text, cls, attrs) { return h("span", Object.assign({ class: "chip " + (cls || "") }, attrs || {}), text); }

// ---- dialogs (native <dialog>, no browser alert/confirm) ----
export function modal(title, body, actions, opts) {
  opts = opts || {};
  const dlg = h("dialog", { class: "settings modal " + (opts.wide ? "wide" : "") });
  const close = () => { dlg.close(); dlg.remove(); if (opts.onClose) opts.onClose(); };
  const form = h("div", { class: "modal-inner" },
    h("div", { class: "dlg-head" }, h("h2", { text: title }), h("button", { type: "button", class: "x", "aria-label": "Close", on: { click: close } }, "×")),
    body,
    actions && actions.length ? h("div", { class: "dlg-actions" }, actions) : null);
  dlg.appendChild(form);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  return { el: dlg, close };
}
export function confirmBox(message, okText, danger) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal("Please confirm", h("p", { class: "dlg-lead", text: message }), [
      btn("Cancel", () => { done = true; m.close(); resolve(false); }),
      btn(okText || "OK", () => { done = true; m.close(); resolve(true); }, "tbtn " + (danger ? "danger" : "primary"))
    ], { onClose: () => { if (!done) resolve(false); } });
  });
}
export function promptBox(title, label, value, okText) {
  return new Promise((resolve) => {
    let done = false;
    const input = h("input", { type: "text", value: value || "" });
    const m = modal(title, h("label", { class: "field" }, h("span", { text: label }), input), [
      btn("Cancel", () => { done = true; m.close(); resolve(null); }),
      btn(okText || "OK", () => { done = true; m.close(); resolve(input.value); }, "tbtn primary")
    ], { onClose: () => { if (!done) resolve(null); } });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { done = true; m.close(); resolve(input.value); } });
    setTimeout(() => input.focus(), 30);
  });
}

// ---- toasts ----
export function toast(message, kind, ms) {
  let host = document.getElementById("toasts");
  if (!host) { host = h("div", { id: "toasts", class: "toasts", role: "status", "aria-live": "polite" }); document.body.appendChild(host); }
  const t = h("div", { class: "toast " + (kind || "") }, h("span", { text: message }),
    h("button", { type: "button", class: "x", "aria-label": "Dismiss", on: { click: () => t.remove() } }, "×"));
  host.appendChild(t);
  setTimeout(() => t.remove(), ms || (kind === "warn" || kind === "err" ? 9000 : 3500));
}

export function kindChip(kind) {
  const m = { new: ["new", "New"], rev: ["rev", "Revision"], mock: ["mock", "Mock"], cap: ["cap", "Capstone"], buf: ["buf", "Buffer"], custom: ["custom", "Custom"] };
  const c = m[kind] || ["custom", kind];
  return chip(c[1], c[0]);
}
export function verifyBadge(p) {
  const v = (p && p.verification) || {};
  const map = {
    verified: ["ok", "✓ verified"], builtin: ["muted", "curated"], overridden: ["muted", "☑ kept"],
    mismatch: ["warn", "⚠ better fit"], unverified: ["muted", "? unverified"]
  };
  const m = map[v.status] || map.unverified;
  let text = m[1];
  if (v.confidence != null && v.status === "verified") text += " " + Math.round(v.confidence * 100) + "%";
  return h("span", { class: "vbadge " + m[0], title: v.reason ? v.reason + (v.provider ? "\n— " + v.provider + " / " + v.model : "") : "Pattern check: " + (v.status || "unverified") }, text);
}
export const diffBadge = (d) => h("span", { class: "diff diff-" + d, text: d });
export { esc };
