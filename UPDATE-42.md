# GS CORE STABLE 4 — Unified Startup

Безопасное обновление для действующего Discord + Telegram сервера.

## Изменения

- Один источник версии: `build-info.json`.
- Docker build, container entrypoint и Node runtime используют одну версию и build ID.
- Огромная inline-команда Docker CMD заменена на один `scripts/container-entrypoint.sh`.
- Добавлен обязательный build fingerprint при сборке и при каждом запуске.
- Docker image содержит OCI version/revision labels.
- При несовпадении package/build metadata сборка или запуск останавливаются до подключения бота.
- SQLite, Discord и Telegram данные не входят в архив и не перезаписываются.

## Ожидаемые маркеры запуска

- `🏷️ Build: GS CORE STABLE 4`
- `🆔 Build ID: stable-4-20260720`
- `🚪 Startup: container-entrypoint-v1`
- `🔐 Build fingerprint: ...`
- `🏷️ Runtime: GS CORE STABLE 4`
- `🆔 Runtime build ID: stable-4-20260720`
- `🧾 SQLite journal mode: wal`
