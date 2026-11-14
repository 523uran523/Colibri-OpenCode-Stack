"""Проверка патча Colibri v2.1.0: recovery bare Qwen tool-call.

Наш int4-чекпойнт Qwen3-Coder выдаёт вызов без открывающего <tool_call>,
но с закрывающим </tool_call>. Штатный parse_qwen_tool_calls терял его как текст.
Патч (openai_server.py, recovery-ветка L2944) игнорирует остаток </tool_call>.

Запуск:
    py -3 tools\test_qwen_parse.py
Ожидается: 3/3 PASS. Если Colibri обновился и патч пропал — первый тест упадёт.
"""
import json
import os
import sys

RUNTIME = os.environ.get(
    "COLIBRI_RUNTIME",
    os.path.join(os.environ.get("LOCALAPPDATA", ""),
                 "colibri", "runtime", "colibri-v2.1.0"),
)
sys.path.insert(0, RUNTIME)

import openai_server as s  # noqa: E402

TOOLS = [{
    "type": "function",
    "function": {
        "name": "write",
        "description": "Write text content to a file at the given path",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
            "required": ["path", "content"],
        },
    },
}]

BARE = ("<function=write>\n<parameter=path>\ntest_qwen.py\n</parameter>\n"
        "<parameter=content>\ndef add(a, b):\n    return a + b\n</parameter>\n"
        "</function>\n</tool_call>")

FULL = ("<tool_call>\n<function=write>\n<parameter=path>\ntest_qwen.py\n</parameter>\n"
        "<parameter=content>\ndef add(a, b):\n    return a + b\n</parameter>\n"
        "</function>\n</tool_call>")

PROSE = ("Here is an example:\n<function=write>\n<parameter=path>\nx.py\n</parameter>\n"
         "<parameter=content>\nprint(1)\n</parameter>\n</function>\nThat is all.")


def check(name, reply, want_calls):
    text, calls = s.parse_qwen_tool_calls(reply, TOOLS)
    ok = len(calls) == want_calls
    if ok and want_calls:
        args = json.loads(calls[0]["function"]["arguments"])
        ok = (calls[0]["function"]["name"] == "write"
              and args.get("path") == "test_qwen.py"
              and "def add" in args.get("content", ""))
    if ok and want_calls == 0:
        ok = "<function=" in text  # проза остаётся текстом, не вырезается
    print(("PASS" if ok else "FAIL"), name,
          "| calls:", len(calls), "| text:", repr(text[:60]))
    return ok


def main():
    results = [
        check("bare call with orphan </tool_call>", BARE, 1),
        check("fully wrapped <tool_call> call", FULL, 1),
        check("XML inside prose stays text", PROSE, 0),
    ]
    print(f"{sum(results)}/{len(results)} PASS")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
