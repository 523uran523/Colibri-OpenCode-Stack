---
name: engee-model-development
description: "Используй этот skill, когда нужно написать код для автоматизированной разработки модели Engee: создать или загрузить модель, добавить или удалить блоки, линии и подсистемы, настроить параметры модели и блоков, подготовить симуляцию, сохранить `.engee` и, при необходимости, связать код с локальным индексом блоков Engee. Если речь о layered-debugging acausal electrical/physical модели, ведущим skill остаётся `engee-model-debug-physmod-electrical`; для малых отладочных правок он обычно использует прямые команды через `engee-api`, а сюда переходят при крупных структурных изменениях или генерации `.jl`-скрипта."
---

# Engee Model Development

Когда skill активирован:

1. Считай этот skill практическим playbook по написанию Julia-кода для Engee.
2. Если нужно выбрать блок, его путь, `blockType`, параметры или порты, используй skill `engee-blocks` как источник истины.
3. Если нужно именно выполнить код в аккаунте Engee или скачать `.engee`, используй вместе с этим skill ещё и `engee-api`.
4. По умолчанию пиши код так, чтобы он был воспроизводимым, идемпотентным насколько это возможно, и не зависел от ручных действий в UI.
5. Если пользователь не просит запускать код, ограничивайся генерацией или правкой `.jl`-скриптов и связанных артефактов.
6. Если нужно собрать, запустить или отладить модель в Engee, не привязывайся к какой-либо специально выбранной версии пода. Используй текущую версию подключённого Engee; фактическую версию проверь через интерфейс или API.
7. Если задача перешла от обычной сборки модели к диагностике acausal electrical/electromechanical physical model, подключай `engee-model-debug-physmod-electrical` как ведущий playbook отладки. Для малых отладочных изменений сначала предпочитай прямые команды через `engee-api`; этот skill используй, когда нужен `.jl`-скрипт, крупная структурная перестройка, массовое изменение или воспроизводимый reusable patch.

## Что есть в skill

В папке skill лежат:

- `SKILL.md` — инструкция по разработке моделей Engee
- `doc/programmatic-modeling.md` — обзор программного управления моделированием
- `doc/programmatic-modeling-working-with-models.md` — работа с моделями: `create`, `load`, `open`, `save`, `close`, `gcm`, `gcs`
- `doc/programmatic-modeling-editing.md` — редактирование модели: `add_block`, `delete_block`, `copy_block`, `add_line`, `delete_line`, `get_param`, `set_param!`
- `doc/programmatic-modeling-manage-settings.md` — параметры моделирования: `get_param`, `set_param!`, `update_params`
- `doc/programmatic-modeling-simulation.md` — запуск и контроль симуляции: `run`, `pause`, `resume`, `stop`, `get_results`, `get_status`, `get_logs`
- `doc/programmatic-modeling-example.md` — сквозной пример сборки модели программно
- `doc/programmatic-modeling-functions.md` — список и сигнатуры публичных методов `engee`
- `references/model-sine-gain.jl` — переносимый исходный пример сборки модели Sine Wave → Gain и записи результатов; готовые результаты чужого прогона не включены в пакет

## Когда использовать этот skill

Используй skill, если задача связана с любым из пунктов:

- создать новую модель Engee или загрузить существующую
- добавить в модель блоки из библиотеки
- удалить, копировать, переименовывать блоки и содержимое систем
- соединить блоки сигнальными линиями
- настраивать параметры модели, блоков и симуляции
- подготовить модель к сохранению или кодогенерации
- написать batch-скрипт, который собирает модель целиком
- объяснить, как программно устроена разработка модели в Engee

Не используй этот skill как единственный источник для выбора блока из библиотеки. Для поиска блока, его `path`, `blockType`, `blockValues`, `blockInputs`, `blockOutputs` сначала подключай `$engee-blocks`.

Если задача связана с кодогенерацией или нужна совместимость с ограниченным набором поддерживаемых блоков, предпочитай элементарные блоки из поддерживаемой библиотеки и избегай `Engee Function`, если ту же логику можно собрать из `Gain`, `Add`, `Integrator`, `Saturation`, `Memory`, `Unit Delay`, `Abs`, `Product`, `Switch` и других простых блоков.

