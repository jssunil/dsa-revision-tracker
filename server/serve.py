"""Local companion server for the DSA tracker.

    python server/serve.py            # http://localhost:8765  (DSA_PORT to change)

- Serves the app from the repo root (replaces `python -m http.server`), never dotfiles or server/.
- GET  /api/health   providers (key present?), models, tiers, cost ledger
- POST /api/verify   pattern check through the multi-provider LLM gateway (keys from .env)

Bound to 127.0.0.1 only, and requests must carry a localhost Host header (blocks DNS-rebinding), so
your API keys are only usable from this machine. No CORS headers: only pages served by this server
can call the API.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from llm_gateway import LLMGateway, ENV_FILE, ENV_LOADED  # noqa: E402
import verify  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MAX_BODY = 256 * 1024
logging.basicConfig(level=os.getenv("DSA_LOG", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("dsa.server")

GATEWAY = LLMGateway()


def _host_ok(host: str) -> bool:
    name = (host or "").rsplit(":", 1)[0].strip("[]").lower()
    return name in ("localhost", "127.0.0.1", "::1")


class Handler(SimpleHTTPRequestHandler):
    server_version = "DSATracker/2"

    def _json(self, status: int, obj) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _blocked(self) -> bool:
        if not _host_ok(self.headers.get("Host", "")):
            self._json(403, {"error": "localhost only"})
            return True
        path = self.path.split("?", 1)[0]
        parts = [p for p in path.split("/") if p]
        if any(p.startswith(".") for p in parts) or (parts and parts[0] in ("server", "tests", "node_modules")):
            self._json(404, {"error": "not found"})
            return True
        return False

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self._blocked():
            return
        if self.path.split("?", 1)[0] == "/api/health":
            return self._json(200, GATEWAY.health())
        return super().do_GET()

    def do_HEAD(self):
        if self._blocked():
            return
        return super().do_HEAD()

    def do_POST(self):
        if self._blocked():
            return
        if self.path.split("?", 1)[0] != "/api/verify":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(413 if length > MAX_BODY else 400, {"error": "bad request size"})
        try:
            req = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return self._json(400, {"error": "invalid JSON"})
        try:
            return self._json(200, verify.run(GATEWAY, req))
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 - report provider failures to the UI
            log.warning("verify failed: %s", e)
            return self._json(502, {"error": str(e)[:500]})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            log.info(fmt, *args)


def main() -> None:
    port = int(os.getenv("DSA_PORT", "8765"))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    h = GATEWAY.health()
    keys = [p["name"] for p in h["providers"] if p["keyPresent"]]
    print(f"API keys from: {ENV_FILE}" + ("" if ENV_LOADED else "  (NOT FOUND - set DSA_ENV_FILE to your .env)"))
    print(f"DSA tracker on http://localhost:{port}  (LLM providers with keys: {', '.join(keys) or 'none - set DSA_ENV_FILE'})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
