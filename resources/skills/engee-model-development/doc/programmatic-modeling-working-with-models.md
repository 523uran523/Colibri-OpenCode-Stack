Source: https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-working-with-models.html

# Программное управление файлами моделей

## Работа с моделями

### Создание новой модели

Используется публичный метод [create](programmatic-modeling-functions.html#engee.create).

Для создания модели в **Engee** используйте следующий код:

```
model = "model_name"
engee.create(model)
```

В коде инициализируется переменная model со значением "model\_name", после обращения к которой через `engee.create` возвращается объект Model и создается модель. Создать модель можно и другим способом:

```
engee.create("model_name")
```

Здесь название для модели сразу передается строкой (тип данных `String`) и не требует предварительной инициализации переменной.

Таким образом, на основе вышеупомянутого кода:

- Создается модель с именем `model_name` и параметрами по умолчанию.
- Модель становится текущей моделью. Ее корневая система становится текущей системой.

  |  |  |
  | --- | --- |
  |  | Имя модели (`model_name`) не должно содержать символ `/`. |

*Ошибки*

Если модель с таким именем уже существует, выводит исключение `ModelAlreadyExistsException`.


*Вывод*

```
engee.create("model_name")
"Model(model_name)"
```

### Загрузка модели из файла

Используется публичный метод [load](programmatic-modeling-functions.html#engee.load)

```
engee.load(file_path; force = false)
```

- Загружает модель из файла с расширением `.engee`, расположенного в пути `file_path`.
- Возвращает объект типа `Model`.
- Модель становится текущей моделью. Ее корневая система становится текущей системой.

*Ошибки*

- Если модель с таким именем уже существует и параметр `force = true`, то перезагружает ее и все не сохраненные ранее изменения будут утеряны, если же `force = false`, то выводит исключение `ModelAlreadyExistsException`.
  По умолчанию `force = false`.
- Если у файла некорректное расширение, выводит исключение `InvalidFileExtension`.
- Если такого файла не существует, выводит исключение `FileNotFound`.


*Вывод*

```
engee.load("NewModel.engee"; force = true)
Model(NewModel)
```

### Открытие ранее используемой модели

Используется публичный метод [open](programmatic-modeling-functions.html#engee.open)

```
engee.open(model_name)
engee.open(path)
engee.open(model)
engee.open(system)
```

- Если в параметре указано название `model_name` открытой ранее модели, она становится текущей моделью. Ее корневая система становится текущей системой. Возвращает объект `Model`.
- Возвращает открытую систему `System`.
- Если в параметре указан путь до существующей системы `system_path`, содержащая ее модель становится текущей моделью, а сама система — текущей системой, которая отображается в визуальном редакторе. Возвращает объект `System`.
- Также вместо пути можно передать непосредственно экземпляр `Model` или `System`.

*Ошибки*

- Если модели не существует, выводит исключение `ModelDoesntExistException`.
- Если системы не существует, выводит исключение `SystemIsNotExistException`.


*Вывод*

```
# open model:
m1 = engee.open("NewModel")
Model(NewModel)
engee.gcm(), engee.gcs()
(Model(NewModel), System(root))
# open system:
engee.open("AnotherModel/Subsystem-1")
System(Subsystem-1)
engee.gcm(), engee.gcs()
(Model(AnotherModel), System(Subsystem-1))
```

### Обращение к открытой текущей модели

Используется публичный метод [gcm](programmatic-modeling-functions.html#engee.gcm).

```
engee.get_current_model()
engee.gcm()
```

- Возвращает текущую активную модель.

### Открытие текущей системы (модели и подсистемы)

Используется публичный метод [gcs](programmatic-modeling-functions.html#engee.gcs).

```
engee.get_current_system()
engee.gcs()
```

- Возвращает текущую активную систему.

*Ошибки*

- Если текущей системы нет, выводит исключение `NoModelOpenedException`.

### Просмотр списка открытых моделей

Используется публичный метод [get\_all\_models](programmatic-modeling-functions.html#engee.get_all_models).

```
engee.get_all_models(; sorted=true)
```

- Возвращает список открытых в текущей сессии моделей, как `Vector{Model}`.
- Если параметр `sorted=true`, то сортирует модели по имени, при `sorted=false` модели выводятся в порядке открытия. По умолчанию `sorted=true`.

### Проверка на несохраненные изменения

Перед редактированием модели откройте ее с помощью метода [open](programmatic-modeling-functions.html#engee.open). После редактирования не забудьте сохранить результаты с помощью [save](programmatic-modeling-functions.html#engee.open).

Для проверки на несохраненные изменения используется публичный метод [is\_dirty](programmatic-modeling-functions.html#engee.is_dirty).

```
engee.is_dirty(model)
```

- Проверяет, есть ли несохраненные изменения модели. Возвращает `true` при наличии несохраненных изменений, иначе — `false`.
- Если модель уже закрыта, возвращает `false`.

### Сохранение модели в файл

Используется публичный метод [save](programmatic-modeling-functions.html#engee.save).

```
engee.save(model_name, file_path; force = false)
engee.save(model, file_path; force = false)
```

- Сохраняет модель с именем `model_name` по пути `file_path` в файл с расширением `.engee`.
- Если необходимо, создаются промежуточные директории.
- Возвращает `nothing`.

*Ошибки*

- Если файл уже существует и параметр `force = true`, перезаписывает его, если же `force = false`, то завершается ошибкой `FileAlreadyExists`.

По умолчанию, `force = false`.

### Закрытие модели

Используется публичный метод [close](programmatic-modeling-functions.html#engee.close).

```
engee.close(model_name; force = false)
engee.close(model; force = false)
engee.close(; force = false)
```

- Закрывает модель с именем `model_name` в визуальном редакторе (удаляет ее из сессии).
- Текущей становится модель, открытая во вкладке визуального редактора левее.
- Возвращает `Model`.
- Если модель не указана, закрывает текущую модель. Если текущая модель не задана, ничего не делает.
- Если модель закрыта, то ничего не делает.

*Ошибки*

- Если есть несохраненные изменения и параметр `force=false`, завершается ошибкой `UnsavedModelException`, если же `force=true`,
  то несохраненные изменения будут потеряны.

|  |  |
| --- | --- |
|  | Все публичные методы программного управления, доступные в **Engee**, представлены в статье [Публичные методы программного управления](programmatic-modeling-functions.html). |

## Примеры

```
engee.create("newmodel_1") # создает модель с именем newmodel_1
engee.load("/user/newmodel_1.engee"; force = true) # принудительно загружает модель с именем newmodel_1 по указанному пути
engee.gcm() # возвращает текущую активную модель
engee.gcs() # возвращает текущую активную систему
engee.get_all_models(; sorted=true) # возвращает список открытых в текущей сессии моделей и сортирует их по имени
engee.is_dirty("newmodel_1") # проверяет есть ли несохраненные изменения, если после исполнения команды выводит true, значит есть несохраненные изменения
engee.open("newmodel_1") # возвращает открытую систему system и делает модель с именем newmodel_1 текущей моделью, может быть задана через путь к модели
engee.save("newmodel_1", "/user/newmodel_2.engee") # сохраняет модель newmodel_1 как модель newmodel_2 по указанному пути
engee.close("newmodel_1") # закрывает модель с именем newmodel_1 (удаляет из сессии)
```

## Полезные ссылки

1. [Публичные методы программного управления](programmatic-modeling-functions.html)
2. [Командная строка](../tutorial/command-line.html)
3. [Редактор скриптов](../guide/script-editor.html)