## Связь с `engee-model-debug-physmod-electrical`

Этот skill отвечает за то, **как программно изменить Engee-модель в виде воспроизводимого кода или крупного patch/rebuild-сценария**: создать модель, загрузить checkpoint, массово добавить или удалить блоки, соединить линии, настроить параметры, запустить симуляцию, собрать логи и сохранить `.engee`.

Переходи к `engee-model-debug-physmod-electrical` или используй его вместе с этим skill, если:

- модель является acausal electrical/electromechanical physical model
- симуляция не стартует, падает на инициализации, становится stiff или даёт только общий `Failed to start simulation`
- нужно отлаживать физическую топологию, `Solver Configuration`, electrical/mechanical references, floating nodes, переключатели, силовую схему, gate/control polarity, алгебраические петли или измерительную обратную связь
- нужна layered-стратегия: smoke-test, checkpoint, гипотеза, короткий прогон, анализ логов, следующий слой
- модель нужно сравнивать с Simulink/reference model по этапам, а не просто собрать заново

При совместном использовании:

1. `engee-model-debug-physmod-electrical` определяет отладочный слой, гипотезу, длительность прогона, критерий прохождения и имя checkpoint.
2. Для небольших правок `engee-api` реализует шаг прямыми командами `/external/command/eval` без генерации и загрузки `.jl`-файла.
3. `engee-model-development` подключается, если изменение стало структурным: много блоков или линий, несколько подсистем, повторяемый rebuild, helper-функции, loops, таблицы параметров или reusable `.jl`-patch.
4. `engee-api` выполняет либо прямые команды, либо сгенерированный скрипт в Engee, если нужен реальный прогон.
5. После каждого результата возвращайся к `engee-model-debug-physmod-electrical`, чтобы решить: принять checkpoint, откатиться, упростить слой или перейти к следующему.

## Источники истины

Для задач по разработке модели используй приоритет такой:

1. `engee-blocks/blocks.json` — чтобы найти блок и получить его библиотечный путь
2. `engee-blocks/doc/md` — чтобы прочитать описание блока и его параметры
3. `doc/programmatic-modeling-functions.md` — чтобы проверить сигнатуру публичного метода `engee`
4. Остальные `doc/programmatic-modeling-*.md` — чтобы понять семантику, ограничения и примеры использования

Если нужно реально выполнить код в облачном Engee, а не только написать его:

1. подготовь `.jl`-скрипт этим skill
2. выполни его через `engee-api`
3. при необходимости скачай итоговый `.engee`

Для сборки, запуска и отладки моделей не выбирай вручную отдельную версию пода и не требуй фиксированного pod/runtime-тега. Работай в текущем подключённом Engee; не закрепляй старую версию или конкретный аккаунт.

Для исходного сквозного примера смотри `references/model-sine-gain.jl`. Перед запуском выбери доступную папку текущего Engee и задай `engee_example_output_dir`; например, уже существующую выбранную папку внутри `/user`. Скрипт создаёт новую модель и файлы только после явного запуска с подтверждением кода. Переносимый пакет содержит исходный пример, а не результаты старого аккаунта.

## Основная модель работы

Обычно работа с Engee-моделью в коде выглядит так:

1. выбрать или создать модель
2. открыть нужную систему
3. добавить или модифицировать блоки
4. соединить линии
5. настроить параметры модели и блоков
6. при необходимости выполнить `engee.arrange_system(engee.gcs())`
7. сохранить модель
8. при необходимости закрыть модель

Базовый шаблон:

```jl
model_name = "MyModel"
save_path = "/user/MyModel.engee"

engee.create(model_name)
engee.open(model_name)

engee.add_block("/Basic/Sources/Sine Wave", model_name * "/Sine Wave")
engee.add_block("/Basic/Sinks/Terminator", model_name * "/Terminator")
engee.add_line("Sine Wave/1", "Terminator/1")

engee.set_param!(model_name, "StopTime" => 10, "FixedStep" => 0.01)
engee.arrange_system(engee.gcs())

engee.save(model_name, save_path; force=true)
engee.close(model_name; force=true)
```

