# Agent Lite — Tester Mode: прогресс

**Дата:** 2026-11-15/16. Стек: Windows 11, Node 24, движок `coli serve` (Qwen3-Coder-30B-A3B int4, mmap, ~2.9 ГБ RAM свободно, Memory Compression 6 ГБ). Код на момент тестов: коммит 239e7b5 + `--queue-timeout 900`.

## Фаза 1 — Экстренное восстановление режима «Чат»
- [x] Проверить процессы и порты (3081/8000/8001/8002) — были живы, но engine starved; убиты зомби 11560/24940/17200/13996/16072, рестарт: сервер PID 5748, engine PID 21364, proxy PID 8792
- [x] Проверить логи — корень: 300s wall-таймаут → abort → `fetch failed`; проба /v1/models каждые 15с спамила движок (теперь skip при requests.size>0)
- [x] Перезапустить сервер с актуальным кодом (async proxy spawn + gzip + probe-fix), engine/start → state=running
- [x] Проверить чат через /api/chat — HTTP 200 за 15.2с, reply "Привет!", SSE heartbeat `: ping`
- [x] Chat без tools: proxy note `max_tokens capped:4096` (без tools-записи), in_bytes=380

## Фаза 2 — Регрессионный тест навыков
Рабочая папка: `C:\Users\523ur\OneDrive\Документы\MeWeb\test_env` (baseline commit; package.json — копия; настоящий package.json не тронут)

| Навык | Ожидаемое действие | Фактически вызвала | Успех/Провал |
|---|---|---|---|
| create-file | write test_env/test_skill_1.txt | `write` {"path":"test_env/test_skill_1.txt","content":"Hello from create-file"} → файл на диске, содержимое верно | **УСПЕХ** |
| run-command | bash `node --version` | `bash` {"command":"node --version"} → `v26.13.0` | **УСПЕХ** |
| read-chunked | read MeWeb/package.json limit=5 | `read` limit:5 (1) + offset:5 limit:5 (2) + offset:10 limit:5 (3); дочитала весь 10-строчный файл вместо первых 5 строк | **ЧАСТИЧНО** (limit соблюдён, стоп-условия не было) — SKILL.md усилен п.6 |
| edit-by-anchor | grep якорь → edit | `grep` "Hello from create-file" → `edit` old→new; файл = "Hello from edit-by-anchor"; файл целиком не читала | **УСПЕХ** |
| git-commit | git add+commit в test_env | `bash` `cd test_env && git add test_skill_1.txt && git commit -m "Test commit from Qwen"` → commit 11655da, stat +1 строка | **УСПЕХ** |
| search-replace | grep+edit package.json | `grep` `"name"` → `edit` "yurev-portfolio"→"test-skill-replace" (копия в test_env), на диске верно | **УСПЕХ** |
| refactor-function | grep → edit refactor_me.js | `grep` "function calc" → `edit` (calc→computeTotal); затем транспорт движка разорван на ~325 с (`upstream error: Cannot write to closing transport`, out_bytes=0). Rounds: 284/21/285/296/37 с OK, финальный — 325 с FAIL. Export `{ calc }` дочинен вручную → `{ computeTotal }` | **ПРОВАЛ (инфраструктура, НЕ поведение модели)**: стена coli serve ~300 с. `--queue-timeout 900` не снял (флаг не тот). SKILL.md переписи не требует — модель следовала ему верно |

Итого: 5 УСПЕХ, 1 ЧАСТИЧНО, 1 ПРОВАЛ (инфра). Все 7 прогнаны end-to-end через /api/chat (agent mode) и проверены на диске/git.

## Фаза 3 — Отчёт
- [x] Таблица заполнена (выше)
- [x] SKILL.md усилены точечно: read-chunked — п.6 «прочитал ровно столько, сколько просили — СТОП, без запроса не дочитывай». refactor-function — переписи не требует (провал из-за дедлайна движка, не инструкций). Остальные 5 навыков отработали по коротким SKILL.md — оставляем короткими.
- [x] Ключевая находка: agent-round на этом железе ≈ 270–300 с; всё, что дольше ~300 с, рвёт coli serve (`request read deadline exceeded`). Большие многораундовые задачи нестабильны независимо от промпта — лечится только железом/настройкой движка (вне CLI-флагов).
- [x] Финальный рестарт + проверка: health 200, engine state=running (новые PID), /api/chat (mode=chat) HTTP 200, done-фрейм с ответом, tools пуст

## UI v10 (реалтайм-таймеры; по запросу пользователя) — готово и проверено в браузере
- [x] Глобальный таймер #thinking убран (HTML + все ссылки в app.js)
- [x] Пузырь агента: спиннер + «Работает…» + тикающий MM:SS; на done — «Заняло: MM:SS» серым справа внизу; отправка включена
- [x] Лимит раундов 8 → 15 (server.mjs), текст ошибки обновлён; node --check ОК (server.mjs и app.js)
- [x] Живая проверка в браузере (Agent Lite, вкладка из приложения): консоль чистая; скриншот в процессе — пузырь со спиннером и «00:09»; после done — «… test-skill-replace» + «Заняло: 05:05»; аккордеон с карточкой read (limit:5) раскрывается по клику

## Шаг 4 — Финализация
- [x] Checkpoint-коммит 239e7b5 (v9: аккордеон, автозапуск, gzip, async-прокси, probe-skip, queue-timeout 900)
- [x] README.md: секция «Что нового в UI v9–v10», «до 8 раундов» → 15
- [x] Финальный коммит в AgentLite (UI v10 + read-chunked п.6 + README)
- [x] Синк tools/colibri_proxy.py → Colibri-OpenCode-Stack (коммит 541a808, push в origin/main: 4e7b4af..541a808)

## Шаг 5 — Флаги движка + чистый рестарт + финальная перепроверка
- [x] `resources/web/server.mjs` и `scripts/Start_Qwen_Server.bat` синхронизированы (обе копии: AgentLite и Colibri-OpenCode-Stack/AgentLite): движок стартует с `--topp 0.7`, env `COLI_SPEC=1`, `PILOT=1`; `node --check` ОК на обеих копиях server.mjs
- [x] Чистый рестарт стека: убиты старые PID (3081/8000/8001), `Start-AgentLite.cmd`, engine state=running; в логе движка `pilot=1`, CUDA VRAM tier активен, `/health` 200
- [x] `/api/chat` (mode=chat): HTTP 200, done-фрейм с ответом, `tool_events: []`, `total_rounds: 1`; SSE heartbeat `: ping`
- [x] Замер: один раунд ≈ 275 с — стена ~300 с НЕ сняла (флаги качества/prefetch, а не дедлайн); честно фиксируем без заявлений о выигрыше
