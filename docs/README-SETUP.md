# Colibri + OpenCode: как запускать

Всё лежит в этой папке. Ниже — что установлено и чем пользоваться.

## Состояние на 2026-11-14

| Компонент | Где |
|---|---|
| OpenCode CLI v2.3.0 (desktop) | глобально, `opencode` (`%APPDATA%\npm\...\opencode.exe`) |
| Colibri runtime v2.1.0 + CUDA 12 | `%LOCALAPPDATA%\colibri\runtime\colibri-v2.1.0\` |
| Parable-Qwen3-4B (Claude-Fable-5, Q4_K_M) | `G:\models\parable-qwen3-4b\` (тест цепочки OpenCode → Colibri → CUDA) |
| Qwen3-Coder-30B-A3B (целевая модель) | `G:\models\qwen3-coder-30b\` (скачана, манифест проверен: 18,06 ГБ safetensors) |
| Конфиг OpenCode | `opencode.json` / `opencode.jsonc` здесь и копия в `%USERPROFILE%\.config\opencode\` |
| Прокси совместимости OpenCode → Colibri | `tools\colibri_proxy.py` (порт 8001) |

GPU: NVIDIA GeForce RTX 3050 Ti Laptop, 4,3 ГБ VRAM, sm_86. Модели и кэш — на диске `G:`.

## Как это работает

```
OpenCode  --(http://127.0.0.1:8001)-->  colibri_proxy.py  --(http://127.0.0.1:8000)-->  coli serve (qwen36, CUDA)
```

Прокси обязателен, потому что OpenCode шлёт тело, которое Colibri плохо переваривает:

- массив `tools` (~15,6 тыс. симв., 13 инструментов) — рендерится движком в промпт: 6432 токена вместо 2557;
- `max_completion_tokens` — Colibri его **не понимает** и ставит лимит генерации = весь контекст;
- `stream_options` — на streaming ни на что не влияет, но прокси его заодно вырезает;
- body из файла с BOM (`Out-File -Encoding utf8`) — прокси проглатывает utf-8-sig.

Что делает прокси с каждым запросом: толерантен к BOM (utf-8-sig), вырезает `stream_options`,
мапит `max_completion_tokens` → `max_tokens` (cap 1024 для toolless-модели `parable-qwen3-4b`,
cap 4096 для остальных). `tools` вырезаются **только для `parable-qwen3-4b`**; tool-модели
(`qwen3-coder-30b-a3b-colibri`, агент `qwen`) получают рабочую подборку из 6 инструментов —
`write, read, list, edit, bash, grep` (allowlist `KEEP_TOOLS` в самом прокси; каталог фильтруется
по телу запроса, потому что OpenCode V2 поле `tools` в конфиге игнорирует — оно объявлено legacy). Все решения пишутся в
`logs\proxy-requests.jsonl` (`note`, включая `model=`).
Без прокси (`stream: true`, полный контекст 12288, KV на CPU) тот же запрос шёл ~520 с при 0 % GPU.

### Измерено (2026-11-14, cap 40, ctx 16384)

Прогон `tools\bench_qwen.py` (фиксированный промпт 27 162 симв., 13 реальных имён инструментов в теле):

| Каталог на проводе | total_s |
|---|---|
| 13 tools (до фильтра) | 706,80 |
| 3 tools (`write,read,list`, после фильтра) | **488,15** (≈ −219 с, −31 %) |

Живой одиночный ход OpenCode (`"Reply with exactly: hello"`): основной запрос
`tools:2/… kept`, 26 655 Б in, 483,3 с (ранее на 13 tools многohодовый основной запрос
шёл 1109 с). Сокращение каталога даёт главный выигрыш именно на префилле; декод не ускоряется.

### Реальный прогон site2 (6-allowlist, 2026-11-14 20:10→21:04, exit=0)

`tools\run-site2-test.ps1` → `site2\` созданы все 4 файла (`index.html` 265 Б, `style.css` 62 Б,
`config.json` 50 Б с правильным JSON, `assets\img.png` 96 Б — **внимание: это base64-текст
PNG, не бинарник**; для бинарного файла нужен bash+base64-декод).
Прокси зафиксировал 6 запросов: title 72,5 с + 5 основных ходов 683,7 / 602,0 / 622,1 / 638,8 /
686,8 с. В каждом основном запросе OpenCode присылал 13 инструментов, прокси оставлял 4
(`edit,grep,read,write` — `bash/list` OpenCode в этом сеансе не присылал вообще).
Итого wall-clock ≈ 54 мин — столько же, сколько 13-tool прогон `site\` (3 тяжёлых + 3 лёгких хода):
экономия 35–40 % **на ход** съелась на том, что модель сделала 5 тяжёлых ходов вместо 3.
Вывод: дальше ускорять надо историю диалога и системный промпт, а не только каталог tools.

## Почему ctx = 4096

На карте 4,3 ГБ VRAM. CUDA-trunk Parable (1,89 ГБ) + lm_head (0,30 ГБ) занимают ~2,24 ГБ;
allowance движка на dev 0 — 2,2 ГБ, остаётся 0,03 ГБ. float16 KV-кэш не влезал → он жил на CPU →
префилл шёл по CPU, GPU = 0 % util, 6432 токена ≈ 9 минут (52–520 с).

При `--ctx 4096`: KV ≈ 0,56 ГБ помещается рядом с trunk → префилл на GPU (util ~76 % в фазе
`reading`), тот же OpenCode-промпт (без tools — 2557 токенов) обрабатывается за **~76 с**,
`prompt_tokens=2557`, `completion_tokens` ~130, `finish_reason=stop`.

Внимание: промпт OpenCode с tools (6432 токена) в ctx 4096 **не влезает** (HTTP 400
`context_length_exceeded`) — именно поэтому прокси и ctx 4096 идут вместе. Свои лимиты в
`opencode.json` (`limit.context=4096`, `limit.output=1024`) синхронизированы с движком.

Если нужно больше контекста: поднимайте `--ctx` (например, 8192), но KV-кэш снова уедет на
CPU (2,24 + 1,13 = 3,37 ГБ > 3,2 ГБ свободных) — префилл резко замедлится. Альтернатива —
`--vram 4` (бюджет VRAM в ГБ), но на 4,3 ГБ-карте резервов почти нет.

## Батники

| Файл | Что делает |
|---|---|
| `Start_Parable_Server.bat` | сервер Parable-Qwen3-4B на `http://127.0.0.1:8000/v1`, CUDA, `--ctx 4096` |
| `Start_Qwen_Server.bat` | сервер Qwen3-Coder-30B на `http://127.0.0.1:8000/v1` (см. ниже про скачивание) |
| `Stop_Colibri.bat` | останавливает запущенный сервер Colibri (порт 8000) |

Прокси руками: `py -3 tools\colibri_proxy.py --listen 8001 --upstream-host 127.0.0.1 --upstream-port 8000 --log logs\proxy-requests.jsonl`
(должен работать всегда, когда OpenCode ходит в Colibri; в `opencode.json` `baseURL` уже указывает на 8001).

## OpenCode

Модель по умолчанию: `colibri-local/parable-qwen3-4b`, агент `parable`
(`temperature: 0.1`, `top_p: 0.8`, без инструментов — `capabilities.tools: false`;
OpenCode всё равно пришлёт tools, их обрежет прокси).

Из этой папки:

```bat
opencode
```

Проверка без интерфейса (сервер на 8000 и прокси на 8001 должны быть уже запущены):

```bat
opencode run --standalone --agent parable --model colibri-local/parable-qwen3-4b --auto "Write a bubble sort function in Python."
```

## Qwen3-Coder-30B-A3B (целевая модель)

Скачивание уже идёт в `models\qwen3-coder-30b\` (хард-фон, resume поддерживается):

```bat
py -3 coli setup --model qwen3-coder-30b --dir models --backend cpu --no-browser --no-start --yes
```

Когда скачается: проверить манифест `.colibri-download.json` (`py -3 tools\verify_qwen_download.py`,
0 mismatches + `complete: true` + нет `.part`), переложить модель в `G:\models\qwen3-coder-30b`,
затем `Start_Qwen_Server.bat` (CUDA: `COLI_CUDA=1`, `CUDA_DENSE=1`, `CUDA_EXPERT_GB=3`,
`HEAT_FILE=G:\colibri_cache\qwen.heat`, `--cap 40`, `--model-id qwen3-coder-30b-a3b-colibri`).
Агент `qwen` в `opencode.json`: `temperature: 0.1`, `top_p: 0.8`.

**Tool-calling `qwen3_coder` (проверить при запуске):** Colibri v2.1.0 (`openai_server.py`)
имеет **нативный** парсер Qwen tool-calls — `parse_qwen_tool_calls` (ветка
`chat_flavor() in ("qwen36","qwen38","qwen3_coder","lfm3")` в `parse_arch_tool_calls`).
Клиенту (OpenCode/прокси) ничего конвертировать не нужно: прокси шлёт `tools` в стандартном
OpenAI JSON, Colibri сам рендерит их в `# Tools`-промпт (XML-ish: `<function=NAME>` /
`<parameter=KEY>value</parameter>`), а ответ парсит обратно в `tool_calls`.

