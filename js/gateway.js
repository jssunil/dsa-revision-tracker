// Client for the local companion server's LLM gateway (server/serve.py): /api/health, /api/verify.
import { gatewayCfg } from "./store.js";

export function base() {
  const u = (gatewayCfg().url || "").trim();
  if (u) return u.replace(/\/+$/, "");
  return /^https?:/.test(location.protocol) ? location.origin : "http://localhost:8765";
}
function fetchT(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, Object.assign({ signal: ctl.signal }, opts)).finally(() => clearTimeout(t));
}

let cache = null, cachedAt = 0;
// -> { ok, providers:[{name, model, keyPresent}], ledger } | { ok:false, error }
export async function health(force) {
  if (!force && cache && Date.now() - cachedAt < 60000) return cache;
  try {
    const r = await fetchT(base() + "/api/health", {}, 3000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    cache = Object.assign({ ok: true }, await r.json());
  } catch (e) {
    cache = { ok: false, error: e.name === "AbortError" ? "timed out" : e.message };
  }
  cachedAt = Date.now();
  return cache;
}

export function payload(plan, problem, conceptId) {
  const c = plan.concepts[conceptId] || null;
  return {
    problem: problem.kind === "leetcode"
      ? { kind: "leetcode", slug: problem.slug, title: problem.title }
      : { kind: "custom", title: problem.title, statement: problem.statement || "", url: problem.url || null },
    concept: c ? { id: c.id, name: c.name, summary: c.summary, triggers: c.triggers || [], leetcodeTags: c.leetcodeTags || [] } : null,
    concepts: Object.keys(plan.concepts).map((id) => ({ id, name: plan.concepts[id].name, summary: plan.concepts[id].summary || "" })),
    tier: gatewayCfg().tier || "verify"
  };
}

export async function verify(body) {
  const r = await fetchT(base() + "/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 120000);
  let j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((j && j.error) || "HTTP " + r.status);
  return j;
}

// server result -> problem.verification (docs/DESIGN.md §3.4)
export function toVerification(res, conceptId) {
  const best = (res.bestConceptIds || []).filter(Boolean);
  let status;
  if (!res.known) status = "unverified";
  else if (res.fits && res.confidence >= 0.6) status = "verified";
  else if (!res.fits || best.length && best.indexOf(conceptId) < 0) status = "mismatch";
  else status = "unverified";
  return {
    status, fits: !!res.fits, confidence: typeof res.confidence === "number" ? res.confidence : null,
    suggestedConceptIds: best, reason: res.reason || "", leetcodeTags: res.leetcodeTags || [],
    provider: res.provider || null, model: res.model || null, at: new Date().toISOString(), known: !!res.known
  };
}
