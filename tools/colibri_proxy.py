"""Colibri <-> OpenCode compatibility proxy — async (aiohttp + orjson).

OpenCode (v2.3.0) sends requests that the local Colibri engine handles poorly:

  * "tools": [...]            - a ~15 KB tool catalog the 4B model never uses;
  * "stream_options"          - makes the engine stall before the first token;
  * "max_completion_tokens"   - Colibri ignores it and defaults max_tokens to
                                the whole context (12288), so one turn can
                                generate for hours.

This proxy sits on 8001, rewrites the body, forwards to Colibri on 8000 and
streams the answer back unchanged.

  python tools/colibri_proxy.py --listen 8001 --upstream-host 127.0.0.1 --upstream-port 8000 --log <path>

Implementation notes:
  * async aiohttp instead of blocking ThreadingHTTPServer (the old sync proxy
    serialized every request through one thread per connection and paid a
    fresh connect per request).
  * orjson instead of the stdlib json module (faster parse/dump, native UTF-8).
  * a shared TCPConnector pool (limit=100, ttl_dns_cache=300) so keep-alive
    connections to the engine are reused.
  * uvloop is the usual asyncio fast path, but it does not build on Windows,
    so the default asyncio loop is used here.
"""

import argparse
import asyncio
import time

import orjson
from aiohttp import ClientSession, ClientTimeout, TCPConnector, web

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
    "qwen3-coder-30b-a3b-colibri": {"write", "read", "list", "edit", "bash", "grep", "read_skill"},
}

# hop-by-hop headers we never forward in either direction
_CLIENT_SKIP = {"host", "content-length", "connection", "accept-encoding", "keep-alive",
                "transfer-encoding", "te", "upgrade"}
_UPSTREAM_SKIP = {"transfer-encoding", "connection", "date", "server", "content-length"}

_session: ClientSession | None = None


def rewrite(body_bytes):
    """Return (new_body_bytes, note) with the incompatible fields fixed."""
    try:
        # utf-8-sig tolerates a BOM (PowerShell Out-File -Encoding utf8 adds one)
        obj = orjson.loads(body_bytes.decode("utf-8-sig"))
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
    return orjson.dumps(obj), f"model={model}; " + ("; ".join(notes) or "clean")


def _record(method, path, note, n_in, n_out, seconds):
    line = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "method": method,
        "path": path,
        "note": note,
        "in_bytes": n_in,
        "out_bytes": n_out,
        "seconds": round(seconds, 2),
    }
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(orjson.dumps(line).decode("utf-8") + "\n")
    except OSError:
        pass  # logging must never break proxying


async def handle(request: web.Request) -> web.StreamResponse:
    t0 = time.time()
    method, path = request.method, request.path_qs
    length = request.content_length or 0
    raw = await request.read() if length else b""
    if method == "POST" and raw:
        new_raw, note = rewrite(raw)
    else:
        new_raw, note = raw, "no body"

    headers = {k: v for k, v in request.headers.items() if k.lower() not in _CLIENT_SKIP}
    headers["Host"] = f"{UPSTREAM[0]}:{UPSTREAM[1]}"
    if new_raw:
        headers["Content-Length"] = str(len(new_raw))

    out = 0
    try:
        assert _session is not None
        async with _session.request(method, f"http://{UPSTREAM[0]}:{UPSTREAM[1]}{path}",
                                    data=new_raw or None, headers=headers) as resp:
            upstream_length = resp.headers.get("Content-Length")
            response = web.StreamResponse(status=resp.status)
            for key, value in resp.headers.items():
                if key.lower() in _UPSTREAM_SKIP:
                    continue
                response.headers[key] = value
            if upstream_length is not None:
                response.headers["Content-Length"] = upstream_length
            else:
                response.enable_chunked_encoding()
            await response.prepare(request)
            async for chunk in resp.content.iter_any():
                if chunk:
                    await response.write(chunk)
                    out += len(chunk)
            await response.write_eof()
            _record(method, path, note, len(raw), out, time.time() - t0)
            return response
    except Exception as exc:
        msg = f"upstream error: {exc}"
        _record(method, path, msg, len(raw), 0, time.time() - t0)
        return web.Response(status=502, text=msg, content_type="text/plain", charset="utf-8")


async def main():
    global _session, UPSTREAM, LOG_PATH
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen", type=int, default=8001)
    ap.add_argument("--upstream-host", default="127.0.0.1")
    ap.add_argument("--upstream-port", type=int, default=8000)
    ap.add_argument("--log", required=True)
    args = ap.parse_args()

    UPSTREAM = (args.upstream_host, args.upstream_port)
    LOG_PATH = args.log
    open(LOG_PATH, "a", encoding="utf-8").close()

    connector = TCPConnector(limit=100, ttl_dns_cache=300, force_close=False)
    _session = ClientSession(connector=connector,
                             timeout=ClientTimeout(total=900))

    app = web.Application()
    app.router.add_route("*", "/{tail:.*}", handle)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", args.listen)
    await site.start()
    print(f"colibri proxy: 127.0.0.1:{args.listen} -> {UPSTREAM[0]}:{UPSTREAM[1]}, log {LOG_PATH}", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await _session.close()
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