## Работа с моделями

### Создание

Для создания новой модели используй:

```jl
engee.create("model_name")
```

Нюансы:

- имя модели не должно содержать `/`
- `engee.create(...)` делает модель текущей, а её корневую систему — текущей системой
- если модель уже существует в текущей сессии, будет `ModelAlreadyExistsException`

### Загрузка

Для загрузки существующего файла модели:

```jl
engee.load("/user/model_name.engee")
engee.load("/user/model_name.engee"; force=true)
```

Нюансы:

- `force=true` нужен, если модель с таким именем уже загружена в память
- при `force=true` несохранённые изменения ранее загруженной модели теряются
- `load` возвращает `Model`

### Открытие

Для выбора текущей модели или подсистемы:

```jl
engee.open("MyModel")
engee.open("MyModel/Subsystem-1")
engee.open(model)
engee.open(system)
```

Нюансы:

- `engee.gcm()` возвращает текущую модель
- `engee.gcs()` возвращает текущую систему
- `engee.gcb()` полезен для чтения параметров выделенного блока в интерактивной сессии

### Сохранение и закрытие

```jl
engee.save("MyModel", "/user/MyModel.engee"; force=true)
engee.close("MyModel"; force=true)
```

Нюансы:

- `save(...; force=true)` нужен, если файл уже существует
- `close(...; force=true)` закрывает модель, даже если есть несохранённые изменения
- для пакетных сценариев после сохранения полезно закрывать модель, чтобы не оставлять её в памяти между итерациями

## Работа с блоками

### Как выбирать блок

Для добавления блока почти никогда не угадывай путь руками. Делай так:

1. ищи блок в `engee-blocks/blocks.json`
2. бери оттуда `path`
3. используй этот `path` как первый аргумент `engee.add_block`
4. если нужны реальные параметры и порты блока, смотри `blockValues`, `blockInputs`, `blockOutputs`

Пример:

- в `engee-blocks/blocks.json` есть путь `/Basic/Sources/Sine Wave`
- значит код добавления будет `engee.add_block("/Basic/Sources/Sine Wave", "MyModel/Sine Wave")`

### Добавление блока

```jl
engee.add_block(lib_block_path, tgt_block_path)
```

Примеры:

```jl
engee.add_block("/Basic/Math Operations/Add", "newmodel_1/")
engee.add_block("/Basic/Math Operations/Complex to Real-Imag", "newmodel_1/Test_name")
```

Нюансы:

- `lib_block_path` — полный путь до блока в библиотеке или модели
- `tgt_block_path` — путь до системы и желаемое имя блока
- если имя в конце пути не указано, Engee сгенерирует его автоматически как `<block_type>-<index>`
- если путь модели пересекается с названием раздела библиотеки, Engee может выбрать блок из модели, а не из библиотеки
- при добавлении портового блока в подсистему Engee добавляет соответствующий внешний порт
- новые блоки не всегда сразу видны в UI, иногда нужно переоткрыть модель или переключить вкладку

Типовые ошибки:

- `IncorrectBlockNameException`
- `InvalidBlockPathException`
- `SystemIsNotExistException`

### Удаление и копирование блока

```jl
engee.delete_block("MyModel/BlockName")
engee.copy_block("MyModel/BlockName", "MyModel/Subsystem/NewName")
```

Нюансы:

- `delete_block` удаляет сам блок, связанные линии и порты
- `copy_block` копирует существующий блок по новому пути

### Работа с содержимым систем

Если нужно копировать или очищать содержимое подсистем:

```jl
engee.copy_contents("MyModel/SubsystemA", "MyModel/SubsystemB")
engee.delete_contents("MyModel/SubsystemB")
```

Нюанс:

- `copy_contents` требует, чтобы целевая система была пустой

## Соединения и порты

### Добавление линий

Сигнальные линии обычно добавляются так:

