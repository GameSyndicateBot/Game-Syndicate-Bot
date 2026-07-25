# Game Syndicate V17.0.6 — Expedition Helper Export Fix

Исправлена ошибка:

`availableExpeditionDurations is not a function`

Причина: функция была добавлена в `expeditionService.js`, но не экспортировалась через `module.exports`.

Теперь экспортируются:
- `availableExpeditionDurations`
- `activeWorldBoss`

После перезапуска бот сможет снова создать Expedition Hub.
Перерегистрация slash-команд не требуется, потому что структура команд не изменялась.
