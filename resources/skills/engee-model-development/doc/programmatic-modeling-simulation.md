Source: https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-simulation.html

# Программное управление симуляцией модели

## Работа с моделями

### Запуск симуляции

Перед редактированием модели откройте ее с помощью метода [open](programmatic-modeling-functions.html#engee.open). После редактирования не забудьте сохранить результаты с помощью [save](programmatic-modeling-functions.html#engee.open).

Для запуска симуляции модели используется публичный метод [run](programmatic-modeling-functions.html#engee.run)

```
engee.run(model_name; verbose=false)
engee.run(model; verbose=false)
engee.run(; verbose=false)
```

- Запускает симуляцию модели. Возвращает результаты симуляции.
- Если модель не указана, запускает симуляцию текущей модели.
- При `verbose=true`, выводится прогресс симуляции. По умолчанию `verbose=false`.

*Пример*

```
m = engee.load("/user/start/examples/power_systems/power_line_apv/power_line_apv.engee") #загружает модель из указанного пути присваивает ее переменной m

#другой вариант
m = "power_line_apv"
engee> engee.run(m)
Dict{String, DataFrame} with 6 entries:
    "Va" => 40001×2 DataFrame…
    "Ia" => 40001×2 DataFrame…
    "Ib" => 40001×2 DataFrame…
    "Ic" => 40001×2 DataFrame…
    "Vc" => 40001×2 DataFrame…
    "Vb" => 40001×2 DataFrame…
```

### Приостановка запущенной симуляции

Используется публичный метод [pause](programmatic-modeling-functions.html#engee.pause)

```
engee.pause(model_name)
engee.pause(model)
engee.pause()
```

- Приостанавливает запущенную симуляцию модели. Возвращает `nothing`.

*Ошибки*

Если симуляция не запущена, то выдаст ошибку `Engee.Exceptions.SimulationError("Only running simulation may be paused")`.

### Возобновление приостановленной симуляции

Используется публичный метод [resume](programmatic-modeling-functions.html#engee.resume)

```
engee.resume(model_name)
engee.resume(model)
engee.resume()
```

- Возобновляет приостановленную симуляцию модели. Возвращает результаты симуляции.

### Прерывание симуляции

Используется публичный метод [stop](programmatic-modeling-functions.html#engee.stop)

```
engee.stop(model_name)
engee.stop(model)
engee.stop()
```

- Останавливает запущенную симуляцию модели. Возвращает `nothing`.

### Просмотр результатов симуляции

Используется публичный метод [get\_results](programmatic-modeling-functions.html#engee.get_results)

```
engee.get_results(model_name)
engee.get_results(model)
engee.get_results()
```

- Возвращает результаты симуляции указанной модели в виде словаря Dict, где ключ – имя отслеживаемого порта.
- Если модель не указана, возвращает результаты последней симуляции.
- Метод напрямую связан с переменной simout, хранящей результаты симуляции модели. Более подробно о работе с переменной simout читайте по ссылке [Программная обработка результатов симуляции в Engee](../feature/about-simout.html).

*Пример*

```
engee.get_results("newmodel_1")

#вывод
Dict{String, DataFrames.DataFrame} with 1 entry:
"Integrator.1" => 1001×2 DataFrame…
```


*Ошибки*

- Если модель не открыта, то бросается исключение `Engee.Exceptions.ModelDoesntExistException`.

### Просмотр статуса симуляции модели

Используется публичный метод [get\_status](programmatic-modeling-functions.html#engee.get_status)

```
engee.get_status(model_name)
engee.get_status(model)
engee.get_status()
```

- Возвращает статус симуляции как `SimulationStatus`.

### Просмотр событий симуляции

Используется публичный метод [get\_logs](programmatic-modeling-functions.html#engee.get_logs)

```
engee.get_logs(model_name)
engee.get_logs(model)
engee.get_logs()
```

- Получает сообщения из журнала, связанные с моделью.
- Возвращает массив с сообщениями из журнала, связанные с указанной моделью.

|  |  |
| --- | --- |
|  | Все публичные методы программного управления, доступные в Engee, представлены в статье [Публичные методы программного управления](programmatic-modeling-functions.html). |

## Примеры

```
engee.run("newmodel_1") # запускает симуляцию модели. Возвращает результаты симуляции
engee.pause("newmodel_1") # останавливает запущенную симуляцию модели
engee.resume("newmodel_1") # возобновляет процесс симуляции модели
engee.stop() # останавливает запущенную симуляцию модели
engee.get_results("newmodel_1") # возвращает результаты симуляции в виде словаря Dict
engee.get_status("newmodel_1") # возвращает статус симуляции как SimulationStatus
engee.get_logs("newmodel_1") # получает сообщения из журнала, связанные с моделью
```

## Полезные ссылки

1. [Публичные методы программного управления](programmatic-modeling-functions.html)
2. [Командная строка](../tutorial/command-line.html)
3. [Редактор скриптов](../guide/script-editor.html)
