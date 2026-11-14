from __future__ import annotations

import json
import zipfile
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
BLOCKS_PATH = ROOT_DIR / "blocks.json"
MODELS_DIR = ROOT_DIR / "all_blocks" / "models"
SUMMARY_PATH = ROOT_DIR / "all_blocks" / "models" / "blocks_enrichment_summary.json"

IGNORED_JSON = {
    "storage.json",
    "model.json",
    "logs.json",
    "configset.json",
    "callbacks.json",
}


def normalize_ports(items: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        port = {key: value for key, value in item.items() if key != "portID"}
        normalized.append(port)
    return normalized


def iter_model_blocks(model_path: Path):
    with zipfile.ZipFile(model_path) as archive:
        for name in archive.namelist():
            if not name.endswith(".json") or name in IGNORED_JSON:
                continue
            payload = json.loads(archive.read(name).decode("utf-8"))
            if not isinstance(payload, dict):
                continue
            state = payload.get("state", {})
            if not isinstance(state, dict):
                continue
            for item in state.values():
                if isinstance(item, dict) and item.get("type") == "block":
                    yield item


def main() -> int:
    blocks = json.loads(BLOCKS_PATH.read_text(encoding="utf-8"))
    block_index = {(item["blockSet"], item["path"]): item for item in blocks}
    extracted: dict[tuple[str, str], dict] = {}
    duplicates: list[dict] = []

    for model_path in sorted(MODELS_DIR.glob("*.engee")):
        block_set = model_path.stem
        for block in iter_model_blocks(model_path):
            block_path = block.get("blockPath")
            if not isinstance(block_path, str):
                continue
            key = (block_set, block_path)
            if key not in block_index:
                continue

            payload = {
                "blockValues": block.get("blockValues", {}) or {},
                "blockInputs": normalize_ports(block.get("blockInputs")),
                "blockOutputs": normalize_ports(block.get("blockOutputs")),
            }

            previous = extracted.get(key)
            if previous is not None and previous != payload:
                duplicates.append(
                    {
                        "blockSet": block_set,
                        "path": block_path,
                        "blockType": block.get("blockType"),
                    }
                )
            extracted[key] = payload

    unmatched: list[dict] = []
    for item in blocks:
        key = (item["blockSet"], item["path"])
        payload = extracted.get(key)
        if payload is None:
            item["blockValues"] = {}
            item["blockInputs"] = []
            item["blockOutputs"] = []
            unmatched.append(
                {
                    "blockSet": item["blockSet"],
                    "path": item["path"],
                    "blockType": item["blockType"],
                    "blockNameEN": item["blockNameEN"],
                }
            )
            continue

        item["blockValues"] = payload["blockValues"]
        item["blockInputs"] = payload["blockInputs"]
        item["blockOutputs"] = payload["blockOutputs"]

    BLOCKS_PATH.write_text(
        json.dumps(blocks, ensure_ascii=False, indent=4) + "\n",
        encoding="utf-8",
    )

    summary = {
        "blocks_total": len(blocks),
        "matched_total": len(extracted),
        "unmatched_total": len(unmatched),
        "duplicate_payloads_total": len(duplicates),
        "unmatched": unmatched,
        "duplicate_payloads": duplicates,
    }
    SUMMARY_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Updated: {BLOCKS_PATH}")
    print(f"Matched blocks: {len(extracted)}")
    print(f"Unmatched blocks: {len(unmatched)}")
    print(f"Summary: {SUMMARY_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
