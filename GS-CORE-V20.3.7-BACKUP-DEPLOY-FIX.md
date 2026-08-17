# Game Syndicate V20.3.7 — Backup + GitHub deploy fix

Исправлено:
- Найдена реальная причина падения обновления на хосте: Dockerfile требовал
  `SCHEDULED_BACKUP_SYSTEM_V5 loaded`, хотя в проекте уже был V7.
- Dockerfile теперь проверяет `SCHEDULED_BACKUP_SYSTEM_V8 loaded`.
- `/backup create` больше не считается проваленным, если SQLite-копия уже создана,
  а Discord отказал только в загрузке вложения.
- Discord transport: gzip -> части по 7 MB -> при HTTP 413 повтор частями по 4 MB.
- Локальная копия всегда сохраняется в `/app/shared/backups`.
- Подключён ранее подготовленный одноразовый rollbackRecoveryV2034.
- Сохранено восстановление серии Quick Events = 5 для 308557208147329025.
- Lucky Day и Weekly Lottery сохраняют защиту от розыгрыша из-за рестарта.

Контроль после деплоя:
1. В build logs:
   `✅ Verified SCHEDULED_BACKUP_SYSTEM_V8 during build`
2. После старта:
   `✅ SCHEDULED_BACKUP_SYSTEM_V8 loaded`
3. `/backup create` должен вернуть успешное создание локальной копии даже при
   проблеме Discord.
