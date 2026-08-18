# Game Syndicate V20.3.9 — Startup Fix

Причина офлайна найдена в `scripts/container-entrypoint.sh`.

Docker build уже проверял `SCHEDULED_BACKUP_SYSTEM_V8`, но entrypoint контейнера после запуска всё ещё выполнял обязательный `grep` по старому маркеру `SCHEDULED_BACKUP_SYSTEM_V5 loaded`.

Поскольку скрипт работает с `set -eu`, отсутствие V5 завершало контейнер ДО `exec node /app/index.js`. Поэтому Discord-бот не мог появиться онлайн, а slash-команды показывали «Приложение не отвечает».

Исправлено:
- startup-проверка V5 -> V8;
- основной `index.js` теперь достигается после успешной проверки;
- постоянная БД `/app/shared/database.sqlite` не изменяется этим патчем.
