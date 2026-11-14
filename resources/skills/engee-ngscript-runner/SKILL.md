---
name: engee-ngscript-runner
description: "Запуск и отладка .ngscript файлов в Engee через HTTP API. Использует engee.script.run с правильной настройкой окружения."
---

# Engee ngscript Runner

Скилл для запуска `.ngscript` файлов в Engee runtime через HTTP API.

## Возможности

- Запуск отдельного `.ngscript` файла
- Пакетный запуск нескольких файлов
- Автоматическая настройка Julia-окружения (импорты Engee, Plots, DataFrames, EngeeComms, EngeeDSP)
- Отладка через `engee.script.run` с `isolate=false` для использования общего окружения
- Работа с моделями: загрузка, запуск, получение логов, исправление параметров блоков

## Использование

### Из Python скриптов

```python
from engee_ngscript_runner import EngeeNGScriptRunner

runner = EngeeNGScriptRunner()
runner.setup_environment()
result = runner.run_script("/user/my_projects/Courses/MBD-CM/ngcm_1.ngscript")
```

### Быстрые команды

```bash
# Запуск одного скрипта
python -m engee_ngscript_runner run ngcm_1.ngscript

# Запуск всех в папке
python -m engee_ngscript_runner run-all /user/my_projects/Courses/MBD-CM/

# Исправить пути To CSV (как для ngcm_6)
python -m engee_ngscript_runner fix-csv-paths ngcm6_MIB_5G.engee /user/my_projects/Courses/MBD-CM/
```

## Структура

```
engee-ngscript-runner/
├── SKILL.md              # Этот файл
├── runner.py             # Основной класс EngeeNGScriptRunner
├── cli.py                # CLI интерфейс
└── templates/
    └── env_setup.jl      # Шаблон настройки окружения
```

## Требования

- Настроенный `.env` с `ENGEE_API_KEY`, `ENGEE_USERNAME`, `ENGEE_PASSWORD`
- Доступный Engee инстанс (проверяется через `engee/info`)
- Python с доступом к `engee-api/scripts/engee_oauth`

## Примеры

См. `C:\Users\523ur\Documents\MyProjects\Engee_prj\Scripts\`:
- `run_ngscript.py` — базовый запуск
- `run_all_ngscripts.py` — пакетный запуск
- `fix_to_csv_paths.py` — исправление путей в To CSV блоках
- `debug_ngcm6.py` — диагностика модели