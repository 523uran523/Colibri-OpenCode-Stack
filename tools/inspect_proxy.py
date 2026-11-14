"""Tiny logging proxy in front of Colibri.

Listens on --port (default 8001), forwards every request to --upstream
(default 127.0.0.1:8000) and appends the request headers/body to a JSONL log
so we can see exactly what OpenCode sends.

HTTP/1.0 is used towards the client so streaming responses need no chunking:
everything written is flushed and the connection closes at the end.
"""

import argparse
import http.client
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG_LOCK = threading.Lock()
LOG_PATH = ""
UPSTREAM = ("127.0.0.1", 8000)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, *args):
        pass

    def _record(self, body):
        rec = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "method": self.command,
            "path": self.path,
            "headers": dict(self.headers.items()),
            "body_bytes": len(body),
            "body": body.decode("utf-8", "replace"),
        }
        try:
            with LOG_LOCK, open(LOG_PATH, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        except OSError as exc:
            print("log write failed:", exc)

    def _relay(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        self._record(body)

        skip = {"host", "content-length", "connection", "accept-encoding", "keep-alive"}
        headers = {k: v for k, v in self.headers.items() if k.lower() not in skip}
        headers["Host"] = f"{UPSTREAM[0]}:{UPSTREAM[1]}"
        if body:
            headers["Content-Length"] = str(len(body))

        conn = http.client.HTTPConnection(UPSTREAM[0], UPSTREAM[1], timeout=900)
        try:
            conn.request(self.command, self.path, body=body or None, headers=headers)
            resp = conn.getresponse()
        except Exception as exc:  # upstream down / reset
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"upstream error: {exc}".encode())
            return

        self.send_response(resp.status)
        upstream_length = resp.getheader("Content-Length")
        for key, value in resp.getheaders():
            low = key.lower()
            if low in ("transfer-encoding", "connection", "date", "server", "content-length"):
                continue
            self.send_header(key, value)
        if upstream_length is not None:
            self.send_header("Content-Length", upstream_length)
        self.end_headers()

        try:
            while True:
                chunk = resp.read1(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()

    do_GET = _relay
    do_POST = _relay
    do_DELETE = _relay


def main():
    global LOG_PATH, UPSTREAM
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8001)
    ap.add_argument("--upstream-host", default="127.0.0.1")
    ap.add_argument("--upstream-port", type=int, default=8000)
    ap.add_argument("--log", required=True)
    args = ap.parse_args()

    LOG_PATH = args.log
    UPSTREAM = (args.upstream_host, args.upstream_port)
    open(LOG_PATH, "a", encoding="utf-8").close()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    print(f"proxying 127.0.0.1:{args.port} -> {UPSTREAM[0]}:{UPSTREAM[1]}, log {LOG_PATH}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
