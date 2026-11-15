---
name: refactor-function
description: Переписать функцию: grep → read блока → edit → проверка вызовов.
---

# Рефакторинг функции

1. `grep` имя функции → строка.
2. `read` offset/limit — весь блок.
3. `edit` old_string = текущий код, new_string = новый.
4. `grep` вызовы — обнови несовместимые.
5. Ответ: файл, строки, вызовов N.