**Баг Colibri v2.1.0 (исправлен локально 2026-11-14):** наш int4-чекпойнт выдаёт вызов
**без открывающего `<tool_call>`**, но с закрывающим `</tool_call>`. Штатная recovery-ветка
`parse_qwen_tool_calls` (L2944) требовала, чтобы после удаления `<function=...>` не осталось
ничего — остаток `</tool_call>` ломал проверку, и вызов уходил клиенту как текст
(`[api] qwen tool markers present but no call parsed`). Патч: остаток `</tool_call>`
игнорируется в проверке и вырезается из recovered-текста; бэкап —
`openai_server.py.bak-20261114` рядом с файлом. После патча и JSON-, и SSE-ответ отдают
`tool_calls` + `finish_reason: "tool_calls"`. **При обновлении Colibri патч пропадёт** —
проверять `py -3 tools\test_qwen_parse.py`.

KV-кэш fp16 = 96 КБ/токен (48 слоёв × 4 KV-головы
× 128 dim × 2 Б): ctx 4096 → 0,38 ГБ, ctx 8192 → 0,75 ГБ, ctx 16384 → 1,5 ГБ. Карта 4,3 ГБ, а
`CUDA_EXPERT_GB=3` уже резервирует 3 ГБ под экспертов — при 16384 KV может не влезть рядом с trunk.
Симптомы переполнения — те же, что и при молчаливой смерти: GPU 0 % в фазе `reading` (KV уехал на CPU)
или аварийный выход без traceback. Лестница отката (батник читает env):

