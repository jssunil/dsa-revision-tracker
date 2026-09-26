"""
Generic Multi-Provider LLM Gateway (vendored for the DSA tracker's local server).

Provenance: copied from C:\\sjk\\eagv3\\capstone\\designreview\\core\\llm_gateway.py -- rate-aware
tier routing, one retry-with-backoff per provider, exact-match response cache and a cost ledger across
Gemini, Groq, Cerebras, Anthropic, OpenRouter and Ollama. Changes in this copy:

  - .env is read from DSA_ENV_FILE if set (e.g. point it at designreview's .env), else the repo's .env.
  - TLS verification stays ON for every provider (the original disabled it for Gemini);
    SSL_CERT_FILE is honoured for a corporate CA bundle. The Gemini key goes in a header, not the URL.
  - Anthropic: current model (claude-opus-5, or ANTHROPIC_MODEL), no `temperature` (rejected by current
    models), text read from the `text` blocks (thinking blocks may come first), `stop_reason: "refusal"`
    treated as a provider failure, and server-side refusal fallbacks enabled (fallbacks: "default").
  - Model overrides from the environment (GEMINI_MODEL, GROQ_MODEL, CEREBRAS_MODEL, OPENROUTER_MODEL,
    OLLAMA_MODEL, ANTHROPIC_MODEL) win over routing.yaml.
  - call_ex() also returns which provider/model answered; health() reports providers for /api/health.
"""

from __future__ import annotations

import hashlib
import logging
import os
import ssl
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import httpx
import yaml

from economics import CostLedger

ROOT = Path(__file__).resolve().parent.parent

# Keys come from the file named by DSA_ENV_FILE (e.g. designreview's .env), else the repo's .env.
ENV_FILE = Path(os.getenv("DSA_ENV_FILE") or (ROOT / ".env"))
ENV_LOADED = False
try:
    from dotenv import load_dotenv
    ENV_LOADED = ENV_FILE.is_file() and load_dotenv(dotenv_path=ENV_FILE)
except ImportError:
    pass

logger = logging.getLogger("dsa.llm_gateway")

ROUTING_CONFIG_PATH = Path(__file__).parent / "routing.yaml"
DEFAULT_TIER_ORDER = ["gemini", "groq", "cerebras", "openrouter", "anthropic", "ollama"]
ENV_MODEL = {
    "gemini": "GEMINI_MODEL", "groq": "GROQ_MODEL", "cerebras": "CEREBRAS_MODEL",
    "openrouter": "OPENROUTER_MODEL", "anthropic": "ANTHROPIC_MODEL", "ollama": "OLLAMA_MODEL",
}


_SSL_CTX = None


def _tls_verify() -> Any:
    """Verify certificates against the OS trust store (works behind TLS-inspecting corporate proxies whose CA
    is installed in Windows/macOS) plus an optional extra CA bundle from SSL_CERT_FILE or NODE_EXTRA_CA_CERTS.
    httpx's default (certifi only) rejects such proxies; verification is never switched off."""
    global _SSL_CTX
    if _SSL_CTX is None:
        ctx = ssl.create_default_context()   # loads the OS certificate store
        for var in ("SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"):
            path = os.getenv(var)
            if path and os.path.isfile(path):
                ctx.load_verify_locations(cafile=path)
        try:
            import certifi  # keep the public roots too, in case the OS store is sparse
            ctx.load_verify_locations(cafile=certifi.where())
        except ImportError:
            pass
        _SSL_CTX = ctx
    return _SSL_CTX


@dataclass
class RateState:
    """Recent call outcomes for one provider; a rate-limited or recently-failed provider is skipped."""

    rpm_limit: int = 60
    _call_times: List[float] = field(default_factory=list)
    _cooldown_until: float = 0.0

    def available(self, now: Optional[float] = None) -> bool:
        now = now if now is not None else time.time()
        if now < self._cooldown_until:
            return False
        self._call_times = [t for t in self._call_times if now - t < 60]
        return len(self._call_times) < self.rpm_limit

    def record_call(self, now: Optional[float] = None) -> None:
        self._call_times.append(now if now is not None else time.time())

    def record_failure(self, cooldown_sec: float = 20.0, now: Optional[float] = None) -> None:
        self._cooldown_until = (now if now is not None else time.time()) + cooldown_sec


class ResponseCache:
    """Exact-prompt-hash cache over (system_prompt, prompt, temperature, tier)."""

    def __init__(self, maxsize: int = 256):
        self._store: Dict[str, Dict[str, str]] = {}
        self._order: List[str] = []
        self.maxsize = maxsize
        self._lock = threading.Lock()

    @staticmethod
    def _key(system_prompt: Optional[str], prompt: str, temperature: float, tier: str) -> str:
        return hashlib.sha256(f"{system_prompt or ''}|{prompt}|{temperature}|{tier}".encode("utf-8")).hexdigest()

    def get(self, *key) -> Optional[Dict[str, str]]:
        with self._lock:
            return self._store.get(self._key(*key))

    def set(self, value: Dict[str, str], *key) -> None:
        k = self._key(*key)
        with self._lock:
            if k not in self._store and len(self._order) >= self.maxsize:
                self._store.pop(self._order.pop(0), None)
            self._store[k] = value
            if k not in self._order:
                self._order.append(k)


