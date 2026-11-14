# Colibri-OpenCode-Stack

Полный рабочий стек для локальной ИИ-разработки на слабом железе (AMD Ryzen 7 4800H · 16 ГБ ОЗУ · RTX 3050 Ti, 4 ГБ VRAM):

```
OpenCode (клиент)  --http-->  tools/colibri_proxy.py (порт 8001)  --http-->  Colibri serve (порт 8000)  -->  Qwen3-Coder-30B-A3B (int4, CUDA)
```

Стек умеет **tool-calling** (Qwen3-Coder выдаёт XML-вызовы, Colibri парсит их нативно), и целевой юзкейс — связка «Архитектор–Исполнитель»: сильная внешняя модель планирует макро-шаги, локальная Qwen пишет файлы.

## Состав

| Путь | Что внутри |
|---|---|
| `configs/opencode.json` | Провайдер `colibri-local` (baseURL `http://127.0.0.1:8001/v1`, таймауты 30 мин), агенты `qwen` / `parable` / `olmoe` |
| `scripts/` | `Start_All.bat` (один клик: сервер + прокси), `Start_Qwen_Server.bat`, `Start_Parable_Server.bat`, `Start_OLMoE.bat`, `Stop_Colibri.bat` |
| `tools/colibri_proxy.py` | Прокси OpenCode → Colibri: вырезает `stream_options`, `max_completion_tokens` → `max_tokens` (cap 1024 toolless / 4096 остальные), **фильтрует `tools` по allowlist** (`KEEP_TOOLS`), пишет JSONL-лог в `logs/proxy-requests.jsonl` |
| `tools/bench_qwen.py` | Замер префилла/декода (cap 40: 13 tools → 706,8 с; 3 tools → 488,2 с) |
| `tools/test_qwen_parse.py` | Проверка локального патча парсера Qwen tool-calls в Colibri (int4 без `<tool_call>`: 3/3 PASS) |
| `docs/README-SETUP.md` | Инсталляция, запуск, откат cap/ctx, известные грабли |
| `docs/AGENT_SKILL.md` | **«Скилл»-инструкция для макро-шагов** — мастер-промпт для работы с локальной моделью как с агентом-исполнителем |

## Скилл: `docs/AGENT_SKILL.md`

Инструкция для внешней ИИ (Архитектора): как ставить макро-шаги локальной Qwen3-Coder — крупными, целыми файлами за один ход, с исчерпывающим контекстом в одном сообщении, с `/clear` между новыми файлами и без попыток генерировать бинарники. Отсчёт по железу: один тяжёлый ход ≈ 10 минут, потолок `--ctx 16384`.

## Статус (2026-11-14)

- ✅ Tool-calling Qwen3-Coder-30B доказан end-to-end (агент `qwen` создаёт `index.html`, `style.css`, `config.json` автономно)
- ✅ Прокси-фильтрация каталога: основной запрос 1109 с → ~600–690 с на ход (−35…−40 % на ход)
- ✅ Патч парсера Colibri v2.1.0 для int4 (recovery без `<tool_call>`): `finish_reason: "tool_calls"`
- ✅ cap 40 (~254 мс/токен экспертов), ctx 16384, RTX 3050 Ti

## Быстрый старт

**Один клик:** ярлык **«Local AI Coder»** на рабочем столе (TargetPath — рабочая копия `Start_All.bat` в корне папки стека, `...\calibri\Start_All.bat`). Батник сам `cd` в корень стека, так что его расположение неважно. Последовательность: окно Colibri-сервера (модель грузится) → пауза 60 с → окно прокси (8001). После этого можно открывать OpenCode с агентом `qwen`.

Батник ASCII-only и сам резолвит папку «Документы» (`[Environment]::GetFolderPath('MyDocuments')`), поэтому не ломается на кириллических путях. Если стек лежит не в `...\OneDrive\Документы\calibri` — поменяйте имя папки в строке `if not exist "%DOCS%\calibri"`.

**Вручную (или на другой машине):**

1. `scripts\Start_Qwen_Server.bat` — Colibri + Qwen3-Coder-30B-A3B (CUDA, ctx 16384, cap по умолчанию).
2. `py -3 tools\colibri_proxy.py --log logs\proxy-requests.jsonl` — прокси 8001 → 8000 (у скрипта дефолты `--listen 8001 --upstream-host 127.0.0.1 --upstream-port 8000`; аргумент `--log` **обязателен** — без него скрипт не стартует).
3. OpenCode: провайдер `colibri-local` → порт 8001 (см. `configs/opencode.json`).

Полная инструкция, отладка и откат cap/ctx: `docs/README-SETUP.md`.

## Внешние зависимости

Colibri v2.1.0 (локальный форк с патчем Qwen-парсера): `%LOCALAPPDATA%\colibri\runtime\colibri-v2.1.0\`. При обновлении Colibri патч слетает — проверять `py -3 tools\test_qwen_parse.py`.
