"""Colibri <-> OpenCode compatibility proxy.

OpenCode (v2.3.0) sends requests that the local Colibri engine handles poorly:

  * "tools": [...]            - a ~15 KB tool catalog the 4B model never uses;
  * "stream_options"          - makes the engine stall before the first token;
  * "max_completion_tokens"   - Colibri ignores it and defaults max_tokens to
                                the whole context (12288), so one turn can
                                generate for hours.

This proxy sits on 8001, rewrites the body, forwards to Colibri on 8000 and
streams the answer back unchanged.

  python tools/colibri_proxy.py --listen 8001 --upstream 127.0.0.1:8000
"""

import argparse
import http.client
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LISTEN = ("127.0.0.1", 8001)
UPSTREAM = ("127.0.0.1", 8000)
LOG_PATH = ""

# cap the generation length OpenCode asks for
MAX_TOKENS_CAP = 1024
# models that must NOT receive the tools array (Colibri renders it into the prompt;
# Parable at ctx 4096 only fits ~2557 tokens without it). Tool-calling models
# (qwen3-coder-30b) keep their tools.
TOOLLESS_MODELS = {"parable-qwen3-4b"}
# Per-model tool allowlist: only these tool names are forwarded to the engine.
# The engine renders the whole tools array into the prompt (# Tools block),
# so a smaller catalog = faster prefill. OpenCode V2 ignores the legacy
# "tools" config map, so filtering happens here instead.
# "write,read,list" = speed benchmark only; 6 tools = real work.
KEEP_TOOLS = {
    "qwen3-coder-30b-a3b-colibri": {"write", "read", "list", "edit", "bash", "grep"},
}

_lock = threading.Lock()


def rewrite(body_bytes):
    """Return (new_body_bytes, note) with the incompatible fields fixed."""
    try:
        # utf-8-sig tolerates a BOM (PowerShell Out-File -Encoding utf8 adds one)
        obj = json.loads(body_bytes.decode("utf-8-sig"))
    except Exception:
        return body_bytes, "passthrough (not json)"
    notes = []
    model = str(obj.get("model", ""))
    if obj.get("tools"):
        n = len(obj["tools"])
        if model in TOOLLESS_MODELS:
            obj.pop("tools", None)
            notes.append(f"tools:{n} removed (toolless model)")
        elif model in KEEP_TOOLS:
            allow = KEEP_TOOLS[model]
            kept = [t for t in obj["tools"]
                    if str((t.get("function") or {}).get("name", "")) in allow]
            if kept:
                obj["tools"] = kept
                kept_names = sorted({str((t.get("function") or {}).get("name", "")) for t in kept})
                notes.append(f"tools:{len(kept)}/{n} kept ({','.join(kept_names)})")
            else:
                names = ",".join(sorted({str((t.get("function") or {}).get("name", "")) for t in obj["tools"]}))
                notes.append(f"tools:{n} kept (filter miss: names={names})")
        else:
            notes.append(f"tools:{n} kept")
    if obj.get("stream_options") is not None:
        obj.pop("stream_options", None)
        notes.append("stream_options removed")
    cap = MAX_TOKENS_CAP if model in TOOLLESS_MODELS else 4096
    if "max_completion_tokens" in obj:
        obj["max_tokens"] = min(int(obj.pop("max_completion_tokens")), cap)
        notes.append(f"max_completion_tokens -> max_tokens:{obj['max_tokens']}")
    elif "max_tokens" in obj:
        obj["max_tokens"] = min(int(obj["max_tokens"]), cap)
        notes.append(f"max_tokens capped:{obj['max_tokens']}")
    return json.dumps(obj, ensure_ascii=False).encode("utf-8"), f"model={model}; " + ("; ".join(notes) or "clean")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, *args):
        pass

    def _record(self, method, note, n_in, n_out, seconds):
        line = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "method": method,
            "path": self.path,
            "note": note,
            "in_bytes": n_in,
            "out_bytes": n_out,
            "seconds": round(seconds, 2),
        }
        with _lock, open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(line, ensure_ascii=False) + "\n")

    def _relay(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if self.command == "POST" and raw:
            new_raw, note = rewrite(raw)
        else:
            new_raw, note = raw, "no body"

        skip = {"host", "content-length", "connection", "accept-encoding", "keep-alive"}
        headers = {k: v for k, v in self.headers.items() if k.lower() not in skip}
        headers["Host"] = f"{UPSTREAM[0]}:{UPSTREAM[1]}"
        if new_raw:
            headers["Content-Length"] = str(len(new_raw))

        t0 = time.time()
        conn = http.client.HTTPConnection(UPSTREAM[0], UPSTREAM[1], timeout=900)
        try:
            conn.request(self.command, self.path, body=new_raw or None, headers=headers)
            resp = conn.getresponse()
        except Exception as exc:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"upstream error: {exc}".encode())
            self._record(self.command, f"upstream error: {exc}", length, 0, time.time() - t0)
            return

        self.send_response(resp.status)
        upstream_length = resp.getheader("Content-Length")
        for key, value in resp.getheaders():
            if key.lower() in ("transfer-encoding", "connection", "date", "server", "content-length"):
                continue
            self.send_header(key, value)
        if upstream_length is not None:
            self.send_header("Content-Length", upstream_length)
        self.end_headers()

        out = 0
        try:
            while True:
                chunk = resp.read1(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
                out += len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()
        self._record(self.command, note, length, out, time.time() - t0)

    do_GET = _relay
    do_POST = _relay
    do_DELETE = _relay


def main():
    global LOG_PATH
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen", type=int, default=8001)
    ap.add_argument("--upstream-host", default="127.0.0.1")
    ap.add_argument("--upstream-port", type=int, default=8000)
    ap.add_argument("--log", required=True)
    args = ap.parse_args()

    global UPSTREAM
    UPSTREAM = (args.upstream_host, args.upstream_port)
    LOG_PATH = args.log
    open(LOG_PATH, "a", encoding="utf-8").close()

    server = ThreadingHTTPServer(("127.0.0.1", args.listen), Handler)
    server.daemon_threads = True
    print(f"colibri proxy: 127.0.0.1:{args.listen} -> {UPSTREAM[0]}:{UPSTREAM[1]}, log {LOG_PATH}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
