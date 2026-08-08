Game Syndicate V20.2.3 — Spicy Herbs inventory merge fix

Исправление:
- Основной ID ресурса: culinary_herbs.
- Старый spicy_herbs автоматически нормализуется в culinary_herbs.
- При запуске/открытии ресурсов все старые строки spicy_herbs в hero_materials суммируются с culinary_herbs и удаляются.
- Старый spicy_herbs больше не присутствует в каталоге материалов и пуле торговца.
- Старые записи hero_inventory со spicy_herbs при миграции также попадут в culinary_herbs.

Пример: culinary_herbs x44 + spicy_herbs x3 -> culinary_herbs x47.

Установка: распаковать поверх корня бота с заменой файлов и перезапустить бот.