```bat
set COLI_CTX=8192   && Start_Qwen_Server.bat   REM если 16384 не взлетел
set COLI_CTX=4096   && Start_Qwen_Server.bat   REM последний вариант
```

Важно: при откате лимит qwen в `opencode.json` (`limit.context=8192`) не должен превышать
`COLI_CTX` сервера. При 4096 обязательно синхронно поправить `limit.context=4096`
(в project + user + jsonc), иначе OpenCode получит HTTP 400 `context_length_exceeded`.

За размещением KV следить по логу запуска (`[qtier] dev 0: ... free, allowance ...`) и по `/health`
(поля `kv_slots`, `live[].state`).

Замечания: закачка — 19,4 ГБ, идёт медленно (часы) и **умирает при рестартах OpenCode desktop-сервиса**;
запускать только хард-фоном и не трогать (`taskkill`) посторонние PID.

## Проверка API вручную

```bat
curl.exe http://127.0.0.1:8001/v1/health   REM прокси
curl.exe http://127.0.0.1:8000/health      REM движок
curl.exe http://127.0.0.1:8001/v1/models
```

`state` движка: `reading` (префилл) → `writing` (генерация). `tok_s` считается только по генерации.

## Известные грабли

- Один сервер на порт 8000. Переключение моделей: `coli stop` (или батник) — стартует новый сам.
- `stream: false` в теле → Colibri не знает `max_completion_tokens` и генерирует до упора контекста:
  первый байт не придёт никогда. OpenCode всегда шлёт `stream: true` — так работает.
- OpenCode (standalone CLI) шлёт **два** запроса на turn: title (~2 КБ, без tools) и основной (~26 КБ).
  Оба идут через прокси.
