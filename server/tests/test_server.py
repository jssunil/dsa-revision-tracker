"""pytest server/tests  — gateway stubbed, no network, no keys needed."""
import http.client
import json
import os
import sys
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DSA_ENV_FILE", str(Path(__file__).with_name("nonexistent.env")))

import verify  # noqa: E402
import serve  # noqa: E402

REQ = {
    "problem": {"kind": "leetcode", "slug": "3sum", "title": "3Sum"},
    "concept": {"id": "two-pointers", "name": "Two Pointers", "summary": "ends walk inward", "triggers": ["sorted"], "leetcodeTags": []},
    "concepts": [{"id": "two-pointers", "name": "Two Pointers"}, {"id": "hashing", "name": "Hashing"}],
}


class StubGateway:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def call_ex(self, prompt, system_prompt=None, temperature=0.1, max_tokens=4096, json_mode=False, tier="default", skip=None):
        self.calls.append({"prompt": prompt, "tier": tier, "skip": skip})
        provider, text = self.replies.pop(0)
        return {"text": text, "provider": provider, "model": provider + "-m"}

    def health(self):
        return {"providers": [{"name": "stub", "model": "m", "keyPresent": True}], "tiers": {"verify": ["stub"]},
                "ledger": {"calls": 0, "tokens": 0, "costUsd": 0, "byProvider": {}}}


def test_extract_json_handles_fences_and_chatter():
    assert verify.extract_json('Sure!\n```json\n{"a": {"b": "}"}}\n```') == {"a": {"b": "}"}}
    assert verify.extract_json("no json here") is None


def test_prompt_contains_catalog_target_and_problem():
    system, prompt, ids = verify.build_prompt(REQ)
    assert ids == ["two-pointers", "hashing"]
    assert "TARGET PATTERN: two-pointers: Two Pointers" in prompt
    assert "leetcode.com/problems/3sum/" in prompt
    assert "JSON" in system


def test_run_normalizes_and_clamps():
    gw = StubGateway([("gemini", json.dumps({"known": True, "title": "3Sum", "diff": "Medium", "leetcodeTags": ["Array"],
                                            "fits": True, "confidence": 1.7, "bestConceptIds": ["two-pointers", "made-up"], "reason": "sort + converge"}))])
    out = verify.run(gw, REQ)
    assert out["fits"] is True and out["confidence"] == 1.0
    assert out["diff"] == "M"
    assert out["bestConceptIds"] == ["two-pointers"], "ids outside the catalog are dropped"
    assert out["provider"] == "gemini" and gw.calls[0]["tier"] == "verify"


def test_unknown_problem_never_fits():
    gw = StubGateway([("groq", '{"known": false, "fits": true, "confidence": 0.9, "reason": "unsure"}')])
    out = verify.run(gw, REQ)
    assert out["known"] is False and out["fits"] is False and out["confidence"] <= 0.3


def test_bad_json_retries_on_next_provider():
    gw = StubGateway([("gemini", "I think it fits!"), ("groq", '{"known": true, "fits": false, "confidence": 0.8, "bestConceptIds": ["hashing"]}')])
    out = verify.run(gw, REQ)
    assert out["provider"] == "groq" and gw.calls[1]["skip"] == ["gemini"]
    assert out["bestConceptIds"] == ["hashing"]


def test_missing_concept_is_rejected():
    with pytest.raises(ValueError):
        verify.run(StubGateway([]), {"problem": {"kind": "custom", "title": "x"}})


@pytest.fixture()
def server(monkeypatch):
    monkeypatch.setattr(serve, "GATEWAY", StubGateway([("cerebras", '{"known": true, "fits": true, "confidence": 0.9, "bestConceptIds": ["two-pointers"]}')]))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(serve.Handler, directory=str(serve.ROOT)))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield httpd.server_address[1]
    httpd.shutdown()


def _req(port, method, path, body=None, host=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    headers = {"Host": host or f"localhost:{port}"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    c.request(method, path, body=data, headers=headers)
    r = c.getresponse()
    return r.status, r.read()


def test_http_health_verify_and_static(server):
    s, b = _req(server, "GET", "/api/health")
    assert s == 200 and json.loads(b)["providers"][0]["name"] == "stub"
    s, b = _req(server, "POST", "/api/verify", REQ)
    assert s == 200 and json.loads(b)["provider"] == "cerebras"
    s, _ = _req(server, "GET", "/index.html")
    assert s == 200


def test_http_blocks_secrets_and_foreign_hosts(server):
    assert _req(server, "GET", "/.env")[0] == 404
    assert _req(server, "GET", "/server/serve.py")[0] == 404
    assert _req(server, "GET", "/.git/config")[0] == 404
    assert _req(server, "GET", "/api/health", host="evil.example:80")[0] == 403
    assert _req(server, "POST", "/api/verify", {"problem": {}})[0] == 400
