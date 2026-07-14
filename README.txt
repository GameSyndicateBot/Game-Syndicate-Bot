GS-CORE — BOTHOST DOCKER READY

Что исправляет:
- используется Node.js 22;
- устанавливаются системные зависимости для canvas;
- поддерживаются better-sqlite3 и sharp;
- рабочая папка находится вне /app.

Почему не /app:
Bothost при запуске может монтировать Git-исходники в /app.
Если node_modules установить туда во время сборки, монтирование может их скрыть.
Поэтому проект запускается из /usr/src/gs-core.

Установка:

1. Распакуй архив.
2. Скопируй в корень локального репозитория:
   - Dockerfile
   - .dockerignore

Они должны лежать рядом с:
   - index.js
   - package.json
   - package-lock.json

3. В GitHub Desktop:
   Summary:
   Bothost Docker Node 22 canvas fix

   Затем:
   Commit to main
   Push origin

4. На Bothost:
   - открой настройки/редактирование бота;
   - включи «Использовать собственный Dockerfile»;
   - обнови проект из Git;
   - запусти пересборку.

5. В логах сборки должна появиться строка:
   FROM node:22-bookworm-slim

Если снова видно node:20-alpine, значит кастомный Dockerfile ещё не включён.

Важно:
- .env загружается через переменные окружения Bothost;
- базу данных не отправляй на GitHub;
- локального бота останови перед запуском хостинга.