- Prefix-кэш: повторные одинаковые промпты считаются быстрее (`HEAT_FILE` на `G:`).
- PowerShell: `--data-binary` больших тел из переменной рвёт JSON — сохранять в файл
  (`[IO.File]::WriteAllText($path, $body, (New-Object Text.UTF8Encoding($false)))`, без BOM).
- Движок один раз молча умер между прогонами (порт освободился, VRAM обнулилась, в логах и
  журнале Windows тишина — причина не установлена: нет crash-дампов, Application Error, TDR
  nvlddmkm, BugCheck; OOM не подтверждён, но RAM машины 15,4 ГБ, а qwen36 ест ~3,3 ГБ).
  Защита в два слоя:
  1) `coli serve` сам перезапускает движок (проверено: kill qwen36 → подъём за ~2 с, в `/health`
     поле `engine_restarts`);
  2) `tools\server-watch.ps1` — сторож по порту 8000, сейчас ВЫКЛЮЧЕН (файла
     `tools\watchdog.enabled` нет). Чтобы включить — создайте флаг. Обязательно отключать перед
     ручной сменой модели: сторож перезапускает именно Parable-батник, поэтому при работе с Qwen
     он поднимет не тот сервер. `.ps1` на кириллическом пути сохранять с BOM — иначе
     PowerShell 5.1 рвёт путь.
- `coli serve` не имеет флага read-timeout: таймаут держит только очередь (`--queue-timeout`, 300 с).
- Движок однопоточный (`capacity: 1`): зависший запрос блокирует всё (429). Лечение: `coli stop` + рестарт.
- **`G:` и `cmd /c` из PowerShell**: `if exist "G:\..."` в батнике, запущенном как `cmd /c` из PowerShell,
  может дать NOT-FOUND, хотя файл есть (current-drive не G:). Поэтому `Start_Qwen_Server.bat` теперь
  делает `pushd %COLI_MODEL_DRIVE%` и все пути идут через `COLI_MODEL_DRIVE` (default `G:`).
- **Прокси живёт отдельно от сервера**: при рестарте OpenCode desktop-сервиса прокси на 8001 умирает —
  после каждого рестарта проверять `Get-NetTCPConnection -LocalPort 8001` и поднимать заново.
- **OpenCode-таймаут и «10 секунд»**: первый полный запрос qwen (промпт 6850 токенов, 13 tools)
  шёл 1809,95 с при лимите 1800 с — OpenCode оборвал его и выбросил уже полученный ответ
  (41 977 байт SSE). Таймауты подняты до 30 мин, но prefill такого промпта ~19 мин, поэтому
  запас нужен и дальше. Радикально помогает только сокращение промпта (меньше tools в агенте)
  либо рост кэша экспертов — не размер ctx.
- **Зависание после отмены**: если клиент уходит во время генерации, Colibri пишет
  `the client left while the engine was generating; cancelling`, но слот может не освободиться
  (наблюдалось 40+ мин: `writing`, `tokens=1`, 100 % CPU/GPU), а новые запросы получают 429
  `Timed out waiting for the inference engine`. Лечение — `coli stop` + рестарт движка.
- **`--cap 64` не влезает в RAM**: при `--cap 32` RSS qwen36 ≈ 7 ГБ (32/128 × 48 слоёв × 3,3 МБ
  + trunk). cap 64 добавит ещё ~5 ГБ и уведёт систему в своп — prefill станет только медленнее.
  `--cap 40` — практический потолок на 15,4 ГБ RAM: chain-статистика ядра ~**254 мс/токен**
  экспертов (против 290–316 при cap 32), decode ~254 мс/токен (против 290–316). При падении в
  своп — откат `--cap 32`.
- **Qwen placement (ctx 16384, COLI_CUDA=1, CUDA_EXPERT_GB=3)**: trunk 1.16 ГБ + lm_head 0.29 ГБ +
  577 экспертов (1.86 ГБ budget) резидентно на GPU = ~2989 MiB VRAM. KV-кэш fp16 96 КБ/токен
  аллоцируется лениво по длине последовательности: короткий промпт ~0.3–0.5 ГБ влезает,
  полный ctx 16384 (1.5 ГБ) — нет. Поэтому длинные диалоги могут уехать на CPU/упасть.