```jl
engee.add_line("Sine Wave/1", "Terminator/1")
engee.add_line(engee.gcs(), "Sine Wave/1", "Terminator/1")
```

Также возможна работа через `PortHandle`:

```jl
ports1 = engee.get_ports("MyModel/Sine Wave")
ports2 = engee.get_ports("MyModel/Terminator")
engee.add_line(ports1.outputs[1], ports2.inputs[1])
```

Нюансы:

- для строкового варианта обычно используются порядковые номера портов
- если путь указывает на блок-порт подсистемы, соединяется соответствующий внешний порт системы
- в обычном случае блоки должны находиться в одной системе

Типовые ошибки:

- `SourceEdgeIsNotOutputPort`
- `TargetEgdeIsNotInputPort`
- `TargetEdgeAlreadyConnected`
- `NotAcausalPort`
- `LineCannotBeAdded`

### Удаление линий

```jl
engee.delete_line("Sine Wave/1", "Terminator/1")
engee.delete_line(engee.gcs(), "Sine Wave/1", "Terminator/1")
```

Также можно удалять через объект `Line` или `PortHandle`.

### Логирование сигналов

Если после симуляции нужно получить данные конкретного сигнала через `engee.run(...)` или `engee.get_results(...)`, перед запуском симуляции включай логирование порта:

```jl
engee.set_log("gained_sinus/1")
engee.set_log("MyModel/Subsystem", "gained_sinus/1")
engee.set_log(engee.gcs(), "gained_sinus/1")
```

Практические нюансы:

- без `engee.set_log(...)` полезных записей в результатах может не быть
- удобно логировать выходной порт прямо перед `engee.run(...)`
- в результатах ключ часто выглядит как `<block_name>.<port_index>`, например `gained_sinus.1`
- в некоторых runtime Engee `engee.run(...)` и `engee.get_results(...)` возвращают не обычный `Dict`, а объект `SimulationResult`
- типичное печатное представление может выглядеть так:

```jl
SimulationResult(
    run_id => 3,
    "WS.1" => WorkspaceArray{Float64}("__foc_smoke2/WS.1")
)
```

- поэтому не полагайся вслепую на `keys(results)`, `pairs(results)` и прямую индексацию как у словаря; сначала посмотри `repr("text/plain", results)` или сделай отдельный `eval`, который извлечёт нужные данные в простой текстовый формат
- если в конкретном окружении результат всё же словареподобный, данные можно брать так:

```jl
result_key = first(collect(keys(results)))
df = results[result_key]
times = df.time
values = df.value
```

### Автоупорядочивание

После массового добавления блоков почти всегда полезно делать:

```jl
engee.arrange_system(engee.gcs())
```

Это особенно уместно в batch-сценариях и при сборке каталогов блоков.

## Параметры модели и блоков

### Получение параметров

Для модели:

```jl
engee.get_param("MyModel")
engee.get_param("MyModel", "StopTime")
engee.get_param("MyModel", :StartTime)
```

Для блока:

```jl
engee.get_param("MyModel/Sine Wave")
engee.get_param("MyModel/Sine Wave", "Amplitude")
```

Нюансы:

- `get_param(model)` возвращает `ModelParameters`
- `get_param(block_path)` возвращает параметры блока
- в интерактивной среде полезно смотреть `engee.get_param(engee.gcb())`

### Изменение параметров

Для модели:

```jl
engee.set_param!("MyModel", "SolverName" => "ode45", "StopTime" => 15)
```

Для блока:

```jl
engee.set_param!("MyModel/Sine Wave", "Amplitude" => 2.5)
```

Безопасный паттерн для точечного изменения одного параметра блока:

```jl
sine_params = engee.get_param("MyModel/Sine Wave")
modified_params = copy(sine_params)
modified_params["Amplitude"] = "2.5"
engee.set_param!("MyModel/Sine Wave", pairs(modified_params)...)
```

Этот паттерн особенно полезен, когда не хочется случайно сбросить остальные настройки блока.

### Структуры параметров

Для модели можно получить структуру параметров, изменить поля и затем вернуть их в модель:

```jl
params = engee.get_param("MyModel")
params.FixedStep = 0.05
engee.set_param!("MyModel", "FixedStep" => params["FixedStep"])
```

Практический нюанс:

- воспринимай возвращаемую структуру или словарь как локальную копию параметров
- после изменений явно применяй их обратно через `engee.set_param!`, если нужен предсказуемый код

### Обновление параметров во время симуляции

Если симуляция уже запущена:

```jl
engee.update_params()
engee.update_params("MyModel")
engee.update_params(engee.gcm())
```

Нюансы:

- метод полезен только для уже работающей симуляции
- эквивалентен кнопке обновления модели во время выполнения

## Симуляция

### Запуск

```jl
engee.run()
engee.run("MyModel")
engee.run(engee.gcm(); verbose=true)
```

Нюансы:

- если модель не указана, запускается текущая
- `run` возвращает результаты симуляции
- чтобы результаты действительно были полезны, в модели должна быть настроена запись сигналов

### Пауза, возобновление, остановка

```jl
engee.pause("MyModel")
engee.resume("MyModel")
engee.stop("MyModel")
```

Нюансы:

- `pause` работает только для уже запущенной симуляции
- `resume` возвращает результаты симуляции
- `stop` просто останавливает выполнение

### Результаты и статус

```jl
results = engee.get_results("MyModel")
status = engee.get_status("MyModel")
logs = engee.get_logs()
```

Нюансы:

- `engee.get_logs()` вызывается без имени модели; вызов `engee.get_logs("MyModel")` может падать с `MethodError`
- `get_results` и `run` в реальном runtime могут вернуть `SimulationResult`, а не plain `Dict`
- для диагностики ошибок и предупреждений симуляции сначала вызывай `engee.get_logs()`, а потом уже разбирай результат запуска

## Кодогенерация

Если пользователь просит подготовить пример или кодогенерацию:

```jl
engee.generate_code("/user/newmodel_1.engee", "/user/codegen_dir")
engee.generate_code("/user/newmodel_1.engee", "/user/verilog_dir"; target="verilog")
```

Этот skill может описывать и генерировать такой код, но если задача только про моделирование, кодогенерация обычно вторична.

## Практические паттерны кода

### 1. Простая сборка модели из блоков

```jl
model_name = "SimpleChain"
save_path = "/user/SimpleChain.engee"

engee.create(model_name)
engee.open(model_name)

engee.add_block("/Basic/Sources/Sine Wave", model_name * "/Sine Wave")
engee.add_block("/Basic/Math Operations/Add", model_name * "/Add")
engee.add_block("/Basic/Sinks/Terminator", model_name * "/Terminator")

engee.add_line("Sine Wave/1", "Add/1")
engee.add_line("Add/1", "Terminator/1")
engee.set_log("Add/1")

engee.set_param!(model_name, "StopTime" => 10, "FixedStep" => 0.01)
engee.arrange_system(engee.gcs())
engee.save(model_name, save_path; force=true)
engee.close(model_name; force=true)
```

### 2. Массовое добавление блоков из списка

```jl
model_name = "BasicCatalog"
blocks = [
    ("/Basic/Sources/Sine Wave", model_name * "/Sine Wave"),
    ("/Basic/Sources/Constant", model_name * "/Constant"),
    ("/Basic/Sinks/Terminator", model_name * "/Terminator"),
]

engee.create(model_name)
engee.open(model_name)

for (source_block, target_block) in blocks
    engee.add_block(source_block, target_block)
end

engee.arrange_system(engee.gcs())
engee.save(model_name, "/user/BasicCatalog.engee"; force=true)
engee.close(model_name; force=true)
```

### 3. Идемпотентный batch-паттерн

Если код должен часто перезапускаться:

```jl
model_name = "MyModel"
save_path = "/user/MyModel.engee"

try
    engee.close(model_name; force=true)
catch
end

engee.create(model_name)
engee.open(model_name)

# ... build model ...

engee.arrange_system(engee.gcs())
engee.save(model_name, save_path; force=true)
engee.close(model_name; force=true)
```

