Source: https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-example.html

# Пример программного управления в моделировании

## Введение

В данном примере мы создадим модель с помощью методов программного управления. Наша цель – показать, как можно реализовать модель программно с помощью инструментов рабочего пространства — [командной строки](../tutorial/command-line.html) ![img 41 1 2](/helpcenter/stable/_next/static/media/how_to_work_engee/img-41-1-2.png) и [редактора скриптов](../guide/script-editor.html) ![img41 1](/helpcenter/stable/_next/static/media/how_to_work_engee/img41-1.png).

Для создания модели с помощью методов программного управления откроем командную строку или редактор скриптов Engee. Выбор инструмента не является принципиальным и в случае создания примера не будет отличаться по синтаксису. Однако, редактор скриптов позволит рефакторить уже инициализированные строки кода, что может быть полезным для создания собственных моделей. В дальнейшем будем использовать редактор скриптов.

### Создание/загрузка модели

По умолчанию при запуске Engee создается модель newmodel\_1, с которой мы и будем работать в дальнейшем. Однако, вы можете создать или загрузить другую модель, выбрав нужный вам метод из предложенных ниже:

*Создание/загрузка/открытие модели*

Используйте метод [create](programmatic-modeling-functions.html#engee.create) для создания модели:

```
model = "newmodel_2" # создает переменную model со значением "model_name"
engee.create(model) # создает модель из переменной
```

или создайте модель напрямую без инициализации переменной:

```
engee.create("newmodel_2")
```

Вы можете загрузить уже существующую модель с помощью метода [load](programmatic-modeling-functions.html#engee.load):

```
engee.load("/user/newmodel_2.engee")

# или

engee.load("/user/newmodel_2.engee"; force = true) # force = true обязательно указывается в случае, если модель уже была загружена ранее
```

### Добавление блока

Для начала добавим блоки из библиотеки в нашу модель newmodel\_1 с помощью метода [add\_block](programmatic-modeling-functions.html#engee.add_block):

```
engee.add_block("/Basic/Sources/Sine Wave", "newmodel_1/") # добавляет блок Sin Wave из библиотеки Basic/Sources и присваивает имя автоматически
```

и аналогично для блока Terminator:

```
engee.add_block("/Basic/Sinks/Terminator", "newmodel_1/") # аналогично добавляет блок Terminator, но уже из другой библиотеки
```

|  |  |
| --- | --- |
|  | В данном случае имена присваиваются автоматически, например Terminator сменит имя на Terminator-1, если блок с таким именем уже существует в модели. |

При необходимости вы можете сами задавать имена блокам, добавив их название после слэша `/` имени модели:

```
engee.add_block("/Basic/Sources/Sine Wave", "newmodel_1/Sine Wave-x") #добавит блок Sine Wave с именем Sin Wave-x
```

Удалить ненужный блок можно через метод [delete\_block](programmatic-modeling-functions.html#engee.delete_block):

```
engee.delete_block("newmodel_1/Sine Wave-x") # удалит блок Sine Wave-x и все связанные с ним линии и блоки из системы
```

### Добавление линий

Добавим соединительную сигнальную линию между добавленными блоками с помощью метода [add\_line](programmatic-modeling-functions.html#engee.add_line):

```
engee.add_line("Sine Wave/1", "Terminator/1")  # устанавливает сигнал между выходным портом №1 у блока Sin Wave и входным портом №1 блока Terminator
```

|  |  |
| --- | --- |
|  | Включите [запись сигналов](../feature/logging-engee.html) для созданной сигнальной линии между блоками **Sin Wave** и **Terminator**, нажав левой кнопкой мыши по сигналу и выбрав **Запись**:  signal log modeling  Это необходимо для получения данных с блока после завершения симуляции модели. |

### Настройка параметров модели

Получим параметры модели с помощью метода [get\_param](programmatic-modeling-functions.html#engee.get_param):

```
engee.get_param("newmodel_1") - # получение параметров моделирования
```

*Вывод get\_param с постоянным шагом*

```
ModelParameters(
  :EnableMultiTasking => false
  :GenerateComments => true

  #Параметры интегратора:
  :StartTime => 0.0
  :StopTime => 10
  :SolverType => fixed-step
  :SolverName => Euler
  :FixedStep => 0.01
)
```

Перечень настраиваемых параметров моделей отличается в зависимости от выбранного шага (постоянного или переменного). Например, get\_param для упомянутой выше модели с переменным шагом будет показывать следующие параметры:

*Вывод get\_param с переменным шагом*

```
ModelParameters(
  :EnableMultiTasking => false
  :GenerateComments => true

  #Параметры интегратора:
  :StartTime => 0.0
  :StopTime => 10
  :SolverName => Tsit5
  :SolverType => variable-step
  :MaxStep => auto #максимальный размер шага
  :MinStep => auto #минимальный размер шага
  :InitialStep => auto #начальный размер шага
  :RelTol => auto #относительная точность
  :AbsTol => auto #абсолютная точность
  :OutputOption => true #плотная выдача
  :OutputTimes => 1e-2 #интервал
)
```

Изменим несколько параметров модели с помощью метода [set\_param!](programmatic-modeling-functions.html#engee.set_param!):

```
engee.set_param!("newmodel_1", "FixedStep" => 0.05, "StopTime" => 40) # меняем фиксированный размер шага и время окончания симуляции
```

Далее повторно используем [get\_param](programmatic-modeling-functions.html#engee.get_param) для отслеживания изменения параметров:

*Вывод get\_param с измененными параметрами*

```
ModelParameters(
  :EnableMultiTasking => false
  :GenerateComments => true

  #Параметры интегратора:
  :StartTime => 0.0
  :StopTime => 40.0
  :SolverType => fixed-step
  :SolverName => Euler
  :FixedStep => 0.05
)
```

### Симуляция

Запустим симуляцию нашей модели с помощью метода [run](programmatic-modeling-functions.html#engee.run):

```
engee.run("newmodel_1")
```

Благодаря включенной ранее записи сигналов, переменная [simout](../feature/about-simout.html), хранящая результаты симуляции, получила значение `SimulationResult("newmodel_1/Sine Wave.1" ⇒ WorkspaceArray("newmodel_1/Sine Wave.1"))`, представленное в виде таблицы [DataFrame](../julia/DataFrames.html):

*Вывод*

```
Dict{String, DataFrames.DataFrame} with 1 entry:
  "Sine Wave.1" => 801×2 DataFrame…
```

Сохраним результаты симуляции в оперативную память Engee с помощью функции `collect` в виде переменной `result`:

```
result = collect(simout["newmodel_1/Sine Wave.1"])
```

|  |  |
| --- | --- |
|  | Дополнительно получим результаты симуляции с помощью метода [get\_results](programmatic-modeling-functions.html#engee.get_results) не прибегая к переменной simout:  ``` modeling_variable = engee.get_results("newmodel_1") ```  Обе переменных с результатами симуляции (`modeling_variable` и `result`) имеют значение в виде DataFrame, но отличаются по классу — `Dict{String, DataFrames, DataFrame}` для `modeling_variable` и `DataFrames.DataFrame` для `result` соответственно. |

Для удобства продолжим работу с переменной `result`. DataFrame переменной `result` состоит из двух столбцов — time (время) и value (значение). Визуализируем DataFrame с помощью библиотеки Plots:

```
plot(result.time, result.value)
```

![plots result modeling](/helpcenter/stable/_next/static/media/how_to_work_engee/plots-result-modeling.png)

|  |  |
| --- | --- |
|  | Дополнительно можно сохранить результаты симуляции в формате CSV:  ``` using CSV CSV.write("result.csv", result) # записывает результаты симуляции из result в файл result.csv ``` |

### Кодогенерация

Сгенерируем код модели с помощью метода [generate\_code](programmatic-modeling-functions.html#engee.generate_code):

```
engee.generate_code("/user/newmodel_1.engee", "/user/codegen_dir") # сгенерировали код из модели newmodel_1.engee, код будет храниться в папке codegen_dir
```

Сгенерированный код будет находиться в папке codegen\_dir в файлах newmodel\_1.h, newmodel\_1.c и main.c.

В конце сохраним нашу модель с помощью метода [save](programmatic-modeling-functions.html#engee.save):

```
engee.save("/user/newmodel_1.engee"; force=true)
```

## Полезные ссылки

1. [Публичные методы программного управления](programmatic-modeling-functions.html)
2. [Командная строка](../tutorial/command-line.html)
3. [Редактор скриптов](../guide/script-editor.html)
4. [Программная обработка результатов симуляции в Engee](../feature/about-simout.html)
