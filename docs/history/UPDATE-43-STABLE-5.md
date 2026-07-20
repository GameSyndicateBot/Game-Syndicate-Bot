# GS CORE STABLE 5

Безопасная чистка рабочего update-архива без изменения игровых механик и схемы базы.

## Удалено

- SQLite/WAL/SHM-файлы, случайно попавшие в исходный ZIP.
- Две устаревшие `.bak`-копии исходников.
- Отключённая отдельная система загадок и её изображение.
- Старые корневые дубли Telegram-модулей.
- Устаревшие `commands/linktelegram.js` и `events/interactionCreate.js`, функциональность которых уже находится в актуальных обработчиках.
- Одноразовый персональный скрипт выдачи Dust.

Quick Event, включая тип `emoji_riddle`, не изменялся.

## Изменено

- Исторические PATCH/UPDATE-документы перенесены в `docs/history`.
- `.dockerignore` защищает образ от SQLite, WAL, SHM, BAK и исторических документов.
- Нулевые сообщения `[Join date restore] ... 0 достижений` больше не засоряют стартовый лог.
- Версия обновлена до `GS CORE STABLE 5`, build ID `stable-5-20260720`.

## Проверки

- Синтаксис: 166 JS-файлов.
- Slash-команды: 34, дубликатов имён нет.
- Update safety audit: PASSED.
- Release audit: PASSED.
- Startup audit: выполнен.
- Shell syntax: PASSED.