Этот шаблон полезен, когда в сессии уже могла остаться модель с тем же именем.

### 4. Сборка модели с выгрузкой результатов

Если задача не только собрать модель, но и сразу получить результаты симуляции в файл, удобен такой паттерн:

```jl
model_name = "codex_test"
remote_dir = engee_example_output_dir # Выбранная доступная папка текущего Engee внутри /user
model_path = joinpath(remote_dir, "codex_test.engee")
results_path = joinpath(remote_dir, "codex_test_gained_sinus.csv")

try
    engee.close(model_name; force=true)
catch
end

engee.create(model_name)
engee.open(model_name)

engee.add_block("/Basic/Sources/Sine Wave", model_name * "/sinus")
engee.add_block("/Basic/Math Operations/Gain", model_name * "/gained_sinus")
engee.add_block("/Basic/Sinks/Terminator", model_name * "/terminator")

engee.set_param!(model_name * "/sinus", "Amplitude" => 10.0, "Frequency" => 40 * pi, "Phase" => 0.0)
engee.set_param!(model_name * "/gained_sinus", "Gain" => 2 * pi)

engee.add_line("sinus/1", "gained_sinus/1")
engee.add_line("gained_sinus/1", "terminator/1")
engee.set_log("gained_sinus/1")

engee.arrange_system(engee.gcs())
engee.save(model_name, model_path; force=true)

results = engee.run(model_name)
result_key = first(collect(keys(results)))
df = results[result_key]
```

Практически подтверждённый нюанс:

- для блока `Sine Wave` параметр `Frequency` задаётся в `rad/sec`, поэтому для 20 Гц нужно передавать `40 * pi`, а не `20`

### 5a. Открытый контур физической части как smoke-test

Если строишь электромеханическую модель, сначала полезно собрать минимальный открытый контур и убедиться, что он вообще стартует:

- `Programmable Voltage Source (Three-Phase)`
- `Induction Machine Squirrel Cage`
- `Grounded Neutral (Three-Phase)`
- `Electrical Reference`
- `Solver Configuration`
- `Mechanical Rotational Reference`
- `Torque Source`
- простые `Constant` на управляющие входы

Такой smoke-test уже был подтверждён успешным запуском и хорошо отделяет ошибки физической схемы от ошибок контроллера.

### 5b. Замкнутый контур отлаживай по слоям

Практически подтверждённый порядок:

1. сначала добейся запуска физической части в открытом контуре
2. затем подключай измерения
3. потом добавляй регуляторы по одному
4. только после этого замыкай обратные связи

Если сразу собирать полный FOC-контур, ошибка часто проявляется уже на старте симуляции, и локализовать её сложнее.

### 5. Переносимый сквозной пример

В `references/model-sine-gain.jl` сохранён исходный сценарий Sine Wave → Gain → Terminator с `engee.set_log(...)`, запуском симуляции и записью CSV. Он помогает проверить структуру Julia-скрипта и привязку результатов к текущей модели.

Перед выполнением явно задай `engee_example_output_dir` как существующую доступную папку в подключённом Engee. Скрипт использует новое имя модели, не закрывает существующие модели и не устанавливает библиотеки. Запуск может создавать файлы; сначала просмотри и подтверди точный код. После запуска оцени фактический результат: пакет не выдаёт старые тестовые результаты за новый успешный прогон.

## Как связывать этот skill с `engee-blocks`

Если пользователь просит добавить в модель конкретный блок:

1. открой `engee-blocks/blocks.json`
2. найди блок по имени или `blockSet`
3. возьми `path` как первый аргумент `engee.add_block`
4. возьми `blockNameEN` для имени целевого блока
5. если нужны параметры, порты и ожидаемые поля, смотри `blockValues`, `blockInputs`, `blockOutputs`
6. если нужен человеческий контекст или смысл параметров, открой описание блока в `engee-blocks/doc/md`

Если пользователь просит собрать модель со всеми блоками библиотеки:

1. смотри `engee-blocks/all_blocks/add_blocks/*.jl` как референс массовой сборки
2. при необходимости используй `engee-blocks/all_blocks/models/*.engee` как уже собранный артефакт

## Чего ожидать от агента при использовании этого skill

Когда этот skill активен, агент должен:

- писать рабочий Julia-код под Engee, а не абстрактный псевдокод
- проверять сигнатуры методов по `doc/programmatic-modeling-functions.md`
- не выдумывать пути библиотечных блоков, а брать их из `engee-blocks`
- сохранять модели в `.engee`, если задача этого требует
- использовать `force=true` там, где это оправдано пакетным сценарием
- добавлять `engee.arrange_system(engee.gcs())` после массовой сборки, если нужно читаемое расположение блоков
- учитывать, что локально Engee-среды может не быть, и тогда ограничиваться генерацией скриптов

## Ограничения и частые нюансы

- не все изменения сразу визуально появляются в UI, иногда нужно переоткрытие модели
- `add_block` чувствителен к корректности библиотечного пути
- автоматические имена блоков могут меняться между запусками, если полагаться на автонаименование
- для устойчивых скриптов лучше задавать имена явно
- `get_results` полезен только если модель действительно пишет сигналы в результаты
- для получения результата конкретной линии обычно нужно заранее вызвать `engee.set_log("BlockName/port")`
- у блока `Sine Wave` частота задаётся в `rad/sec`, а не в Гц
- если нужен быстрый старт без чтения всей документации, первым делом смотри `references/model-sine-gain.jl`
- при пакетной обработке важно закрывать модели или использовать `load(...; force=true)`
- сборку и отладку моделей выполняй в текущем подключённом Engee; фактическую версию проверяй через интерфейс или API
- если меняется параметр блока, который влияет на количество портов или внутреннее состояние, Engee может перестроить блок
- в physical modeling для каждой связной физической подсистемы должен быть ровно один `Solver Configuration`; без него симуляция падает с ошибкой вида `There must be one and only one Solver Configuration in subsystem`
- для `Programmable Voltage Source (Three-Phase)` важно различать домены портов: трёхфазный `port` принадлежит домену `AcausalElectricPowerSystems.ThreePhasePort`, а вывод `n` принадлежит фундаментальному электрическому домену `AcausalFoundation.Electrical.Pin`
- из этого следует, что `Solver Configuration` нельзя соединять с `Grounded Neutral (Three-Phase)` напрямую; корректный паттерн: трёхфазный `port` идёт в сеть/машину, а `n` источника и `Solver Configuration` подключаются к `Electrical Reference`
- `Grounded Neutral (Three-Phase)` полезен на трёхфазной стороне сети, но не заменяет `Electrical Reference` для фундаментального электрического пина
- `Induction Machine Measurement` удобнее и надёжнее для обратной связи, чем вручную собранные физические сенсоры; его вход подключается к `measurements_pu_out`, а выходы вроде `Rotor velocity`, `Stator d-axis current`, `Stator q-axis current` приходят в per-unit
- при замыкании обратной связи вокруг машины и контроллера возможна ошибка `Обнаружена петля`; это сигнал об алгебраической петле
- для разрыва прямой алгебраической зависимости полезны `Memory`, `Unit Delay` и поэтапное введение динамики, но даже после их добавления модель нужно перепроверять запуском
- если модель выдаёт только общее `Failed to start simulation`, не доверяй одному сообщению API: сразу снимай `engee.get_logs()` и упрощай схему до последнего работающего слоя

## Рекомендуемый стиль ответа пользователю

Если пользователь просит реализовать модель или изменить существующий скрипт:

1. сначала найди библиотечные пути блоков через `engee-blocks`
2. затем напиши или измени `.jl`-код
3. если окружения Engee нет, прямо скажи, что код не выполнялся
4. если пользователю нужен запуск, переключайся на `engee-api`

Если пользователь просит объяснить, как сделать что-то в Engee:

- отвечай через конкретные методы `engee`
- показывай короткий рабочий фрагмент Julia-кода
- при необходимости указывай, где брать путь блока и параметры
