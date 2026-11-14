Source: https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-functions.html

# Публичные методы программного управления

|  |  |
| --- | --- |
|  | Смотрите также: [Применение программного управления моделью](/helpcenter/stable/ru/interactive-scripts/base_simulation/program_control_demo.html) |

Здесь представлены все публичные методы программного управления `engee`. Для ознакомления с методами `engee.script` обратитесь к статье [Программное управление скриптами](programmatic-modeling-scripts.html).

## Методы `engee`

- [`engee.add_block`](#engee.add_block-Tuple{String, String})
- [`engee.add_line`](#engee.add_line-Tuple{CommandControlTypes.System, AbstractString, AbstractString})
- [`engee.addpath`](#engee.addpath-Tuple{Vararg{String}})
- [`engee.arrange_system`](#engee.arrange_system)
- [`engee.clear`](#engee.clear-Tuple{})
- [`engee.clear_all`](#engee.clear_all-Tuple{})
- [`engee.clear_port`](#engee.clear_port-Tuple{AbstractString})
- [`engee.close`](#engee.close-Tuple{CommandControlTypes.Model})
- [`engee.close_all`](#engee.close_all-Tuple{})
- [`engee.compare_models`](#engee.compare_models-Tuple{String, String})
- [`engee.convert_model`](#engee.convert_model-Tuple{String})
- [`engee.copy_block`](#engee.copy_block-Tuple{AbstractString, AbstractString})
- [`engee.copy_contents`](#engee.copy_contents-Tuple{AbstractString, AbstractString})
- [`engee.create`](#engee.create-Tuple{String})
- [`engee.delete_block`](#engee.delete_block-Tuple{String})
- [`engee.delete_contents`](#engee.delete_contents-Tuple{AbstractString})
- [`engee.delete_line`](#engee.delete_line-Tuple{AbstractString, AbstractString})
- [`engee.eval`](#engee.eval-Tuple{AbstractString})
- [`engee.find_system`](#engee.find_system-Tuple{AbstractString})
- [`engee.find_system`](#engee.find_system-Tuple{CommandControlTypes.System})
- [`engee.find_system`](#engee.find_system-Tuple{CommandControlTypes.Model})
- [`engee.find_system`](#engee.find_system-Tuple{})
- [`engee.gcb`](#engee.gcb-Tuple{})
- [`engee.gcm`](#engee.gcm-Tuple{})
- [`engee.gcs`](#engee.gcs-Tuple{})
- [`engee.generate_code`](#engee.generate_code-Tuple{CommandControlTypes.Model, String})
- [`engee.generate_code`](#engee.generate_code-Tuple{String, String})
- [`engee.get_all_models`](#engee.get_all_models-Tuple{})
- [`engee.get_current_block`](#engee.get_current_block-Tuple{})
- [`engee.get_current_model`](#engee.get_current_model-Tuple{})
- [`engee.get_current_system`](#engee.get_current_system-Tuple{})
- [`engee.get_lines`](#engee.get_lines-Tuple{AbstractString, CommandControlTypes.PortCausality})
- [`engee.get_lines`](#engee.get_lines-Tuple{AbstractString})
- [`engee.get_lines`](#engee.get_lines-Tuple{CommandControlTypes.PortHandle})
- [`engee.get_logs`](#engee.get_logs-Tuple{CommandControlTypes.Model})
- [`engee.get_param`](#engee.get_param)
- [`engee.get_ports`](#engee.get_ports-Tuple{AbstractString})
- [`engee.get_results`](#engee.get_results-Tuple{CommandControlTypes.Model})
- [`engee.get_status`](#engee.get_status-Tuple{})
- [`engee.info`](#engee.info-Tuple{String})
- [`engee.is_dirty`](#engee.is_dirty-Tuple{CommandControlTypes.Model})
- [`engee.load`](#engee.load-Tuple{AbstractString})
- [`engee.log`](#engee.log-Tuple{String})
- [`engee.model`](#engee.model)
- [`engee.open`](#engee.open-Tuple{String})
- [`engee.pause`](#engee.pause-Tuple{})
- [`engee.rename_model`](#engee.rename_model-Tuple{AbstractString, AbstractString})
- [`engee.reset`](#engee.reset-Tuple{})
- [`engee.resume`](#engee.resume-Tuple{})
- [`engee.rmpath`](#engee.rmpath-Tuple{String})
- [`engee.run`](#engee.run-Tuple{UUID})
- [`engee.save`](#engee.save-Tuple{CommandControlTypes.Model, String})
- [`engee.screenshot`](#engee.screenshot-Tuple{String, String})
- [`engee.set_log`](#engee.set_log-Tuple{AbstractString, AbstractString})
- [`engee.set_param!`](#engee.set_param!)
- [`engee.stop`](#engee.stop-Tuple{})
- [`engee.unset_log`](#engee.unset_log-Tuple{AbstractString, AbstractString})
- [`engee.update_params`](#engee.update_params)
- [`engee.version`](#engee.version-Tuple{})
- [`engee.warning`](#engee.warning-Tuple{String})

**`engee.add_block`** — *Method*

```
engee.add_block(lib_block_path::String, tgt_block_path::String)
```

Добавляет блок из библиотеки.

**Аргументы**

- `lib_block_path::String`: путь до блока в библиотеке (начинается с `/`).
- `tgt_block_path::String`: путь до целевой системы и ожидаемое имя нового блока. Если указано только имя системы (например `"newmodel_1/"`), то имя блока будет автоматически сгенерировано. Если указан полный путь с именем блока (например `"newmodel_1/Sum1"`), то блок получит указанное имя.

**Примеры**

```
# Добавление блока из библиотеки без присвоения имени
engee.add_block("/Basic/Math Operations/Add", "newmodel_1/")

# Добавление блока с присвоением имени
engee.add_block("/Basic/Math Operations/Add", "newmodel_1/Add_block_new")
```

**`engee.add_line`** — *Method*

```
engee.add_line(src_path::AbstractString, dst_path::AbstractString)
engee.add_line(system::System, src_path::AbstractString, dst_path::AbstractString)
engee.add_line(system_path::AbstractString, src_path::AbstractString, dst_path::AbstractString)

engee.add_line(src::PortHandle{OUT}, dst::PortHandle{IN})
engee.add_line(src::PortHandle{IN}, dst::PortHandle{OUT})
engee.add_line(src::PortHandle{ACAUSAL}, dst::PortHandle{ACAUSAL})
```

Добавляет связь (поток данных) между блоками. Поддерживаются два способа задания портов:

- Через строковые пути к портам: `"block_path/idx"` или `"block_path/port_name"`, где `block_path` — путь блока относительно выбранной системы. Если система не передана отдельным аргументом, то используется текущая система.;
- Через дескрипторы портов (`PortHandle`), полученные, например, с помощью `engee.get_ports`.

**Дескриптор порта** (PortHandle) — это объект, который однозначно идентифицирует конкретный порт блока внутри модели. Он не содержит значения сигнала, но служит «ручкой» («Handle») для программной работы с портами — его можно передавать в `engee.add_line`, `engee.delete_line`, `engee.get_lines` и другие функции.

**Особенности физического моделирования (acausal)**

В блоках физического моделирования **Engee** порты являются ненаправленными (`acausal`). Это накладывает следующие особенности на работу с соединениями:

- Соединение между `PortHandle{ACAUSAL}` не задает направление потока данных, а просто связывает два физических узла;
- Один ненаправленный порт может иметь несколько подключений (несколько линий);
- Связи между блоками представлены отдельными объектами `Line`.

Поэтому при программном анализе или изменении модели используется поэтапный подход:

- Получить порт блока с помощью `engee.get_ports`;
- Получить линии, подключенные к этому порту, с помощью `engee.get_lines`;
- Из объектов `Line` получить соседние порты (`source` и `destination`);
- Выполнить переподключение с помощью `engee.add_line`.

**Аргументы**

Строковые варианты:

- `system::System`: объект типа `System`;
- `system_path::AbstractString`: путь до системы;
- `src_path::AbstractString`: относительный путь до `out` (выходного) порта или ненаправленного (`acausal`) порта блока. Формат записи — `"system_name/block_name/idx"` или `"system_name/block_name/port_name"`;
- `dst_path::AbstractString`: относительный путь до `in` (входного) порта или ненаправленного (`acausal`) порта блока. Формат записи — `"system_name/block_name/idx"` или `"system_name/block_name/port_name"`.

Варианты с дескрипторами портов:

- `src::PortHandle{OUT}`, `dst::PortHandle{IN}` — дескрипторы направленных портов-источника и порта-приемника;
- `src::PortHandle{IN}`, `dst::PortHandle{OUT}` — обратное направление (когда по смыслу схемы источником является блок с входным портом);
- `src::PortHandle{ACAUSAL}`, `dst::PortHandle{ACAUSAL}` — дескрипторы ненаправленных портов.

**Примеры**

Строки:

```
# Соединяет первый выходной порт блока Sine Wave и первый входной порт блока Terminator в текущей системе
engee.add_line("Sine Wave/1", "Terminator/1")

# Первый параметр может быть объектом System
system = engee.gcs()

# Вызов эквивалентен предыдущему
engee.add_line(system, "Sine Wave-1/1", "Terminator-1/1")

# Вместо индексов можно использовать имена портов
engee.add_line("model", "Resistor/p", "Resistor-1/n")
```

Дескрипторы:

```
engee.add_block("/Basic/Sources/Sine Wave",   "newmodel_1/Sine Wave")
engee.add_block("/Basic/Math Operations/Add", "newmodel_1/Add_block")
engee.add_block("/Basic/Sinks/Terminator",    "newmodel_1/Terminator")

# Получаем порты блоков
src_ports = engee.get_ports("newmodel_1/Sine Wave")
add_ports = engee.get_ports("newmodel_1/Add_block")
dst_ports = engee.get_ports("newmodel_1/Terminator")

# Соединяем выход Sine Wave с первым входом Add_block
engee.add_line(src_ports.outputs[1], add_ports.inputs[1])

# Соединяем выход Add_block с входом Terminator
engee.add_line(add_ports.outputs[1], dst_ports.inputs[1])
```

В физическом моделировании (`acausal`) у порта может быть несколько соединений, поэтому нельзя напрямую использовать только `source` или `destination`. В таких случаях используется поэтапный подход по цепочке порт → линия → соседний порт:

- Берем порт блока с помощью `engee.get_ports`;
- Получаем линию или линии, подключенные к этому порту, с помощью `engee.get_lines`;
- Из объекта `Line` получаем соседний порт (`line.source` или `line.destination`);
- Выполняем переподключение с помощью `engee.add_line`.

Ниже приведен пример замены физического блока с восстановлением соединений, выполненный по этой цепочке.

```
# Получаем входной порт блока PID Controller с именем "in". Это порт-приемник
pid_input_port = engee.get_ports("newmodel_1/PID Controller").inputs["in"]

# Получаем соединительную линию, соответствующую этому порту
pid_input_line = engee.get_lines(pid_input_port)

# Получаем порт-источник для этой линии
pid_source_port = pid_input_line[1].source

# Получаем входной порт нового блока PID Controller с именем "in". Это порт-приемник
new_pid_input_port = engee.get_ports("newmodel_1/PID Controller New").inputs["in"]

# Соединяем порт-источник с портом-приемником
engee.add_line(pid_source_port, new_pid_input_port)

# Получаем выходной порт PID Controller
pid_output_port = engee.get_ports("newmodel_1/PID Controller").outputs["out"]

# Получаем соединительную линию для этого порта
pid_output_line = engee.get_lines(pid_output_port)

# Получаем порт-приемник для этой линии
pid_dest_port = pid_output_line[1].destination

# Удаляем старый блок PID Controller
engee.delete_block("newmodel_1/PID Controller")

# Получаем выходной порт нового блока PID Controller
new_pid_output_port = engee.get_ports("newmodel_1/PID Controller New").outputs["out"]

# Подключаем выходной порт нового PID Controller к старому порту-приемнику
engee.add_line(new_pid_output_port, pid_dest_port)

# Опционально делаем автоформатирование модели
engee.arrange_system(engee.gcs())
```

**`engee.addpath`** — *Method*

```
engee.addpath(path::Vararg{String})
```

Добавляет один или более путей в системную переменную `LOAD_PATH`. `LOAD_PATH` — это системная переменная, которую **Engee** использует для поиска нужных исполняемых объектов (например `.engee`, `.ngscript`), а также любых других путей, используемых в командах.

**Аргументы**

`path::Vararg{String}`: один или более путей в файловой системе (абсолютных или относительных).

**Примеры**

```
engee.addpath("/user/models")
# Загрузка модели
engee.load("model.engee")
```

**`engee.arrange_system`** — *Function*

```
engee.arrange_system(system::System)
```

Перестраивает расположение блоков и связей в указанной модели, автоматически располагая элементы так, чтобы уменьшить пересечения линий и сделать структуру модели более читаемой. Функция эквивалентна команде контекстного меню «Упорядочить модель» на холсте **Engee**. Упорядочивание выполняется только для указанной модели (без рекурсивного изменения вложенных подсистем).

**Аргументы**

`system::System`: объект системы (модели), для которой нужно выполнить автоматическое упорядочивание. Можно получить с помощью `engee.gcs()`.

**Примеры**

```
# Упорядочивает текущую открытую модель
engee.arrange_system(engee.gcs())
```

**`engee.clear`** — *Method*

```
engee.clear()
```

Очищает все переменные в текущем рабочем пространстве. `clear()` удаляет все данные, хранящиеся в переменных, чтобы освободить память под новые вычисления и потоки данных. Возвращает `nothing`.

**`engee.clear_all`** — *Method*

```
engee.clear_all()
```

Очищает все переменные, функции и defined модули из текущего рабочего пространства. `clear_all()` возвращает текущее рабочее пространство в исходное состояние. Возвращает `nothing`.

**`engee.clear_port`** — *Method*

engee.clear*port(port*path::AbstractString)

Удаляет все линии, связанные с переданным портом. При использовании индекса порта вместо имени, порт ищется среди выходных портов блока.

**Пример:**

```
engee.clear_port("model/Sine Wave/main_out")
engee.clear_port("model/Terminator/main_in")
```

**`engee.close`** — *Method*

```
engee.close(model_name::String; force::Bool = false)
engee.close(model::Model; force::Bool = false)
engee.close(; force::Bool = false)
```

Закрывает модель с именем `model_name`. Текущей становится модель, открытая левее в панели навигации по моделям. Если модель не указана, то закрывает текущую модель. Если текущая модель не задана, то ничего не делает. Если модель уже не существует, то ничего не делает.

**Аргументы**

- `model_name::String`: имя модели, которая будет закрыта.
- `model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно открыта в графическом интерфейсе.
- `force::Bool`: по умолчанию равен `false`. Если есть несохраненные изменения и параметр равен `false`, то завершается с ошибкой. Если равен `true`, то несохраненные изменения будут потеряны.

**Примеры**

```
# Выгружает из памяти модель newmodel_1
engee.close("newmodel_1")

# Выгружает из памяти модель newmodel_1 без сохранения последних изменений
engee.close("newmodel_1", force=true)

# Закрывает модель newmodel_1 (выгружает и убирает с холста)
engee.close("newmodel_1", force=true)
```

**`engee.close_all`** — *Method*

```
engee.close_all()
```

Закрывает все модели.

**Примеры**

```
# Выгружает из памяти все открытые модели
engee.close_all()
```

**`engee.compare_models`** — *Method*

```
engee.compare_models(model_path_1::String, model_path_2::String)
```

Производит сравнение пары моделей и возвращает список различий.

**Аргументы**

- `model_path_1::String`: абсолютный или относительный путь к первой модели, которую нужно сравнить.
- `model_path_2::String`: абсолютный или относительный путь ко второй модели для сравнения с первой.

**Примеры**

```
# Абсолютный путь (указание полного пути до файла модели)
m1 = "/user/modelname_1.engee"

# Относительный путь (указание относительного пути до файла модели)
m2 = "modelname_2.engee"

# Сравнение m1 и m2
engee.compare_models(m1, m2)
```

**`engee.convert_model`** — *Method*

```
engee.convert_model(model_path::String, out_path::String="")
```

Генерирует .ngscript файл (скрипт **Engee**) для построения текущей модели с помощью команд программного управления.

**Аргументы**

- `model_path::String`: абсолютный или относительный путь к исходной модели в формате `.engee` или `.slx`, которую необходимо преобразовать.
- `out_path::String`: путь для сохранения сгенерированного скрипта.

  - Если `out_path` не указан или равен `""`, то функция возвращает сгенерированный скрипт как строку и не сохраняет его в файл.
  - Если указан `out_path`, то скрипт сохраняется по указанному пути, а функция возвращает `nothing`. Для последующего запуска в Julia рекомендуется расширение `.jl`.

**Примеры**

```
# Сохранение скрипта в файл (абсолютный путь)
model_path = "/user/newmodel_1.engee"
engee.convert_model(model_path, "/user/newmodel_1.jl")

# Сохранение скрипта в файл (относительный путь)
engee.convert_model("newmodel_2.engee", "newmodel_2.jl")

# Получение скрипта как строки (без сохранения в файл)
script = engee.convert_model("/user/newmodel_1.engee")
```

**`engee.copy_block`** — *Method*

```
engee.copy_block(src_path::AbstractString, dst_path::AbstractString; duplicate::Bool=false)::Nothing
```

Копирует блок из системы.

Если `duplicate=true` и `src_path` указывает на блок `Inport`, то функция создает дубликат входного порта (`Inport Shadow`): дубликат получает тот же номер входного порта, что и исходный `Inport`, и позволяет разветвить сигнал от входа без создания нового входного порта подсистемы.

**Аргументы**

- `src_path::AbstractString`: путь до блока в иерархии модели (например `"model/system/block"` или `"model/block"` для корневой папки).
- `dst_path::AbstractString`: путь до системы и ожидаемое имя. Формат записи — `path/to/system/new_block_name`. Если имя не указано, то задается автоматически.
- `duplicate::Bool`: флаг дублирования для блоков `Inport`. Для других типов блоков установка флага (`duplicate=true`) приведет к ошибке: `"Duplication not allowed for this block type: only "Inport" blocks can be duplicated"`.

**Примеры**

```
# Добавляет блок Add-3 из модели newmodel_1 и автоматически присваивает ему имя в модели newmodel_2
engee.copy_block("newmodel_1/Add-3", "newmodel_2/")

# Добавляет блок из модели newmodel_1 с именем Custom Block Name в модель nemodel_2 под именем Test_name
engee.copy_block("newmodel_1/Custom Block Name", "newmodel_2/Test_name")
```

**`engee.copy_contents`** — *Method*

```
engee.copy_contents(src_path::AbstractString, dst_path::AbstractString)
```

Копирует содержимое одной системы в другую. Целевая (target) система должна быть пустой. Рекурсивное копирование запрещено.

**Аргументы**

- `src_path::AbstractString`: путь до системы, из которой производится копирование.
- `dst_path::AbstractString`: путь до системы, в которую производится копирование.

**Примеры**

```
# Копирование содержимого из корневой (root) системы newmodel_1 в корневую систему newmodel_2
engee.copy_contents("newmodel_1", "newmodel_2")

# Копирование содержимого из подсистемы "newmodel_1/Subsystem" в подсистему `newmodel_1/Subsystem-1`
engee.copy_contents("newmodel_1/Subsystem", "newmodel_1/Subsystem-1")
ERROR: "newmodel_1/Subsystem-1 must be empty. Use `engee.delete_contents`"
engee.delete_contents("newmodel_1/Subsystem-1")
engee.copy_contents("newmodel_1/Subsystem", "newmodel_1/Subsystem-1")
```

**`engee.create`** — *Method*

```
engee.create(model_name::String)::Model
```

Создает новую модель с именем `model_name` и параметрами по умолчанию. Возвращает `Model`. Модель становится текущей моделью. Ее корневая система становится текущей системой. Если модель с таким именем уже существует, то завершается ошибкой `EngeeException`.

**Аргументы**

`model_name::String`: желаемое имя модели в системе. Имя модели не должно содержать символ `/`.

**Примеры**

```
engee.create("NewModel")
Model(
        name: NewModel
        id: 6b59d80d-8b48-419d-83e7-a90660aa1a6a
)
```

**`engee.delete_block`** — *Method*

```
engee.delete_block(block_path::String)
```

Удаляет блок, все связанные линии и записываемые порты из системы.

**Аргументы**

`block_path::String`: путь до блока.

**Примеры**

```
# Удаляет блок Sine Wave и все связанные с ним линии и блоки из системы
engee.delete_block("newmodel_1/Sine Wave")
```

**`engee.delete_contents`** — *Method*

```
engee.delete_contents(system_path::String)
```

Удаляет содержимое системы.

**Аргументы**

`system_path::String`: путь до системы, контент которой будет удален.

**Примеры**

```
# Удаление всех блоков из подсистемы Subsystem-1 в модели newmodel_1
engee.delete_contents("newmodel_1/Subsystem-1")
```

**`engee.delete_line`** — *Method*

```
engee.delete_line(src_path::AbstractString, dst_path::AbstractString)
engee.delete_line(system::System, src_path::AbstractString, dst_path::AbstractString)
engee.delete_line(system_path::AbstractString, src_path::AbstractString, dst_path::AbstractString)

engee.delete_line(line::Line)
engee.delete_line(src::PortHandle{OUT},     dst::PortHandle{IN})
engee.delete_line(src::PortHandle{IN},      dst::PortHandle{OUT})
engee.delete_line(src::PortHandle{ACAUSAL}, dst::PortHandle{ACAUSAL})
```

Поддерживаются три способа указания удаляемого соединения:

- По строковым путям до портов (`"system_name/block_name/idx"`);
- По объекту линии `Line`, полученному через `engee.get_lines`;
- По дескрипторам портов (`PortHandle`), полученным через `engee.get_ports` или из структуры `Line`.

`Line` описывает одну линию соединения в схеме и содержит, в частности, порты-источник и приемник: `source::PortHandle`, `destination::PortHandle`.

Способы удаления через `Line` и `PortHandle{ACAUSAL}` применимы также к ненаправленным (`acausal`, физическим) соединениям.

**Аргументы**

Строковые варианты:

- `system::Union{AbstractString, System}`: путь до системы или объект типа `System`;
- `src_path::AbstractString`: относительный путь до `out` (выход) порта блока. В качестве названия порта используется его порядковый номер. Формат записи — `"system_name/block_name/idx"`;
- `dst_path::AbstractString`: относительный путь до `in` (вход) порта блока. В качестве названия порта используется его порядковый номер. Формат записи — `"system_name/block_name/idx"`.

Варианты с объектами `Line` и дескрипторами портов:

- `line::Line`: объект линии, возвращаемый `engee.get_lines(...)`. Содержит идентификатор линии и дескрипторы портов-источника и приемника;
- `src::PortHandle{OUT}`, `dst::PortHandle{IN}` — дескрипторы направленных портов-источника и порта-приемника;
- `src::PortHandle{IN}`, `dst::PortHandle{OUT}` — обратное направление (когда по смыслу источником

считается блок с входным портом);

- `src::PortHandle{ACAUSAL}`, `dst::PortHandle{ACAUSAL}` — дескрипторы ненаправленных портов.

**Примеры**

```
# Удаляет соединение между первым входным портом блока Sine Wave и первым выходным портом блока Terminator в модели newmodel_1
engee.delete_line("newmodel_1", "Sine Wave/1", "Terminator/1")
system = engee.gcs()
engee.delete_line(system, "Sine Wave-1/1", "Terminator-1/1")

# Удаление без указания системы. По умолчанию вызывается применительно к текущей системе
engee.delete_line("Sine Wave-2/1", "Terminator-2/1")

# Пример работы с дескрипторами портов (PortHandle), предполагаем, что блоки уже соединены через engee.add_line, как в примере для add_line
src_ports = engee.get_ports("newmodel_1/Sine Wave")
dst_ports = engee.get_ports("newmodel_1/Terminator")

# Удаляем линию между первым выходом Sine Wave и первым входом Terminator
engee.delete_line(src_ports.outputs[1], dst_ports.inputs[1])

# Пример удаления всех линий, подключенных к блоку

# Получаем все линии, подключенные к блоку Add_block
all_block_lines = engee.get_lines("newmodel_1/Add_block")

# Удаляем все эти линии по объектам Line
for ln in all_block_lines
    engee.delete_line(ln)
end

# Эквивалентная запись с точечной нотацией
engee.delete_line.(engee.get_lines("newmodel_1/Add_block"))
```

**`engee.eval`** — *Method*

```
engee.eval(code::AbstractString)
```

Выполняет код на Julia в текущем контексте модели.

**Аргументы**

`code::AbstractString`: строка с кодом на Julia для выполнения.

**Примеры**

```
engee.eval(2 + 3 * 5)
17

engee.eval(sin(π/2))
1.0
```

**`engee.find_system`** — *Method*

```
engee.find_system(path::String; depth::Int=typemax(Int), blockparams::Vector{<:Pair{<:AbstractString,<:Any}}=Vector{Pair{String, Any}}())
```

Совершает поиск сущностей (моделей/систем/блоков) по указанному пути. Возвращает пути до найденных сущностей.

**Аргументы**

- `path::String`: путь до сущности, в которой будет проводиться поиск.
- `depth::Int=typemax(Int)`: максимальная глубина поиска (включительно). Для поиска без ограничений используется `typemax(Int)`. Перечисление начинается с 0. По умолчанию `typemax(Int)`.
- `blockparams::Vector`: возвратятся только блоки, имеющие заданные параметры.

**Примеры**

```
# Список сущностей, из которых состоит модель с именем newmodel_1 (подсистем, блоков)
engee.find_system("newmodel_1")

# Список сущностей модели newmodel_1 без захода в подсистемы
engee.find_system("newmodel_1"; depth=0)

# Список всех блоков с полем Value, равным 1.0, в модели newmodel_1
engee.find_system("newmodel_1"; blockparams=["Value"=>1.0])
```

**`engee.find_system`** — *Method*

```
engee.find_system(model::Model; depth::Int=typemax(Int), blockparams::Vector{<:Pair{<:AbstractString,<:Any}}=Vector{Pair{String, Any}}())
```

Совершает поиск сущностей (моделей/систем/блоков) в указанной модели, переданной как объект типа `Model`. Возвращает пути до найденных сущностей.

**Аргументы**

- `model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно открыта в графическом интерфейсе. Поиск будет проводиться в этой модели.
- `depth::Int=typemax(Int)`: максимальная глубина поиска (включительно). Для поиска без ограничений используется `typemax(Int)`. Перечисление начинается с 0. По умолчанию `typemax(Int)`.
- `blockparams::Vector`: возвратятся только блоки, имеющие заданные параметры.

**Примеры**

```
# Список сущностей, из которых состоит модель model (подсистем, блоков)
engee.find_system(model)

# Список сущностей модели model без захода в подсистемы
engee.find_system(model; depth=0)

# Список всех блоков с полем Value, равным 1.0, в модели model
engee.find_system(model; blockparams=["Value"=>1.0])
```

**`engee.find_system`** — *Method*

```
engee.find_system(system::System; depth::Int=typemax(Int), blockparams::Vector{<:Pair{<:AbstractString,<:Any}}=Vector{Pair{String, Any}}())
```

Совершает поиск сущностей (моделей/систем/блоков) в указанной системе, переданной как объект типа `System`. Возвращает пути до найденных сущностей.

**Аргументы**

- `system::System`: система, в которой будет проводиться поиск.
- `depth::Int=typemax(Int)`: максимальная глубина поиска (включительно). Для поиска без ограничений используется `typemax(Int)`. Перечисление начинается с 0. По умолчанию `typemax(Int)`.
- `blockparams::Vector`: возвратятся только блоки, имеющие заданные параметры.

**Примеры**

```
# Список сущностей, из которых состоит система system (подсистем, блоков)
engee.find_system(system)

# Список сущностей системы system без захода в подсистемы
engee.find_system(system; depth=0)

# Список всех блоков с полем Value, равным 1.0, в системе system
engee.find_system(system; blockparams=["Value"=>1.0])
```

**`engee.find_system`** — *Method*

```
engee.find_system(; depth::Int=typemax(Int), blockparams::Vector{<:Pair{<:AbstractString,<:Any}}=Vector{Pair{String, Any}}())
```

Совершает поиск сущностей (моделей/систем/блоков) во всех доступных моделях. Возвращает пути до найденных сущностей.

**Аргументы**

- `depth::Int=typemax(Int)`: максимальная глубина поиска (включительно). Для поиска без ограничений используется `typemax(Int)`. Перечисление начинается с 0. По умолчанию `typemax(Int)`.
- `blockparams::Vector`: возвратятся только блоки, имеющие заданные параметры.

**Примеры**

```
# Список всех сущностей
engee.find_system()

# Список сущностей моделей без захода в подсистемы
engee.find_system(; depth=0)

# Список всех блоков с полем Value, равным 1.0
engee.find_system(; blockparams=["Value"=>1.0])
```

**`engee.gcb`** — *Method*

```
engee.get_current_block()::String
engee.gcb()::String
```

Возвращает путь до текущего блока. Если текущего блока или модели нет, то выводит ошибку `Current block is not set`.

**Примеры**

```
# Блок Sine Wave выделен на холсте
engee.gcb()
"newmodel_1/Sine Wave"
```

**`engee.gcm`** — *Method*

```
engee.get_current_model()::Model
engee.gcm()::Model
```

Возвращает текущую модель. Если текущей модели нет, то выводит ошибку `No opened model`.

**Примеры**

```
engee.get_current_model()
Model(
        name: ssc_bridge_rectifier_modified
        id: c390ed60-d2c4-4e17-85df-07129aca8ba4
)
```

**`engee.gcs`** — *Method*

```
engee.get_current_system()::System
engee.gcs()::System
```

Возвращает текущую систему. Если текущей модели нет, то выводит ошибку `No opened model`.

**Примеры**

```
engee.gcs()
System(
    name: root,
    id: 039b7ddd-f836-4b0c-bb8d-8232344b22fb,
    path: newmodel_1
)
```

**`engee.generate_code`** — *Method*

```
engee.generate_code(path/to/modelname.engee::String, path/to/output_dir::String; subsystem_name=subsystem_path::String, subsystem_id=subsystem_id::String, target::String, jl_path::String)
```

Генерирует код на указанном языке для моделей и/или подсистем. Поддерживает использование шаблонов для настройки выходного кода (включая функцию `main`).

**Для моделей**

- Генерация выполняется для всей модели, заданной абсолютным или относительным путем к файлу с моделью `.engee`.
- Может быть указан целевой генерации кода через параметр `target`, а также путь к пользовательскому шаблону через `template_path`.

**Аргументы**

- `model_path::String`: абсолютный или относительный путь к модели из которой генерируется код. В качестве аргумента может выступать объект модели (объект типа `model`, полученный функцией `engee.gcm`).
- `output_dir::String`: абсолютный или относительный путь к директории, в которую сохранится сгенерированный код. Если директории `output_dir` не существует, то она будет создана автоматически.
- `target::String`: указание языка для генерации кода. Поддерживаемые языки — `Си` (по умолчанию) или `Verilog`.
- `template_path::String`: путь к `.jl`-файлу-шаблону (например шаблон функции `main`).

**Примеры**

```
# Генерация Си кода для модели
engee.generate_code("newmodel_1.engee", "newmodel_1/codegen_output")

# Генерация Verilog кода, будет создан файл newmodel_1.v с Verilog кодом
engee.generate_code("newmodel_1.engee", "newmodel_1/verilog_output", target="verilog")

# Генерация кода с шаблоном, содержащим функцию main
engee.generate_code("codegen_model.engee", "codegen_dir", template_path="/user/main_template.jl")

# Получение текущей открытой модели и генерация кода из нее
m = engee.gcm()
engee.generate_code(m, "/user/newmodel_1/codegen_output")
```

**Для подсистем**

- Генерация выполняется только для атомарной подсистемы, указанной по имени (`subsystem_name`) или по идентификатору (`subsystem_id`).
- Остальные параметры аналогичны генерации для полной модели.

**Аргументы**

- `subsystem_name::String`: полный путь к атомарной подсистеме из которой генерируется код.
- `subsystem_id::String`: уникальный идентификатор атомарной подсистемы из которой генерируется код (альтернатива `subsystem_name`).
- `target::String`: указание языка для генерации кода. Поддерживаемые языки — `Си` (по умолчанию) или `Verilog`.

**Примеры**

```
# Генерация Си кода для подсистемы по имени
engee.generate_code("newmodel_1.engee", "newmodel_1/Subsystem", subsystem_name="Subsystem")

# Генерация кода для атомарной подсистемы по ее id
engee.generate_code("/user/newmodel_1.engee", "/user/newmodel_1/Subsystem"; subsystem_id = "88275e0b-a049-4bb5-b8c7-057badd1b536")

# Генерация Verilog кода для подсистемы, будет создан файл newmodel_1.v с Verilog кодом подсистемы
engee.generate_code("newmodel_1.engee", "newmodel_1/verilog_pid", subsystem_name="SubSystem", target="verilog")
```

**`engee.generate_code`** — *Method*

```
engee.generate_code(path/to/modelname.engee::String, path/to/output_dir::String; subsystem_name=subsystem_path::String, subsystem_id=subsystem_id::String, target::String, jl_path::String)
```

Генерирует код на указанном языке для моделей и/или подсистем. Поддерживает использование шаблонов для настройки выходного кода (включая функцию `main`).

**Для моделей**

- Генерация выполняется для всей модели, заданной абсолютным или относительным путем к файлу с моделью `.engee`.
- Может быть указан целевой генерации кода через параметр `target`, а также путь к пользовательскому шаблону через `template_path`.

**Аргументы**

- `model_path::String`: абсолютный или относительный путь к модели из которой генерируется код. В качестве аргумента может выступать объект модели (объект типа `model`, полученный функцией `engee.gcm`).
- `output_dir::String`: абсолютный или относительный путь к директории, в которую сохранится сгенерированный код. Если директории `output_dir` не существует, то она будет создана автоматически.
- `target::String`: указание языка для генерации кода. Поддерживаемые языки — `Си` (по умолчанию) или `Verilog`.
- `template_path::String`: путь к `.jl`-файлу-шаблону (например шаблон функции `main`).

**Примеры**

```
# Генерация Си кода для модели
engee.generate_code("newmodel_1.engee", "newmodel_1/codegen_output")

# Генерация Verilog кода, будет создан файл newmodel_1.v с Verilog кодом
engee.generate_code("newmodel_1.engee", "newmodel_1/verilog_output", target="verilog")

# Генерация кода с шаблоном, содержащим функцию main
engee.generate_code("codegen_model.engee", "codegen_dir", template_path="/user/main_template.jl")

# Получение текущей открытой модели и генерация кода из нее
m = engee.gcm()
engee.generate_code(m, "/user/newmodel_1/codegen_output")
```

**Для подсистем**

- Генерация выполняется только для атомарной подсистемы, указанной по имени (`subsystem_name`) или по идентификатору (`subsystem_id`).
- Остальные параметры аналогичны генерации для полной модели.

**Аргументы**

- `subsystem_name::String`: полный путь к атомарной подсистеме из которой генерируется код.
- `subsystem_id::String`: уникальный идентификатор атомарной подсистемы из которой генерируется код (альтернатива `subsystem_name`).
- `target::String`: указание языка для генерации кода. Поддерживаемые языки — `Си` (по умолчанию) или `Verilog`.

**Примеры**

```
# Генерация Си кода для подсистемы по имени
engee.generate_code("newmodel_1.engee", "newmodel_1/Subsystem", subsystem_name="Subsystem")

# Генерация кода для атомарной подсистемы по ее id
engee.generate_code("/user/newmodel_1.engee", "/user/newmodel_1/Subsystem"; subsystem_id = "88275e0b-a049-4bb5-b8c7-057badd1b536")

# Генерация Verilog кода для подсистемы, будет создан файл newmodel_1.v с Verilog кодом подсистемы
engee.generate_code("newmodel_1.engee", "newmodel_1/verilog_pid", subsystem_name="SubSystem", target="verilog")
```

**`engee.get_all_models`** — *Method*

```
engee.get_all_models(; sorted=true)::Vector{Model}
```

Возвращает список всех моделей, открытых в текущей сессии, в формате `Vector{Model}`. Если параметр `sorted=true`, то возвращает отсортированный по имени список моделей.

**Аргументы**

`sorted::Bool`: по умолчанию `true`. Определяет, будет ли список моделей отсортирован по имени.

**Примеры**

```
# Список с перечнем всех открытых моделей
models_list = engee.get_all_models()

# Список с названиями всех открытых моделей
model_names = [m.name for m in engee.get_all_models()]
```

**`engee.get_current_block`** — *Method*

```
engee.get_current_block()::String
engee.gcb()::String
```

Возвращает путь до текущего блока. Если текущего блока или модели нет, то выводит ошибку `Current block is not set`.

**Примеры**

```
# Блок Sine Wave выделен на холсте
engee.gcb()
"newmodel_1/Sine Wave"
```

**`engee.get_current_model`** — *Method*

```
engee.get_current_model()::Model
engee.gcm()::Model
```

Возвращает текущую модель. Если текущей модели нет, то выводит ошибку `No opened model`.

**Примеры**

```
engee.get_current_model()
Model(
        name: ssc_bridge_rectifier_modified
        id: c390ed60-d2c4-4e17-85df-07129aca8ba4
)
```

**`engee.get_current_system`** — *Method*

```
engee.get_current_system()::System
engee.gcs()::System
```

Возвращает текущую систему. Если текущей модели нет, то выводит ошибку `No opened model`.

**Примеры**

```
engee.gcs()
System(
    name: root,
    id: 039b7ddd-f836-4b0c-bb8d-8232344b22fb,
    path: newmodel_1
)
```

**`engee.get_lines`** — *Method*

**`engee.get_lines`** — *Method*

```
engee.get_lines(block_path::AbstractString)::Vector{Line}
engee.get_lines(block_path::AbstractString, causality::PortCausality)::Vector{Line}
engee.get_lines(port::PortHandle)::Vector{Line}
```

Возвращает сигнальные линии (Line), подключенные к блоку или конкретному порту. Возвращает `Vector{Line}` — вектор объектов `Line`, каждый из которых описывает одну связь между двумя портами.

**Линия** (Line) — это объект, описывающий одно соединение в схеме:

- `id::UUID` — идентификатор линии;
- `source::PortHandle` — порт-источник;
- `destination::PortHandle` — порт-приемник.

Объект `Line` можно, например, передать в `engee.delete_line(line::Line)` для удаления соединения.

Функция `engee.get_lines(...)` всегда возвращает вектор линий (`Vector{Line}`), даже если линия всего одна. Это важно для ненаправленных (`acausal`) портов физического моделирования, где один порт может иметь несколько подключений.

**Аргументы**

- `block_path::AbstractString`: путь до блока в иерархии модели. Формат записи — `"model_name/block_name"` или `"model_name/system_name/block_name"`.
- `causality::PortCausality`: тип портов, для которых нужно получить линии. Поддерживаются значения перечисления `PortCausality`:

  - `IN` — линии, подключенные к входным портам блока;
  - `OUT` — линии, подключенные к выходным портам;
  - `ACAUSAL` — линии, подключенные к ненаправленным портам.
- `port::PortHandle`: дескриптор порта блока (`PortHandle{IN}, PortHandle{OUT}` или `PortHandle{ACAUSAL}`), например, полученный через `engee.get_ports`.

**Примеры**

```
engee.add_block("/Basic/Sources/Sine Wave",   "newmodel_1/Sine Wave")
engee.add_block("/Basic/Sinks/Terminator",    "newmodel_1/Terminator")
engee.add_block("/Basic/Math Operations/Add", "newmodel_1/Add_block")

# Соединяем Sine Wave -> Add_block -> Terminator
src_ports = engee.get_ports("newmodel_1/Sine Wave")
add_ports = engee.get_ports("newmodel_1/Add_block")
dst_ports = engee.get_ports("newmodel_1/Terminator")

engee.add_line(src_ports.outputs[1], add_ports.inputs[1])
engee.add_line(add_ports.outputs[1], dst_ports.inputs[1])

# Все линии, подключенные к блоку Add_block
all_add_lines = engee.get_lines("newmodel_1/Add_block")

# Только линии к выходным портам блока Sine Wave
sine_out_lines = engee.get_lines("newmodel_1/Sine Wave", OUT)

# Линии, подключенные к конкретному порту
first_add_input  = add_ports.inputs[1]
lines_to_add_in1 = engee.get_lines(first_add_input)

# Удалить все линии, подключенные к блоку Add_block
engee.delete_line.(engee.get_lines("newmodel_1/Add_block"))
```

Получение соседних портов через линии (порт → линии → порт):

```
some_port = add_ports.inputs[1]

lines = engee.get_lines(some_port)

source_ports = getproperty.(lines, :source)
destination_ports = getproperty.(lines, :destination)
```

**`engee.get_lines`** — *Method*

**`engee.get_logs`** — *Method*

```
engee.get_logs(model::Model)
engee.get_logs()
```

Получает сообщения из журнала, связанные с моделью. Если модель не открыта, то выводит ошибку `No opened model`. Возвращает массив с сообщениями.

**Аргументы**

`m::Model`: модель, относительно которой выполняется операция, по умолчанию — текущая модель.

**Примеры**

```
engee.get_logs()
4-element Vector{Dict{Symbol, String}}:
 Dict(:datetime => "2025-10-27T20:18:38.465684+00:00", :type => "INFO", :content => "Подготовка симуляции завершена за 5.8178 с.")
 Dict(:datetime => "2025-10-27T20:18:39.412789+00:00", :type => "INFO", :content => "Компиляция модели завершена за 1.833 c.")
 Dict(:datetime => "2025-10-27T20:18:39.412896+00:00", :type => "INFO", :content => "Инициализация модели завершена за 0.0903 c.")
 Dict(:datetime => "2025-10-27T20:18:39.842869+00:00", :type => "INFO", :content => "Симуляция модели завершена за 0.764 c.")
```

**`engee.get_param`** — *Function*

```
engee.get_param(model::Model)
engee.get_param(path::String, param::Union{Symbol, String})::Any
engee.get_param(path::String, param::Union{Symbol, String})::Any
engee.get_param(block::Block)
engee.get_param(block::Block, param::Union{Symbol, String})::Any
```

**Для моделей**

- Если указано имя модели, но не указано имя параметра, возвращает настройки симуляции для выбранной модели в виде словаря.
- Если же имя параметра указано, то возвращает значение параметра.

**Аргументы**

- `model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно открыта в графическом интерфейсе. Параметры будут извлечены из этой модели.
- `path::String`: строковый путь к модели, если вместо объекта модели используется путь.
- `param::Union{Symbol, String}`: имя параметра, который нужно извлечь. Может быть строкой или символом.

**Для блоков**

- По пути до блока возвращает либо значение параметра (если указан), либо словарь с параметрами.
- Если же имя параметра указано, то возвращает значение параметра.

**Аргументы**

- `block::Block`: объект блока, для которого нужно извлечь параметры.
- `path::String`: строковый путь к блоку, если вместо объекта блока используется путь.
- `param::Union{Symbol, String}`: имя параметра блока, который нужно извлечь. Может быть строкой или символом.

**Примеры**

```
# Получение словаря всех параметров модели
m = engee.gcm()
params = engee.get_param(m)
```

**`engee.get_ports`** — *Method*

```
engee.get_ports(block_path::AbstractString)::BlockPorts
```

Возвращает структуру `BlockPorts`, содержащую дескрипторы портов указанного блока.

Дескриптор порта — это специальный объект (PortHandle), который однозначно идентифицирует конкретный порт блока внутри модели. Он содержит всю необходимую информацию для работы с портом: к какому блоку он относится, его тип (вход, выход, `acausal`) и индекс внутри блока.

Дескриптор не является значением сигнала, а служит указателем на порт, который можно передавать в другие функции, такие как

- `engee.add_line(src::PortHandle, dst::PortHandle)`;
- `engee.delete_line(src::PortHandle, dst::PortHandle)`;
- `engee.get_lines(port::PortHandle)`.

Так, `PortHandle` — это «ручка» («handle») для программной работы с портами в моделях **Engee**.

**Аргументы**

`block_path::AbstractString`: путь до блока в иерархии модели. Формат записи — `"model_name/system_name/block_name"` или `"model_name/block_name"` для блока в корневой системе.

**Возвращаемое значение**

`BlockPorts`: структура с тремя словарями портов:

- `inputs::IntStringDict{PortHandle{IN}}` — входные порты;
- `outputs::IntStringDict{PortHandle{OUT}}` — выходные порты;
- `acausal::IntStringDict{PortHandle{ACAUSAL}}` — ненаправленные порты.

Порты доступны как по индексу (`ports.outputs[1]`), так и по имени порта (`ports.outputs["main_out"]`).

**Физическое моделирование**

Для блоков физического моделирования ненаправленные порты находятся в словаре `ports.acausal`. Имена таких портов зависят от конкретного блока (например `"p"`, `"n"`, `"pin"`). Чтобы узнать доступные имена портов, используйте `collect(keys(ports.acausal))`.

**Примеры**

```
engee.add_block("/Basic/Sources/Sine Wave",      "newmodel_1/Sine Wave")
engee.add_block("/Basic/Sinks/Terminator",       "newmodel_1/Terminator")
engee.add_block("/Basic/Math Operations/Add",    "newmodel_1/Add_block")

# Получение портов блоков в модели newmodel_1
src_ports = engee.get_ports("newmodel_1/Sine Wave")
dst_ports = engee.get_ports("newmodel_1/Terminator")

# Доступ по индексу
first_src_out = src_ports.outputs[1]
first_dst_in  = dst_ports.inputs[1]

# Порты блока Add_block также доступны по индексам
add_ports = engee.get_ports("newmodel_1/Add_block")

sum_in1 = add_ports.inputs[1]
sum_in2 = add_ports.inputs[2]
sum_out = add_ports.outputs[1]

# Получение портов блока с именованными портами (порты должны быть предварительно именованы)
add_ports = engee.get_ports("newmodel_1/Add_block")

sum_in1 = add_ports.inputs["in1"]
sum_in2 = add_ports.inputs["in2"]
sum_out = add_ports.outputs["out"]

# Вывод
# CommandControlTypes.PortHandle{CommandControlTypes.OUT}(Base.UUID("b99ea18d-6ffa-4366-bc4f-43ea5438c530"), Base.UUID("746c1521-0c13-465e-8d26-e4d7f8729e52"), Base.UUID("e23e6f8a-0811-4f91-a597-707c501be315"), Base.UUID("e72aa3ab-7a60-4c4b-a8f1-f2bca8985747"), 1)
```

Получение ненаправленных портов физического блока:

```
r_ports = engee.get_ports("model/Resistor")

# Список имен acausal-портов
collect(keys(r_ports.acausal))

p = r_ports.acausal["p"]
n = r_ports.acausal["n"]
```

**`engee.get_results`** — *Method*

```
engee.get_results(model_name::String)
engee.get_results(model::Model)
engee.get_results()
```

Возвращает результаты последней симуляции модели в виде словаря `Dict{String, DataFrame}`, где ключ — имя отслеживаемого порта. Если модель не открыта, то выводит ошибку `NoModelOpenedException`. Если симуляция не запущена, то выводит ошибку `ModelIsNotRunningException`.

**Аргументы**

`model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно открыта в графическом интерфейсе. Операция возвращения результатов последней симуляции будет выполняться относительно этой модели.

**Примеры**

```
m = engee.load("start/examples/powersystems/models/power_line_apv.engee")
results1 = engee.run(m);
results2 = engee.get_results(m)
Dict{String, DataFrame} with 6 entries:
  "Va" => 40001×2 DataFrame…
  "Ia" => 40001×2 DataFrame…
  "Ib" => 40001×2 DataFrame…
  "Ic" => 40001×2 DataFrame…
  "Vc" => 40001×2 DataFrame…
  "Vb" => 40001×2 DataFrame…
results1 == results2
true
```

**`engee.get_status`** — *Method*

```
engee.get_status()::SimulationStatus
engee.get_status(model_name::String)::SimulationStatus
engee.get_status(model::Model)::SimulationStatus
```

Возвращает статус симуляции как объект типа `SimulationStatus`. Возвращает один из статусов симуляции модели:

- `NOT_READY`;
- `READY`;
- `BUILDING`;
- `RUNNING`;
- `PAUSED`;
- `STARTED`;
- `ERROR`;
- `STOPPED`;
- `DONE`.

**Аргументы**

- `model_name::String`: имя модели, для которой нужно получить статус.
- `model::Model`: объект модели типа `Model`, для которой нужно получить статус.

**Примеры**

```
engee> engee.get_status()
READY
```

**`engee.info`** — *Method*

```
engee.info(info_message::String)
```

Передает информационное сообщение в окно диагностики моделей. Функция вызывается только внутри обратных вызовов блоков (в том числе маскированных). В сообщениях можно ссылаться на имена параметров в рабочей области (в окне переменных) через `$имя_параметра`.

**Аргументы**

`info_message::String`: передаваемое информационное сообщение.

**Примеры**

```
# Пример без ссылки на параметры рабочего пространства
engee.info("Модель успешно инициализирована!")

# Сообщение в окне диагностики:
# Модель успешно инициализирована!

# Пример со ссылкой на параметры рабочего пространства
engee.info("Модель успешно инициализирована с параметрами $Kp и $Ki!")

# Сообщение в окне диагностики:
# Модель успешно инициализирована с параметрами 1.4 и 1.8!
```

**`engee.is_dirty`** — *Method*

```
engee.is_dirty(model::Model)::Bool
engee.is_dirty(model_name::String)::Bool
```

Проверяет, есть ли несохраненные изменения модели. Возвращает `true` при наличии несохраненных изменений, иначе — `false`. Если модель уже закрыта, то возвращает `false`. На открытой недавно модели может возвращать `true` в случае, если модель открыта из файла старой версии (модель будет обновлена при сохранении).

**Аргументы**

- `model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно выбрана текущей моделью.
- `model_path::String`: путь до модели.

**Примеры**

```
# Проверка текущей модели
model = engee.gcm()
engee.is_dirty(model)

# Проверка по имени модели
engee.is_dirty("newmodel_1")
```

**`engee.load`** — *Method*

```
engee.load(file_path::String; name::Maybe{String}=nothing, force::Bool=false)::Model
```

Загружает модель из файла с расширением `.engee`, расположенного по пути `file_path`. Возвращает объект `Model`. Загруженная модель становится текущей моделью, а ее корневая система — текущей системой.

**Особенности**

- Идентификатором «уже загруженной» модели в рамках сессии выступает имя модели (либо считанное из файла, либо заданное через `name`).
- Если модель с таким именем уже загружена:

  - При `force=false` (по умолчанию) функция возвращает модель из памяти и не перечитывает файл по указанному пути (в т.ч. если `file_path` указывает на другой файл/директорию, но имя модели совпадает);
  - При `force=true` выполняется принудительная повторная загрузка из файла по указанному пути; все несохраненные изменения в текущей модели с этим именем будут утеряны.
- Чтобы загрузить несколько файлов, у которых внутри одинаковое имя модели, указывайте уникальный `name` (иначе будет использована уже открытая модель из памяти).
- Для пакетной обработки (конвертация/сохранение множества моделей) рекомендуется либо вызывать `engee.load(...; force=true)` при каждом открытии, либо закрывать модель после сохранения (например, `engee.close(...)`/`engee.close()`), чтобы не оставлять ее в памяти между итерациями.
- Если файл не существует или имеет другое расширение, то будет выброшено исключение.

**Аргументы**

- `file_path::String`: абсолютный или относительный путь к файлу модели с расширением `.engee`.
- `name::Maybe{String}`: имя, под которым модель будет загружена в текущую сессию. Если не указано, используется имя, сохраненное в файле.
- `force::Bool`: флаг принудительной загрузки.

  - `false` — если модель с таким именем уже загружена, возвращается экземпляр из памяти (файл не перечитывается);
  - `true` — принудительно загружает модель из файла по указанному пути даже если модель с таким именем уже загружена (несохраненные изменения будут потеряны).

**Примеры**

```
# Обычная загрузка (force = false по умолчанию)
engee.load("NewModel.engee")
Model(
        name: NewModel
        id: 6b59d80d-8b48-419d-83e7-a90660aa1a6a
)

# Повторная загрузка той же модели при force=false
# (если модель с именем NewModel уже открыта, то вернется она же из памяти)
engee.load("NewModel.engee"; force = false)
Model(
        name: NewModel
        id: 6b59d80d-8b48-419d-83e7-a90660aa1a6a
)

# Принудительная загрузка из файла по указанному пути (force=true)
# Модель будет заново загружена из файла. Несохраненные изменения текущей модели будут потеряны.
engee.load("NewModel.engee"; force = true)
Model(
        name: NewModel
        id: 6b59d80d-8b48-419d-83e7-a90660aa1a6a
)
```

**`engee.log`** — *Method*

```
engee.log(message::String)
```

Записывает сообщение в журнал событий (лог). Функция вызывается только внутри обратных вызовов блоков (в том числе маскированных). В сообщениях можно ссылаться на имена параметров в рабочей области (в окне переменных) через `$имя_параметра`.

**Аргументы**

`message::String`: текстовое сообщение для записи в лог.

**Примеры**

```
engee.log("Условие выполнено за $time" секунд)
Условие выполнено за 6.7538 секунд
```

**`engee.model`** — *Function*

```
engee.model(model_name::String, phase::Symbol)
engee.model(model_name::String,
            t::Union{Float64, Nothing},
            x::Union{Vector{Float64}, Float64, Nothing},
            u::Union{Vector{Float64}, Float64, Nothing},
            phase::Symbol)
```

Выполняет вычисления модели на указанной фазе моделирования без запуска полной симуляции. Позволяет получать служебную информацию о размере задачи, выходы и производные состояний и используется во внутренних алгоритмах (поиск рабочих точек, линеаризация). Не предназначена для пошаговой отладки и не заменяет публичный метод `engee.run`.

Функция работает, только если файл модели с именем model\_name открыт.

**Аргументы**

- `model_name::String`: имя модели.
- `t::Union{Float64, Nothing}`: момент времени моделирования. Используется для фаз `:outputs` и `:derivatives`. Для фазы `:sizes` может быть `nothing` и игнорируется.
- `x::Union{Vector{Float64}, Float64, Nothing}`: вектор или скаляр состояний модели. Для моделей без состояний может быть `nothing`. Для фазы `:sizes` игнорируется.
- `u::Union{Vector{Float64}, Float64, Nothing}`: вектор или скаляр входных сигналов модели. Если модель не содержит входных портов, должно быть `nothing`. Для фазы `:sizes` игнорируется.
- `phase::Symbol`: фаза моделирования. Поддерживаются значения:

  - `:sizes`: определение размеров задачи моделирования (количества состояний, входов/выходов и частот дискретизации);
  - `:outputs`: вычисление выходов модели при заданных `t`, `x`, `u`;
  - `:derivatives`: вычисление производных непрерывных состояний при заданных `t`, `x`, `u`.

**Возвращаемые значения**

В зависимости от значения `phase` поведение функции будет изменяться следующим образом:

- `phase == :sizes`

  - Возвращается кортеж:

    - `sys` — вектор целых чисел, содержащий информацию о структуре модели:

      - `sys[1]` — количество непрерывных состояний;
      - `sys[2]` — количество дискретных состояний;
      - `sys[3]` — количество выходов модели;
      - `sys[4]` — количество входов модели;
      - `sys[5]` — количество частот дискретизации (sample time) в модели.
    - `blks` — имена блоков с состояниями.
    - `x0` — начальные значения состояний модели. Если модель не содержит блоков с состояниями, возвращается `nothing`.
- `phase == :outputs`

  - Возвращается:

    - `y::Union{Vector{Float64}, Float64, Nothing}` — выходы модели при заданных `t`, `x`, `u`.
    - Если модель не содержит выходных портов, возвращается `nothing`.
    - Элементы вектора `y` упорядочены в соответствии с полными именами выходных блоков.
- `phase == :derivatives`

  - Возвращается:

    - `dx::Union{Vector{Float64}, Float64, Nothing}` — производные непрерывных состояний при заданных `t`, `x`, `u`.
    - Если модель не содержит непрерывных состояний, возвращается `nothing`.
    - Элементы вектора `dx` упорядочены в соответствии с полными именами блоков, содержащих состояния.

**Ограничения**

Функция поддерживает:

- Непрерывные модели;
- Дискретные модели;
- Модели без блоков, содержащих состояния;
- Модели с виртуальными подсистемами (Subsystem);
- Модели с атомарными подсистемами (Atomic Subsystem);
- Модели, включающие модели-ссылки.

Функция не поддерживает модели, содержащие:

- Условно исполняемые подсистемы (enabled, triggered);
- Подсистемы с блоком Action Port;
- Блоки `Engee Function`;
- Блоки `C Function`;
- Блоки `Chart`;
- Блоки `Bus Creator`, `Bus Selector`, `Bus Assignment`;
- Блоки физического моделирования.

**Ошибки**

При нарушении условий вызова могут быть сгенерированы ошибки:

- Модель не существует или не открыта: `The model "model_name" doesn't exist`;
- В модели есть несохраненные изменения: `The model "model_name" has unsaved changes`;
- Модель содержит неподдерживаемые блоки: `The model "model_name" contains unsupported blocks`.

**Примеры**

```
# Определение параметров модели
sys, blks, x0 = engee.model("model_name", :sizes)

# Вычисление выходов модели
t = 0.0
x = [0.0; 0.0; 0.0]
u = 2.0

y = engee.model("model_name", t, x, u, :outputs)

# Вычисление производных состояний
t = 0.0
x = [0.0; 1.0; 1.0]
u = [2.0]

dx = engee.model("model_name", t, x, u, :derivatives)
```

**`engee.open`** — *Method*

```
engee.open(path::String)::System
engee.open(model::Model)::System
engee.open(system::System)::System
```

Возвращает открытую систему `System`. Если модели или системы не существует, то завершается ошибкой `EngeeException`.

**Особенности**

- В параметре указано название `model_name` открытой ранее модели, то она становится текущей моделью. Ее корневая система становится текущей системой.
- В параметре указан путь до существующей системы `system_path`, то содержащая ее модель становится текущей моделью, а сама система — текущей системой, которая отображается в визуальном редакторе. Возвращает `System`. Также вместо пути можно передать непосредственно экземпляр `Model` или `System`.

**Аргументы**

- `path::String`: путь к модели или системе.
- `model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно выбрана текущей моделью. По умолчанию — текущая модель.
- `system::System`: объект типа `System`.

**Примеры**

```
# open model:
s1 = engee.open("NewModel")
System(root)
engee.gcm(), engee.gcs()
(Model(
        name: NewModel
        id: 6b59d80d-8b48-419d-83e7-a90660aa1a6a
)
, System(
        name: root
        id: 69f5da6f-250d-4fa7-a25f-645bac751aea
)
)
# open system:
engee.open("AnotherModel/Subsystem-1")
System(
        name: root
        id: 69f5da6f-250d-4fa7-a25f-645bac751aea
)
engee.gcm(), engee.gcs()
(Model(
        name: AnotherModel
        id: 6b59d80d-8b48-419d-83e7-a90660aa1a6a
)
, System(
        name: Subsystem-1
        id: 69f5da6f-250d-4fa7-a25f-645bac751aea
)
)
```

**`engee.pause`** — *Method*

```
engee.pause()
```

Приостанавливает запущенную симуляцию.

**`engee.rename_model`** — *Method*

```
engee.rename_model(old_name::AbstractString, new_name::AbstractString)
```

Переименовывает модель. Изменяет имя модели с `old_name` на `new_name`.

**Аргументы**

- `old_name::AbstractString`: текущее имя модели.
- `new_name::AbstractString`: новое имя модели.

**Примеры**

```
# Переименование модели по имени
engee.rename_model("OldModel", "NewModel")

# Проверка что модель переименована
engee.gcm()  # Теперь показывает NewModel
```

**`engee.reset`** — *Method*

```
engee.reset()
```

Перезапускает ядро симуляции.

**Примеры**

```
engee.reset()
[ Info: Simulation kernel has been reseted.
```

**`engee.resume`** — *Method*

```
engee.resume(; verbose::Bool = false)
```

Возобновляет приостановленную симуляцию.

**Аргументы**

`verbose::Bool = false`: включает вывод сообщений о ходе выполнения симуляции.

**`engee.rmpath`** — *Method*

```
engee.rmpath(path::String)
```

Удаляет путь из системной переменной `LOAD_PATH`. `LOAD_PATH` — это системная переменная, которую **Engee** использует для поиска нужных исполняемых объектов (например `.engee`, `.ngscript`), а также любых других путей, используемых в командах.

**Аргументы**

`path::Vararg{String}`: путь в файловой системе, который необходимо удалить из `LOAD_PATH`.

**Примеры**

```
engee.addpath("/user/models")

# Загрузка модели
engee.load("model.engee")
engee.rmpath("/user/models")

# Загрузка модели выдаст ошибку
engee.load("model.engee")
```

**`engee.run`** — *Method*

```
engee.run(; verbose::Bool=false)
engee.run(model; verbose::Bool=false) where {model <: Union{Model, System, AbstractString}}
```

Запускает исполнение модели. Если модель не указана, то запускает симуляцию текущей модели. Если модель не открыта, то бросает исключение `NoModelOpenedException`.

**Аргументы**

- `verbose`: флаг вывода прогресса исполнения на печать (по умолчанию равен `false` — не выводится).
- `m::Model`: модель, относительно которой выполняется операция. По умолчанию — текущая модель.

**Примеры**

```
# Запуск текущей модели
engee.run()

# Запуск с выводом прогресса
engee.run(verbose=true)

# Запуск конкретной модели
m = engee.load("/user/start/examples/power_systems/power_line_apv/power_line_apv.engee")
engee.run(m)

# Асинхронное бесконечное моделирование
m = engee.load("/user/start/examples/controls/PID_controller/pid_controls_tf_stable.engee")
engee.set_param!(m, "StopTime" => Inf)
ch = Channel(c -> put!(c, engee.run(m)))
sleep(10)
engee.stop()
take!(ch)
```

**`engee.save`** — *Method*

```
engee.save(model_name::String, file_path::String; force::Bool = false)
engee.save(model::Model, file_path::String; force::Bool = false)
```

Сохраняет модель с именем `model_name` по пути `file_path` в файл с расширением `.engee`. Если необходимо, то создаются промежуточные директории. Возвращает `nothing`.

**Аргументы**

- `model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно открыта в графическом интерфейсе.
- `model_name::String`: желаемое имя модели в системе.
- `file_path::String`: директория сохраняемой модели.
- `force::Bool`: по умолчанию равен `false`. Если файл уже существует и параметр равен `true`, то перезаписывает файл. Если равен `false`, то завершается ошибкой `FileAlreadyExists`.

**Примеры**

```
# Сохраняет модель newmodel_1 в новый файл newmodel_1.engee
engee.save("newmodel_1", "newmodel_1.engee")

# Сохраняет модель newmodel_1 в файл newmodel_1.engee (перезапывает файл)
engee.save("newmodel_1", "newmodel_1.engee", force = true)
```

**`engee.screenshot`** — *Method*

```
engee.screenshot(to_print::Union{Model, String, System}, save_path::String; position_mode::String="auto")
```

Сохраняет скриншот модели/системы в файл по пути `save_path`. Поддерживаемые форматы: PNG, SVG. В других случаях ошибка выводится ошибка `ErrorException("unsuported picture format: <FORMAT>")`. Позиционирование: "auto", "tiled", в других случаях применится "auto".

**Аргументы**

- `to_print::Union{Model, String, System}`: имя модели, с которой будет делаться скриншот.
- `save_path::String`: путь для сохранения скриншота.
- `position_mode::String` : позиционирование скриншота. Используются следующие режимы: `"auto"` — автоматически определить оптимальное расположение блоков (стандартный режим); `"tiled"` — разложить блоки сеткой, чтобы избежать наложений и сделать структуру более читаемой. Любое другое значение воспринимается как `"auto"`.

**Примеры**

```
engee.screenshot(loaded_model, "/user/saved.png"[; position_mode="tiled"])
```

**`engee.set_log`** — *Method*

```
engee.set_log(system_path::AbstractString, port_path::AbstractString)
engee.set_log(system::System, port_path::AbstractString)
engee.set_log(port_path::AbstractString)
```

Устанавливает порт на логирование.

**Аргументы**

- `system_path::AbstractString`: путь до системы, в которой находится порт.
- `system::System`: система, в которой находится порт.
- `port_path::AbstractString`: относительный путь до порта. Если система не предоставлена в качестве первого параметра, то используется открытая система по умолчанию.

**Примеры**

```
engee.set_log("Sine Wave/1")

# Порт блока Sine Wave в текущей системе установлен на запись
engee.set_log("newmodel_1/Subsystem","Sine Wave/1")

# Порт блока Sine Wave в системе newmodel_1/Subsystem установлен на запись
system = engee.gcs()
engee.set_log(system, "Sine Wave/1")

# Порт блока Sine Wave в системе system установлен на запись
engee.run()
Dict{String, DataFrames.DataFrame} with 1 entry:
  "Sine Wave.1" => 1001×2 DataFrame…
```

**`engee.set_param!`** — *Function*

```
engee.set_param!(model::Model | model_name::String, param::Pair...)
```

Обновляет параметры моделей. Возвращает `nothing`. Если параметры некорректны, то возникает ошибка.

**Аргументы**

- `model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно открыта в графическом интерфейсе. Параметры будут обновлены для этой модели.
- `model_name::String`: строковый путь или имя модели.
- `param::Pair...`: один или несколько параметров в формате `"name" => value`. Если параметр имеет единицы измерения, его значение необходимо передавать в виде словаря `Dict("value" => ..., "unit" => ...)`, где `"value"` — числовое значение, а `"unit"` — строка с единицей измерения (например `"V"`, `"Hz"`, `"deg"`, `"s"` и т.д.).

**Примеры**

```
engee.set_param!(
    "my_model",
    "amplitude" => Dict("value" => 5.0, "unit" => "V"),
    "frequency" => Dict("value" => 50.0, "unit" => "Hz")
)
```

Пример показывает задание параметров с единицами измерения.

```
engee.set_param!("model_1", "SolverName" => "ode45", "StopTime" => "10")

# Получаем параметры модели model_1
param_1 = engee.get_param("model_1")

# Копируем параметры из model_1 в model_2
engee.set_param!("model_2", param_1)
```

Пример показывает, как изменить только один параметр блока (амплитуду), сохранив все остальные параметры неизменными. Используйте такой подход, когда нужно точечно модифицировать настройки блока без риска сброса других параметров.

```
# Получаем текущие параметры Sine Wave
sine_params = engee.get_param("newmodel_1/Sine Wave")

# Создаем копию всех параметров и изменяем только один
modified_params = copy(sine_params)
modified_params["Amplitude"] = "2.5"  # изменяем только амплитуду

# Применяем все параметры (остальные остаются как были)
engee.set_param!("newmodel_1/Sine Wave", pairs(modified_params)...)
```

Структура настроек симуляции привязывается к конкретной модели — можно изменять настройки модели непосредственно через задание полей структуры, тогда:

```
params = engee.get_param("newmodel_1")

# Структура params привязана к конкретной model, аналогично engee.set_param!("newmodel_1", "FixedStep" => "0.05")
params["FixedStep"] = "0.05"
0.05
```

Изменение значений в словаре `params` не обновляет параметры модели автоматически — это локальная копия. Чтобы изменения вступили в силу, нужно передать словарь обратно с помощью `engee.set_param!`.

```
params = engee.get_param("newmodel_1")
params["FixedStep"] = "0.05"
params["SolverName"] = "Euler"
engee.set_param!("newmodel_1", "FixedStep" => params["FixedStep"], "SolverName" => params["SolverName"])
```

Каждый параметр должен быть представлен как пара (Pair), состоящая из имени параметра и его значения (например `"StartTime" => 0.0`). Для параметра `param`:

**Параметры симуляции**

- `StartTime::String`: время начала симуляции (Float64).
- `StopTime::String`: время окончания симуляции (Float64). Чтобы задать бесконечное время симуляции, передайте строку `"Inf"` или `"inf"` (`engee.set_param!("model_name", "StopTime" => "Inf")`).
- `SolverType::String`: тип решателя (`fixed-step` или `variable-step`).
- `SolverName::String`: имя решателя (зависит от выбранного типа).

**Параметры для fixed-step**

`FixedStep::String`: шаг симуляции (Float64).

**Параметры для variable-step**

- `AbsTol::String`: абсолютная точность (Float64 или 'auto').
- `RelTol::String`: относительная точность (Float64 или 'auto').
- `InitialStep::String`: начальный шаг (Float64 или 'auto').
- `MaxStep::String`: максимальный шаг (Float64 или 'auto').
- `MinStep::String`: минимальный шаг (Float64 или 'auto').
- `OutputTimes::String`: интервал вывода (Float64 или 'auto').
- `DenseOutput::Bool`: плотный вывод результатов.

**`engee.stop`** — *Method*

```
engee.stop()
```

Останавливает запущенную симуляцию.

**`engee.unset_log`** — *Method*

```
engee.unset_log(system_path::String, port_path::String)
engee.unset_log(system::System, port_path::String)
engee.unset_log(port_path::String)
```

Снимает порт с записи.

**Аргументы**

- `system_path::String`: система, в которой находится порт.
- `system::System`: система, в которой находится порт.
- `port_path::String`: относительный путь до порта. Если система не предоставлена в качестве первого параметра, то используется открытая система по умолчанию.

**Примеры**

```
engee.set_log("Sine Wave/1")

# Порт блока Sine Wave в текущей системе установлен на запись
engee.run()
Dict{String, DataFrames.DataFrame} with 1 entry:
  "Sine Wave.1" => 1001×2 DataFrame…

# Запустили симуляцию и получили результаты
engee.unset_log("Sine Wave/1")

# Порт блока Sine Wave в текущей системе снят с записи
engee.run()
Dict{String, DataFrames.DataFrame}()
```

**`engee.update_params`** — *Function*

```
engee.update_params()
engee.update_params(model::Model)
engee.update_params(model_name::String)
```

Обновляет параметры работающей симуляции, пересчитывая их текущие значения из рабочего пространства.

Функция позволяет динамически применять изменения параметров в рабочем пространстве к уже запущенной симуляции без необходимости ее остановки и перезапуска. Если работающей симуляции нет, то функция ничего не делает.

Может принимать в качестве необязательного аргумента имя модели или объект модели, для которой нужно применить обновление параметров. Эта функциональность эквивалентна нажатию кнопки «Скомпилировать модель» во время выполнения симуляции.

**Аргументы**

- `model::Model`: объект модели, который может быть загружен в память с помощью функции `engee.gcm`. Эта модель может быть активной в рабочем пространстве, но не обязательно открыта в графическом интерфейсе.
- `model_name::String`: имя модели, параметры которой нужно пересчитать.

**Примеры**

```
# Обновляет параметры всех блоков в текущей симуляции
engee.update_params()

# Обновляет параметры указанной модели
model = engee.gcm()
engee.update_params(model)

# Обновляет параметры модели по имени
engee.update_params("newmodel_1")
```

**`engee.version`** — *Method*

```
engee.version()
```

Возвращает короткую версию **Engee**.

**Примеры**

```
engee.version()
"25.11.2"
```

**`engee.warning`** — *Method*

```
engee.warning(warning_message::String)
```

Передает сообщение-предупреждение в окно диагностики моделей. Функция вызывается только внутри обратных вызовов блоков (в том числе маскированных). В сообщениях можно ссылаться на имена параметров в рабочей области (в окне переменных) через `$имя_параметра`.

**Аргументы**

`warning_message::String`: передаваемое сообщение-предупреждение.

**Примеры**

```
# Пример без ссылки на параметры рабочего пространства
engee.warning("Параметры округлены, результаты могут быть неточными!")

# Сообщение в окне диагностики:
# Параметры округлены, результаты могут быть неточными!

# Пример со ссылкой на параметры рабочего пространства
engee.warning("Параметры округлены до $Nd и $Ns, результаты могут быть неточными!")

# Сообщение в окне диагностики:
# Параметры округлены до 1.7 и 1.3, результаты могут быть неточными!
```

## Методы конечных автоматов

- [`engee.sm.add_data`](#engee.sm.add_data)
- [`engee.sm.add_junction`](#engee.sm.add_junction)
- [`engee.sm.add_state`](#engee.sm.add_state)
- [`engee.sm.add_transition`](#engee.sm.add_transition)

**`engee.sm.add_data`** — *Function*

```
engee.sm.add_data(chart_path, scope, name; value, idx)::Nothing
```

Добавляет переменную или событие в блок Chart (конечный автомат).

**Аргументы**

- `chart_path::String`: путь до блока Chart.
- |  |  |  |  |
  | --- | --- | --- | --- |
  | `scope::Symbol`: тип события/данных. Может принимать значения: `:input` | `:output` | `:local` | `:event`. |
- `name::String`: имя переменной.
- `value::Any`: значение переменной. Отсутствует по умолчанию.
- `idx::Int`: порядковый номер порта. Актуально для переменных типа `:input` и `:output`.

**`engee.sm.add_junction`** — *Function*

```
engee.sm.add_junction(path; type)::Tuple{UUID, String, String}
```

Создание узла и узла памяти внутри блока Chart (конечного автомата). Степень вложенности определяется параметром `path`. Возвращает `Tuple` содержащий `UUID` узла, тип узла, путь до него.

**Аргументы**

- `path::String`: путь до состояния или путь до блока Chart, в который добавляется новый узел.
- |  |  |
  | --- | --- |
  | `type::String`: тип узла: `"history"` (для узла памяти) | `nothing`. |

**Примеры**

```
# Создание обычного узла в Chart
junction_id, junction_type, junction_path = engee.sm.add_junction("newmodel_1/Chart")

# Создание узла памяти
junction_id, junction_type, junction_path = engee.sm.add_junction(
    "newmodel_1/Chart",
    type="history"
```

**`engee.sm.add_state`** — *Function*

```
engee.sm.add_state(path, name; content)::Tuple{UUID, String, String}
```

Создает состояние внутри блока Chart (конечного автомата). Степень вложенности определяется параметром `path`. Возвращает `Tuple` содержащий `UUID` состояния, название состояния, путь до него.

**Аргументы**

- `path::String`: путь до родительского состояния или до блока Chart, в который добавляется новое состояние.
- `name::String`: название нового состояния.
- `content::String`: весь код состояния, код может содержать в себе следующие секции:

  - `entry`: код для секции `entry`, исполняемый в момент перехода в состояние;
  - `during`: код для секции `during`, исполняемый в момент активности состояния;
  - `exit`: код для секции `exit`, исполняемый в момент выхода из состояния.

**Примеры**

```
# Создание простого состояния в Chart
state_id, state_name, state_path = engee.sm.add_state("newmodel_1/Chart", "State1")
(Base.UUID("a511fb4d-44cc-45dc-bfb0-74f6f9791239"), "State1", "newmodel_1/Chart/State1")

# Создание состояния с кодом
state_id, state_name, state_path = engee.sm.add_state(
     "newmodel_1/Chart",
     "ActiveState",
     content="""
     entry:
         disp('Вход в активное состояние');
     during:
         counter = counter + 1;
     exit:
         disp('Выход из активного состояния');
     """
)
(Base.UUID("6c8d02d4-da4a-4393-9458-ac381a627520"), "ActiveState", "newmodel_1/Chart/ActiveState")
```

**`engee.sm.add_transition`** — *Function*

```
engee.sm.add_transition(chart_path, source, destination)::Tuple{UUID, String}
```

Создает переход внутри блока Chart (конечного автомата). Возвращает `Tuple` содержащий `UUID` перехода и путь до системы в которой он содержится.

**Аргументы**

- `chart_path::String`: путь до блока Chart.
- `source::Maybe{String}`: путь до состояния объекта источника.
- `destination_id::UUID`: UUID целевого состояния/узла.
- `trigger::Maybe{String}`: триггер для выполнения кода.
- `action::Maybe{String}`: код, исполняемый при выполнении условия в `condition`.
- `condition::Maybe{String}`: условие для выполнения кода.
- `content::Maybe{String}`: весь код перехода (в т.ч. условие - condition, trigger, action).
- `origin::Maybe{String}`: положение начальной точки перехода по умолчанию (принадлежность начальной точки какому-либо состоянию, либо глобальному состоянию).

## Полезные ссылки

1. [Командная строка](../tutorial/command-line.html)
2. [Программное управление моделированием](programmatic-modeling.html)
3. [Редактор скриптов](../guide/script-editor.html)
