# Game Syndicate Bot v26 — Production Startup Audit

- Game Lobby runtime переведён на process-wide singleton через `globalThis`.
- Повторные вызовы инициализации больше не создают второй таймер и не дублируют одинаковые логи.
- Добавлена диагностика постоянного хранилища до восстановления базы.
- Storage marker показывает, сохраняет ли хостинг `/app/shared` между пересборками.
- Добавлен `npm run startup:audit` для карты ready-обработчиков, таймеров и Game Lobby init.
- Игровые механики и схема базы не изменялись.
