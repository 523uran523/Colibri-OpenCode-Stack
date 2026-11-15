---
name: search-replace
description: Поиск через grep, замена через edit; массово — bash.
---

# Поиск и замена

Точечно:
1. `grep` — ровно 1 совпадение.
2. `read` offset рядом, limit 10–15.
3. `edit` old_string/new_string.

Массово:
1. `grep` все вхождения.
2. Один файл — `edit`; несколько — `bash` sed.
3. `grep` — старого не осталось.