def _load_routing_config(path: Path) -> Dict[str, Any]:
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


class LLMGateway:
    """Resilient multi-provider LLM transport with rate-aware routing, retry, caching and a cost ledger."""

    def __init__(self, routing_config_path: Optional[Path] = None):
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.groq_key = os.getenv("GROQ_API_KEY")
        self.cerebras_key = os.getenv("CEREBRAS_API_KEY")
        self.anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        self.openrouter_key = os.getenv("OPEN_ROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.ollama_enabled = os.getenv("DSA_USE_OLLAMA", "1") != "0"

        self._config = _load_routing_config(routing_config_path or ROUTING_CONFIG_PATH)
        self._provider_configs: Dict[str, Dict[str, Any]] = {p["name"]: p for p in self._config.get("providers", [])}
        self._rate_states: Dict[str, RateState] = {
            name: RateState(rpm_limit=cfg.get("rpm", 60)) for name, cfg in self._provider_configs.items()
        }
        self.cache = ResponseCache()
        self.ledger = CostLedger()
        self._lock = threading.Lock()

        self._adapters: Dict[str, Callable[..., str]] = {
            "gemini": self._call_gemini, "groq": self._call_groq, "cerebras": self._call_cerebras,
            "anthropic": self._call_anthropic, "openrouter": self._call_openrouter, "ollama": self._call_ollama,
        }
        self._key_present: Dict[str, Callable[[], bool]] = {
            "gemini": lambda: bool(self.gemini_key), "groq": lambda: bool(self.groq_key),
            "cerebras": lambda: bool(self.cerebras_key), "anthropic": lambda: bool(self.anthropic_key),
            "openrouter": lambda: bool(self.openrouter_key), "ollama": lambda: self.ollama_enabled,
        }

    # ---- introspection (for /api/health) ----
    def model_for(self, provider: str) -> Optional[str]:
        return os.getenv(ENV_MODEL.get(provider, "")) or self._provider_configs.get(provider, {}).get("model")

    def tiers(self) -> Dict[str, List[str]]:
        return dict(self._config.get("tiers", {}))

    def health(self) -> Dict[str, Any]:
        names = list(self._provider_configs) or DEFAULT_TIER_ORDER
        by_provider: Dict[str, int] = {}
        for e in self.ledger.entries:
            by_provider[e.provider] = by_provider.get(e.provider, 0) + 1
        s = self.ledger.summary()
        return {
            "providers": [{"name": n, "model": self.model_for(n), "keyPresent": self._key_present.get(n, lambda: False)()} for n in names],
            "tiers": self.tiers(),
            "ledger": {"calls": s["calls"], "tokens": s["tokens_estimated"], "costUsd": s["cost_usd_estimated"], "byProvider": by_provider},
        }

    def _candidate_order(self, tier: str) -> List[str]:
        tiers = self._config.get("tiers", {})
        return tiers.get(tier) or tiers.get("default") or DEFAULT_TIER_ORDER

    def call(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.1,
             max_tokens: int = 4096, json_mode: bool = False, tier: str = "default") -> str:
        return self.call_ex(prompt, system_prompt, temperature, max_tokens, json_mode, tier)["text"]

    def call_ex(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.1,
                max_tokens: int = 4096, json_mode: bool = False, tier: str = "default",
                skip: Optional[List[str]] = None) -> Dict[str, str]:
        """Like call(), but returns {text, provider, model}. `skip` excludes providers (e.g. after a bad answer)."""
        cached = self.cache.get(system_prompt, prompt, temperature, tier)
        if cached is not None and not skip:
            logger.info("cache_hit tier=%s", tier)
            return dict(cached, cached="1")

        errors: List[str] = []
        for provider in self._candidate_order(tier):
            if skip and provider in skip:
                continue
            if not self._key_present.get(provider, lambda: False)():
                continue
            with self._lock:
                state = self._rate_states.setdefault(provider, RateState())
                if not state.available():
                    errors.append(f"{provider}: skipped (cooling down / rate-limited)")
                    continue
            model_name = self.model_for(provider)
            for attempt in range(2):  # one retry-with-backoff per provider
                try:
                    with self._lock:
                        state.record_call()
                    t0 = time.time()
                    text = self._adapters[provider](prompt, system_prompt, temperature, max_tokens, json_mode, model_name)
                    latency = time.time() - t0
                    with self._lock:
                        self.ledger.record(provider, model_name or provider, prompt, text, latency)
                    result = {"text": text, "provider": provider, "model": model_name or provider}
                    self.cache.set(result, system_prompt, prompt, temperature, tier)
                    return result
                except Exception as e:  # noqa: BLE001 - any provider failure moves on to the next provider
                    if attempt == 0:
                        time.sleep(1.5)
                        continue
                    with self._lock:
                        state.record_failure()
                    errors.append(f"{provider}: {e}")
        raise RuntimeError("All LLM providers failed: " + ("; ".join(errors) or "no provider has an API key configured"))

    # ---- provider adapters ----
    def _call_gemini(self, prompt, system_prompt, temp, max_tok, json_mode, model=None) -> str:
        model = model or "gemini-2.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        body: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temp, "maxOutputTokens": max_tok},
        }
        if system_prompt:
            body["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"
        with httpx.Client(timeout=60.0, verify=_tls_verify()) as client:
            resp = client.post(url, headers={"x-goog-api-key": self.gemini_key}, json=body)
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini HTTP {resp.status_code}: {resp.text[:300]}")
            parts = resp.json()["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts if not p.get("thought"))

    def _openai_style(self, name, url, key, prompt, system_prompt, temp, max_tok, json_mode, model, json_supported=True) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        body: Dict[str, Any] = {"model": model, "messages": messages, "temperature": temp, "max_tokens": max_tok}
        if json_mode and json_supported:
            body["response_format"] = {"type": "json_object"}
        with httpx.Client(timeout=60.0, verify=_tls_verify()) as client:
            resp = client.post(url, headers={"Authorization": f"Bearer {key}"}, json=body)
            if resp.status_code != 200:
                raise RuntimeError(f"{name} HTTP {resp.status_code}: {resp.text[:300]}")
            return resp.json()["choices"][0]["message"]["content"]

    def _call_groq(self, prompt, system_prompt, temp, max_tok, json_mode, model=None) -> str:
        return self._openai_style("Groq", "https://api.groq.com/openai/v1/chat/completions", self.groq_key,
                                  prompt, system_prompt, temp, max_tok, json_mode, model or "llama-3.3-70b-versatile")

    def _call_cerebras(self, prompt, system_prompt, temp, max_tok, json_mode, model=None) -> str:
        return self._openai_style("Cerebras", "https://api.cerebras.ai/v1/chat/completions", self.cerebras_key,
                                  prompt, system_prompt, temp, max_tok, json_mode, model or "llama3.1-8b")

    def _call_openrouter(self, prompt, system_prompt, temp, max_tok, json_mode, model=None) -> str:
        return self._openai_style("OpenRouter", "https://openrouter.ai/api/v1/chat/completions", self.openrouter_key,
                                  prompt, system_prompt, temp, max_tok, json_mode,
                                  model or "meta-llama/llama-3.3-70b-instruct:free", json_supported=False)

    def _call_anthropic(self, prompt, system_prompt, temp, max_tok, json_mode=False, model=None) -> str:
        # Current Claude models reject `temperature` (sampling params removed) and may return thinking blocks
        # before the text; refusals come back as HTTP 200 with stop_reason "refusal". Server-side fallbacks
        # re-run a policy-declined request on Anthropic's recommended fallback model.
        model = model or "claude-opus-5"
        body: Dict[str, Any] = {
            "model": model,
            "max_tokens": max(max_tok, 4096),
            "messages": [{"role": "user", "content": prompt}],
            "fallbacks": "default",
        }
        if system_prompt:
            body["system"] = system_prompt
        headers = {
            "x-api-key": self.anthropic_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "server-side-fallback-2026-07-01",
            "content-type": "application/json",
        }
        with httpx.Client(timeout=180.0, verify=_tls_verify()) as client:
            resp = client.post("https://api.anthropic.com/v1/messages", headers=headers, json=body)
            if resp.status_code != 200:
                raise RuntimeError(f"Anthropic HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            if data.get("stop_reason") == "refusal":
                details = data.get("stop_details") or {}
                raise RuntimeError(f"Anthropic refusal ({details.get('category')})")
            text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
            if not text.strip():
                raise RuntimeError(f"Anthropic returned no text (stop_reason={data.get('stop_reason')})")
            return text

    def _call_ollama(self, prompt, system_prompt, temp, max_tok, json_mode, model=None) -> str:
        model = model or "gemma:latest"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        body: Dict[str, Any] = {"model": model, "messages": messages, "stream": False,
                                "options": {"temperature": temp, "num_predict": max_tok}}
        if json_mode:
            body["format"] = "json"
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(f"{self.ollama_url}/api/chat", json=body)
            if resp.status_code != 200:
                raise RuntimeError(f"Ollama HTTP {resp.status_code}: {resp.text[:300]}")
            return resp.json()["message"]["content"]
