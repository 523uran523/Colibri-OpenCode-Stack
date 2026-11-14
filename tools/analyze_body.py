import json

src = r"C:\Users\523ur\OneDrive\Документы\calibri\tools\main-body.json"
raw = open(src, "rb").read()
print("raw bytes:", len(raw), "first bytes:", raw[:4])
obj = json.loads(raw.decode("utf-8-sig"))
print("parsed OK; top keys:", sorted(obj.keys()))
print("tools:", len(obj.get("tools", [])), "stream:", obj.get("stream"),
      "stream_options:", obj.get("stream_options"),
      "max_completion_tokens:", obj.get("max_completion_tokens"))
sys_content = obj["messages"][0]["content"]
print("system chars:", len(sys_content))
print("system head:", sys_content[:400].replace("\n", "\\n"))
print("system tail:", sys_content[-300:].replace("\n", "\\n"))
print("messages roles:", [m.get("role") for m in obj["messages"]])
print("user msg chars:", len(obj["messages"][-1]["content"]))

# rewrite exactly like the proxy
n_tools = len(obj.pop("tools", []) or [])
obj.pop("stream_options", None)
mc = obj.pop("max_completion_tokens", None)
if mc is not None:
    obj["max_tokens"] = min(int(mc), 1024)
out = json.dumps(obj, ensure_ascii=False).encode("utf-8")
open(r"C:\Users\523ur\OneDrive\Документы\calibri\tools\main-body-rewritten.json", "wb").write(out)
print("rewritten bytes:", len(out), "tools removed:", n_tools, "max_tokens:", obj.get("max_tokens"))
print("system-only token estimate ~", round(len(sys_content) / 3.5))
