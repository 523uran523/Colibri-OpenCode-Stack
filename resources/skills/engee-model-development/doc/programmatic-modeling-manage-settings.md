Source: https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-manage-settings.html

# Программное управление параметрами моделирования

## Работа с моделями

### Получение настроек симуляции

Перед редактированием модели откройте ее с помощью метода [open](programmatic-modeling-functions.html#engee.open). После редактирования не забудьте сохранить результаты с помощью [save](programmatic-modeling-functions.html#engee.open).

Для получения настроек симуляции используется публичный метод [get\_param](programmatic-modeling-functions.html#engee.get_param)

```
engee.get_param(model)
engee.get_param("path")
engee.get_param("path", param)
```

- Если указано имя модели, но не указано имя параметра, возвращает настройки симуляции для выбранной модели в виде структуры `ModelParameters`.
- Если же имя параметра указано, возвращает значение параметра.

Все значения настроек симуляции модели могут быть переданы в переменную:

```
m = "example_model"
```

Через `engee.get_param("path", param)` можно вывести значение конкретного параметра модели:

```
engee.get_param(m, :start_time) #выведет значение start_time
```

### Изменение настроек симуляции модели

Используется публичный метод [set\_param!](programmatic-modeling-functions.html#engee.set_param!)

```
engee.set_param!(model_name, param...)
engee.set_param!(model_name, param)
engee.set_param!(model, param...)
engee.set_param!(model, param)
```

- Обновляет выбранные параметры модели `Model` с именем `model_name`.
- Возвращает `nothing`.
- Если в `param` передана структура настроек симуляции, настройки из нее будут скопированы.
- Если параметры некорректны, завершается соответствующей ошибкой.
- Структура настроек симуляции привязывается
  к конкретной модели — можно изменять настройки модели непосредственно через задание полей структуры.

*Вывод*

```
engee.set_param!("model_1", "SolverName"=>"ode45", "StopTime"=>15)
param_1 = engee.get_param("model_1")::ModelParameters
engee.set_param!("model_2", param_1)
```

### Обновление параметров блоков

Для работы с параметрами блоков доступно несколько методов:

Для динамического обновления параметров работающей симуляции удобно использовать [update\_params](programmatic-modeling-functions.html#engee.update_params):

```
engee.update_params()
engee.update_params(model::Model)
engee.update_params(model_name::String)
```

- Пересчитывает параметры работающей симуляции, читая их текущие значения из рабочего пространства.
- Позволяет применять изменения параметров к уже запущенной симуляции без остановки и перезапуска.
- Если симуляция не запущена, функция не выполняет никаких действий.
- Эквивалентно нажатию кнопки «Обновить модель» ![compile button 1](/helpcenter/stable/_next/static/media/about/compile-button-1.png) во время выполнения симуляции.
- Может принимать опционально объект модели или имя модели для целевого обновления.

*Вывод*

```
# Обновить параметры текущей симуляции
engee.update_params()

# Обновить параметры конкретной модели
model = engee.gcm()
engee.update_params(model)

# Обновить параметры модели по имени
engee.update_params("my_model")
```

Также используется публичный метод [set\_param!](programmatic-modeling-functions.html#engee.set_param!)

```
engee.set_param!(block_path, params...)
engee.set_param!(block, params...)
engee.set_param!(block, block_params)
engee.set_param!(block_path, block_params)
```

- Обновляет выбранные параметры блока.
- Если изменяется параметр, который влечет за собой изменения количества портов, или состояния, то количество портов и состояние изменяются согласно переданным значениям параметра.
- Возвращает `nothing`.
- Если в качестве второго параметра передана структура настроек блока, то ее параметры будут скопированы. Если параметры некорректны, то завершается соответствующей ошибкой.

### Изменение настроек симуляции модели с помощью структуры

- Структура настроек симуляции привязывается к конкретной модели — можно изменять настройки модели непосредственно через задание полей структуры.

*Вывод*

```
params = engee.get_param("newmodel_1")
# структура params привязана к конкретной model
params.FixedStep = 0.05
0.05
# аналогично `engee.set_param!(model, "FixedStep" => 0.05)
```

|  |  |
| --- | --- |
|  | Все публичные методы программного управления, доступные в Engee, представлены в статье [Публичные методы программного управления](programmatic-modeling-functions.html). |

## Полезные ссылки

1. [Программное управление моделированием](programmatic-modeling.html)
2. [Публичные методы программного управления](programmatic-modeling-functions.html)
3. [Программное редактирование моделей](programmatic-modeling-editing.html)
4. [Программное управление симуляцией модели](programmatic-modeling-simulation.html)
5. [Командная строка](../tutorial/command-line.html)
6. [Редактор скриптов](../guide/script-editor.html)
