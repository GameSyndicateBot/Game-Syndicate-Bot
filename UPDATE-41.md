# GS CORE STABLE 3

Безопасное обновление для действующего сервера.

## Изменения
- SQLite возвращён в режим WAL.
- `busy_timeout` увеличен до 10 секунд.
- Включён `wal_autocheckpoint = 1000`.
- При SIGTERM/SIGINT выполняется WAL checkpoint и корректное закрытие базы.
- Docker startup banner синхронизирован с Runtime: `GS CORE STABLE 3`.
- Состав `/setup` проверен: все отображаемые настройки используются рабочими модулями.

## Не изменялось
- Игровая логика, награды и шансы.
- Quick Event и мировой босс.
- Lucky Day.
- Discord/Telegram данные и настройки.
