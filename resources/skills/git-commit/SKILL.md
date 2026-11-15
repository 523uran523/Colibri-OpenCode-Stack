---
name: git-commit
description: Коммит: git status → add → diff --cached → commit.
---

# Git commit

1. `bash` git status — проверь изменения.
2. `bash` git add <нужные файлы>.
3. `bash` git diff --cached.
4. `bash` git commit -m "что сделано".
5. Ответ: хеш, файлы, +/−.

Не коммить секреты (.env, ключи) и артефакты (node_modules, *.log, dist). Чужие изменения не трогай.
