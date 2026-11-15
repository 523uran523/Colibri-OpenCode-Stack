---
name: refactor-function
description: Переписать функцию: grep → read → edit → вызовы.
---
# Рефакторинг функции
1. `grep` имя → строка. 2. `read` offset/limit — весь блок.
3. `edit` old → new. 4. `grep` вызовы — обнови несовместимые.
5. Ответ: файл, строки, вызовов N.
