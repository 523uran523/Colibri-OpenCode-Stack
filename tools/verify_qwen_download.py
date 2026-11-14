"""Verify the coli download against .colibri-download.json (sizes + completeness).

Usage: py -3 tools/verify_qwen_download.py [dir]
Default dir: models\\qwen3-coder-30b next to this file.
"""
import json
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
d = Path(sys.argv[1]) if len(sys.argv) > 1 else here.parent / "models" / "qwen3-coder-30b"
manifest = d / ".colibri-download.json"
if not manifest.exists():
    print(f"no manifest: {manifest}")
    sys.exit(2)

m = json.loads(manifest.read_text(encoding="utf-8"))
print(f"repo: {m.get('repo')}  revision: {m.get('revision')}  complete: {m.get('complete')}")
bad = 0
missing = 0
total = 0
for entry in m.get("files", []):
    rel = entry["path"]
    want = entry["size"]
    p = d / rel
    if not p.exists():
        print(f"MISSING  {rel}")
        missing += 1
        continue
    got = p.stat().st_size
    total += got
    if got != want:
        print(f"SIZE     {rel}: have {got}, want {want}")
        bad += 1
leftover = [p.name for p in d.iterdir() if p.name.endswith(".part")]
print(f"checked {len(m.get('files', []))} files, {bad} size mismatches, {missing} missing")
print(f"total bytes on disk: {total} ({total / 1e9:.2f} GB)")
print(f"leftover .part files: {leftover or 'none'}")
sys.exit(1 if (bad or missing or leftover) else 0)
