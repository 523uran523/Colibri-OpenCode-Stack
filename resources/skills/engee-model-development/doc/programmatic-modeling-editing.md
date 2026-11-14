Source: https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-editing.html

# Программное редактирование моделей

## Работа с моделями

### Добавление блока

Перед редактированием модели откройте ее с помощью метода [open](programmatic-modeling-functions.html#engee.open). После редактирования не забудьте сохранить результаты с помощью [save](programmatic-modeling-functions.html#engee.open).

Для добавления блока используется публичный метод [add\_block](programmatic-modeling-functions.html#engee.add_block)

```
engee.add_block(lib_block_path, tgt_block_path)
```

- Добавляет копию блока из `lib_block_path` в `tgt_block_path`.
- `lib_block_path` — полный путь до блока в модели или библиотеке. Путь `lib_block_path` можно увидеть при двойном нажатии по свободной области рабочего пространства и набрав имя нужного блока:

  ![block path add method](/helpcenter/stable/_next/static/media/how_to_work_engee/block-path-add-method.png)

- `tgt_block_path` — путь до системы и ожидаемое имя. Если имя не указано, то задается автоматически.
- Если путь до существующего блока модели совпадает с путем до блока из библиотеки из-за совпадения имен модели и ее систем с названиями разделов библиотеки, выбирается блок из модели.
- Если в `tgt_block_path` последним содержится название будущего блока, пробует добавить блок под этим названием.
- Если `tgt_path` не содержит название будущего блока, то название формируется по образцу `<block_type>-<index>`, например `Sin-1`, где индекс является количеством блоков данного типа после добавления, а Sin — это block\_type блока.
- Добавляет в подсистему дополнительный порт при добавлении блок-порта, например, `Inport`.

|  |  |
| --- | --- |
|  | Добавленные блоки не будут показаны сразу. Для отображения блоков необходимо переоткрыть модель (предварительно сохранив ее), переключиться между моделями или перезагрузить страницу. |

*Пример*

```
engee.add_block("/Basic/Math Operations/Add", "newmodel_1/")

engee.add_block("/Basic/Math Operations/Complex to Real-Imag", "newmodel_1/Test_name") # добавит блок из библиотеки в систему и присвоит ему имя Test_name
```


*Ошибки*

- Если название занято, завершается ошибкой `IncorrectBlockNameException`.
- Если путь до блока библиотеки некорректный, то завершается ошибкой `InvalidBlockPathException`.
- Если система, в которую добавляется блок не существует или закрыта, то завершается ошибкой `SystemIsNotExistException`.

### Удаление блока

Используется публичный метод [delete\_block](programmatic-modeling-functions.html#engee.delete_block)

```
engee.delete_block(block_path)
```

- Удаляет блок по указанному пути.
- `block_path` — абсолютный путь до блока в модели по типу `"newmodel_1/Sine Wave"`, где `newmodel_1` — имя модели, а `Sine Wave` — имя блока.
- Также удаляет все связанные с блоком линии и порты.

### Копирование блока

Использование публичного метода [copy\_block](programmatic-modeling-functions.html#engee.copy_block):

```
engee.copy_block(src_block_path::String, tgt_block_path::String)
```

- `src_block_path::String` — полный путь до блока в системе.
- `tgt_block_path::String` — путь до системы и ожидаемое имя. Формат: `path/to/system/newblockname` (если имя не указано то задается автоматически).

Пример:

```
# Добавляет блок с именем Add-3 из модели newmodel_1 в модель newmodel_2
engee.copy_block("newmodel_1/Add-3", "newmodel_2/")

# Добавляет блок с именем Custom Block Name из модели newmodel_1 в модель newmodel_2 под именем Test_name
engee.copy_block("newmodel_1/Custom Block Name", "newmodel_2/Test_name")
```

*Ошибки*

- `IncorrectBlockNameException` — некорректное имя для
  нового блока.
- `InvalidBlockPathException` — копируемого блока не существует по указанному пути.
- `SystemIsNotExistException` — система, в которую добавляется блок не существует.

### Добавление/удаление сигнала

Используются публичные методы [add\_line](programmatic-modeling-functions.html#engee.add_line) и [delete\_line](programmatic-modeling-functions.html#engee.delete_line)

```
# добавляет линии между портами
engee.add_line(src_port, dst_port) = engee.add_line(engee.gcs(), src_port_path, dst_port_path)
engee.add_line(system::String|System, src_port :: String, dst_port :: String)

# удаляет линии между портами
engee.delete_line(src_port, dst_port) = delete_line(gcs(), src_port, dst_port)
engee.delete_line(system, src_port :: String, dst_port :: String)
```

- Добавляет/удаляет линию между портами `src_port_path` и `dst_port_path`, где `src_port` — полный путь до выходгого порта блока, `tgt_port` — полный путь до входного порта блока.
- Если путь указывает на блок-порт подсистемы, то соединяет/отсоединяет саму подсистему по соответствующему порту.
- В остальных случаях блоки соответствующих портов должны находиться в одной системе.
- В качестве названия порта используется его порядковый номер.

*Ошибки*

- `SourceEdgeIsNotOutputPort` — если порт по
  пути src\_port\_path не out порт
- `TargetEgdeIsNotInputPort` — если порт по пути tgt\_port\_path не входной порт.
- `TargetEdgeAlreadyConnected` — если tgt порт уже соединён.
- `NotAcausalPort` — при ненаправленном соединении, если один из портов имеет тип не acausal.
- `LineCannotBeAdded` — если некорректный тип порта или направление линии.

### Запись/чтение параметров блока и сигнала

Используются публичные методы [set\_param!](programmatic-modeling-functions.html#engee.set_param!) и [get\_param](programmatic-modeling-functions.html#engee.get_param)

```
engee.set_param!(blockPath, paramName => paramValue)
engee.get_param(blockPath, paramName)
engee.get_param(blockPath)
engee.set_param!(blockPath, blockParams)
```

- Аналогично `get_param` и `set_param!` для параметров модели.

Вы можете получить параметры не только модели, но и конкретного блока, а также менять их с помощью структуры переменных (назовем `sine_params`), например:

```
# Получаем текущие параметры Sine Wave
sine_params = engee.get_param("newmodel_1/Sine Wave")

# Создаем копию всех параметров и изменяем только один
modified_params = copy(sine_params)
modified_params["Amplitude"] = "2.5"  # изменяем только амплитуду

# Применяем все параметры (остальные остаются как были)
engee.set_param!("newmodel_1/Sine Wave", pairs(modified_params)...)
```

Пример показывает, как изменить только один параметр блока (амплитуду), сохранив все остальные параметры неизменными. Используйте такой подход, когда нужно точечно модифицировать настройки блока без риска сброса других параметров.

|  |  |
| --- | --- |
|  | Все доступные параметры блока можно получить, выделив его мышкой и выполнив команду `engee.get_param(engee.gcb())`. Например, для блока [Константа](../base-lib-sources/constant.html):  ``` engee> engee.get_param(engee.gcb()) BlockParameters(   BlockName => Constant,   Value => 1.0,   OutDataTypeStr => Inherit: auto,   SampleTime => Inf,   BlockType => Constant, ) ``` |

|  |  |
| --- | --- |
|  | Все публичные методы программного управления, доступные в Engee, представлены в статье [Публичные методы программного управления](programmatic-modeling-functions.html). |

## Примеры

```
engee.add_block("/Basic/Sources/Sine Wave", "model_name/Sine Wave-x") #вставляет блок Sine Wave из библиотеки Basic/Sources и присваивает ему имя Sine Wave-x

engee.add_block("/Basic/Sinks/Terminator", "model_name/") #вставляет блок Terminator из библиотеки Basic/Receivers и присваивает имя автоматически (например Terminator-1, если блок с именем Terminator уже существует)

engee.delete_block("newmodel_1/Terminator") #удаляет блок и все связанные с блоком линии и порты

engee.add_line("Sine Wave/1", "Terminator/1")  #устанавливает сигнал между выходным портом №1 у блока Sin Wave и входным портом №1 блока Terminator

engee.delete_line("Sine Wave/1", "Terminator/1") # удаляет сигнал между выходным портом №1 у блока Sin Wave и входным портом №1 блока Terminator

engee.get_param("newmodel_1") # получение параметров моделирования

engee.set_param!("newmodel_1", "StopTime" => 15, "FixedStep" => 0.05) #меняем время окончания симуляции и фиксированный размер шага
```

## Полезные ссылки

1. [Публичные методы программного управления](programmatic-modeling-functions.html)
2. [Командная строка](../tutorial/command-line.html)
3. [Редактор скриптов](../guide/script-editor.html)
