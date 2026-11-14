import re

f = r"C:\Users\523ur\AppData\Local\colibri\runtime\colibri-v2.1.0\openai_server.py"
lines = open(f, encoding="utf-8").read().splitlines()

print("=== parse_arch_tool_calls / tool family registry ===")
for i, line in enumerate(lines, 1):
    if re.search(r"parse_arch_tool_calls|def parse_tool_calls|TOOL_NATIVE|tool_families|arch_tool", line):
        print(f"L{i}: {line.strip()[:150]}")

print("\n=== qwen36 occurrences ===")
n = 0
for i, line in enumerate(lines, 1):
    if "qwen36" in line:
        print(f"L{i}: {line.strip()[:150]}")
        n += 1
        if n >= 25:
            break

print("\n=== context around the tools gate (L1795-1850) ===")
for i in range(1795, min(1851, len(lines) + 1)):
    t = lines[i - 1].rstrip()
    if t.strip():
        print(f"L{i}: {t[:170]}")
