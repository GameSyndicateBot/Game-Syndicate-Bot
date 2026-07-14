GS TELEGRAM HOTFIX — WITHOUT GRAMMY

Причина ошибки:
- npm не смог скачать grammy;
- поэтому Node.js выдавал MODULE_NOT_FOUND.

Что изменено:
- зависимость grammy полностью удалена;
- Telegram-бот переведён на официальный Telegram Bot API;
- используется встроенный fetch из Node.js 24;
- npm install для Telegram-бота больше не требуется;
- команды /start, /gather и /cancel устанавливаются автоматически.

Установка:
1. Остановить бот: Ctrl + C.
2. Распаковать этот ZIP в корень GS-Core с заменой файлов.
3. Запустить setup-telegram.cmd.
4. Вставить токен от BotFather.
5. Запустить: node index.js

Ожидаемая строка:
GS Telegram Bot запущен без grammy: @username

Важно:
- старый setup-telegram.bat больше не использовать;
- npm install ради Telegram-бота выполнять не нужно.
