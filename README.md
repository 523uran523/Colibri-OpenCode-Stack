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
| `scripts/` | `Start_Qwen_Server.bat`, `Start_Parable_Server.bat`, `Start_OLMoE.bat`, `Stop_Colibri.bat` |
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

См. `docs/README-SETUP.md`. Кратко: запустить `scripts\Start_Qwen_Server.bat`, поднять прокси (`py -3 tools\colibri_proxy.py --listen 8001 --upstream-host 127.0.0.1 --upstream-port 8000 --log logs\proxy-requests.jsonl`), в `configs/opencode.json` указан провайдер `colibri-local` → порт 8001.

## Внешние зависимости

Colibri v2.1.0 (локальный форк с патчем Qwen-парсера): `%LOCALAPPDATA%\colibri\runtime\colibri-v2.1.0\`. При обновлении Colibri патч слетает — проверять `py -3 tools\test_qwen_parse.py`.
