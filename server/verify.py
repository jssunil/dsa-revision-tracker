"""Pattern check: does a problem train a given DSA concept? Prompt building + strict parsing of the LLM's JSON.

Request (from the app):
  { problem: {kind:"leetcode", slug, title} | {kind:"custom", title, statement, url},
    concept: {id, name, summary, triggers[], leetcodeTags[]},
    concepts: [{id, name, summary}], tier }
Response:
  { known, title, diff, leetcodeTags, fits, confidence, bestConceptIds, reason, provider, model }
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

MAX_STATEMENT = 6000

SYSTEM = (
    "You are a senior competitive programmer and DSA interview coach. You decide whether practising a "
    "problem genuinely trains a given algorithmic pattern. Judge by the standard optimal solution: a problem "
    "fits a pattern when that pattern is the core idea of the intended solution, not when it appears only "
    "incidentally or in a sub-optimal approach. Be strict and honest. Never invent facts about a LeetCode "
    "problem you do not recognise from its slug. Reply with a single JSON object and nothing else."
)

SCHEMA_HINT = """Return exactly this JSON object:
{
  "known": true|false,            // LeetCode: do you confidently recognise this exact problem? custom: true if the statement is understandable
  "title": "string",              // official title (LeetCode) or the given title
  "diff": "E"|"M"|"H",            // LeetCode difficulty, or your estimate for a custom problem
  "leetcodeTags": ["string"],     // topic tags (LeetCode's own for known problems)
  "fits": true|false,             // does the intended optimal solution primarily use the TARGET pattern?
  "confidence": 0.0-1.0,          // confidence in `fits`
  "bestConceptIds": ["id"],       // 1-3 ids from the CATALOG that best match the problem, best first
  "reason": "string"              // <= 3 sentences: the key insight of the optimal solution and why it does/doesn't fit
}"""


def build_prompt(req: Dict[str, Any]) -> Tuple[str, str, List[str]]:
    problem = req.get("problem") or {}
    concept = req.get("concept") or {}
    catalog = req.get("concepts") or []
    ids = [c.get("id") for c in catalog if c.get("id")]
    lines = ["CATALOG (id: name — summary):"]
    for c in catalog[:200]:
        lines.append(f"- {c.get('id')}: {c.get('name')}" + (f" — {c.get('summary')}" if c.get("summary") else ""))
    lines.append("")
    lines.append(f"TARGET PATTERN: {concept.get('id')}: {concept.get('name')}")
    if concept.get("summary"):
        lines.append(f"  Summary: {concept['summary']}")
    if concept.get("triggers"):
        lines.append("  Recognise it when: " + "; ".join(concept["triggers"]))
    if concept.get("leetcodeTags"):
        lines.append("  Typical LeetCode tags: " + ", ".join(concept["leetcodeTags"]))
    lines.append("")
    if problem.get("kind") == "leetcode":
        lines.append(f"PROBLEM: LeetCode https://leetcode.com/problems/{problem.get('slug')}/ (slug: {problem.get('slug')}"
                     + (f", title given by the user: {problem.get('title')}" if problem.get("title") else "") + ")")
        lines.append("If you are not sure which LeetCode problem this slug is, set known=false, fits=false, confidence=0 and say so in reason.")
    else:
        statement = (problem.get("statement") or "").strip()[:MAX_STATEMENT]
        lines.append(f"PROBLEM (custom): {problem.get('title')}")
        if problem.get("url"):
            lines.append(f"Link: {problem['url']}")
        lines.append("Statement:\n" + (statement or "(no statement given — judge from the title only and lower your confidence)"))
    lines.append("")
    lines.append(SCHEMA_HINT)
    return SYSTEM, "\n".join(lines), ids


def extract_json(text: str) -> Optional[Dict[str, Any]]:
    """First balanced {...} object in the text (tolerates ```json fences and chatter)."""
    if not text:
        return None
    t = re.sub(r"```(?:json)?", "", text)
    start = t.find("{")
    while start != -1:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(t)):
            ch = t[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(t[start:i + 1])
                        return obj if isinstance(obj, dict) else None
                    except json.JSONDecodeError:
                        break
        start = t.find("{", start + 1)
    return None


def _bool(v: Any) -> bool:
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "1")
    return bool(v)


def normalize(obj: Dict[str, Any], catalog_ids: List[str], req: Dict[str, Any]) -> Dict[str, Any]:
    """Validate/clamp the model's JSON into the response contract."""
    problem = req.get("problem") or {}
    known = _bool(obj.get("known", problem.get("kind") == "custom"))
    try:
        conf = float(obj.get("confidence", 0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    diff = str(obj.get("diff") or "").strip().upper()[:1]
    diff = {"EASY": "E", "MEDIUM": "M", "HARD": "H"}.get(str(obj.get("diff", "")).upper(), diff)
    if diff not in ("E", "M", "H"):
        diff = None
    valid = set(catalog_ids)
    best = [c for c in (obj.get("bestConceptIds") or []) if isinstance(c, str) and c in valid][:3]
    tags = [str(t)[:40] for t in (obj.get("leetcodeTags") or []) if isinstance(t, (str, int))][:12]
    fits = _bool(obj.get("fits", False))
    if not known:
        fits, conf = False, min(conf, 0.3)
    return {
        "known": known,
        "title": (str(obj.get("title") or problem.get("title") or "")).strip()[:160],
        "diff": diff,
        "leetcodeTags": tags,
        "fits": fits,
        "confidence": round(conf, 2),
        "bestConceptIds": best,
        "reason": re.sub(r"\s+", " ", str(obj.get("reason") or "")).strip()[:700],
    }


def run(gateway, req: Dict[str, Any]) -> Dict[str, Any]:
    """Ask the gateway; if a provider returns unparsable JSON, retry once on the next provider."""
    if not (req.get("problem") and req.get("concept") and req["concept"].get("id")):
        raise ValueError("problem and concept are required")
    system, prompt, ids = build_prompt(req)
    tier = str(req.get("tier") or "verify")
    skip: List[str] = []
    last = ""
    for _ in range(2):
        res = gateway.call_ex(prompt, system_prompt=system, temperature=0.0, max_tokens=1024, json_mode=True, tier=tier, skip=skip or None)
        obj = extract_json(res["text"])
        if obj is not None:
            out = normalize(obj, ids, req)
            out["provider"], out["model"] = res["provider"], res["model"]
            return out
        last = res["text"][:200]
        skip.append(res["provider"])
    raise RuntimeError("The model did not return valid JSON: " + last)
