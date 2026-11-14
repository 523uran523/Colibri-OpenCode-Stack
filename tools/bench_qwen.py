"""Prefill/decode speed benchmark vs cap 32 baseline.
POSTs a long prompt to the colibri-local/qwen3-coder model via proxy 8001,
measures time-to-first-token and decode tok/s. Outputs TSV.
Usage: py -3 tools\bench_qwen.py
"""
import json, sys, time, urllib.request

URL = "http://127.0.0.1:8001/v1/chat/completions"
REAL = ["write", "read", "list", "edit", "bash", "grep", "glob", "task",
        "webfetch", "websearch", "skill", "todowrite", "exec"]
TOOLS = []
for i, name in enumerate(REAL):
    TOOLS.append({
        "type": "function",
        "function": {
            "name": name,
            "description": f"Perform {name} operation",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                "required": ["path"],
            },
        },
    })

prompt = (("# Задание\nСоздай файл test_qwen.py с функцией add(a, b) и "
           "напиши краткое описание. Повторю инструкцию для длины: ")
          + ("creating a python file with an add function. " * 600)
          + "\nОтветь только инструментом write, без пояснений.")

payload = {
    "model": "qwen3-coder-30b-a3b-colibri",
    "messages": [
        {"role": "system", "content": "You are a coding agent."},
        {"role": "user", "content": prompt},
    ],
    "tools": TOOLS,
    "tool_choice": "auto",
    "temperature": 0.1,
    "max_tokens": 200,
    "stream": True,
}
body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(URL, data=body,
                             headers={"Content-Type": "application/json"})

t0 = time.perf_counter()
first = None
chunks = 0
try:
    with urllib.request.urlopen(req, timeout=900) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                break
            obj = json.loads(data)
            delta = obj.get("choices", [{}])[0].get("delta", {})
            if delta and first is None:
                first = time.perf_counter()
            content = delta.get("content") or ""
            tc = delta.get("tool_calls")
            if content or tc:
                chunks += 1
        tend = time.perf_counter()
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)

prefill_s = (first - t0) if first else -1
total_s = tend - t0
print(f"first_token_s={prefill_s:.2f}\ttotal_s={total_s:.2f}\t"
      f"decode_s={total_s - prefill_s:.2f}\tchunks={chunks}\t"
      f"prompt_chars={len(prompt)}\tmax_tokens=200")
