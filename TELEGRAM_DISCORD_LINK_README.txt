GS TELEGRAM ↔ DISCORD LINK

Установка:
1. Останови бота: Ctrl + C.
2. Распакуй патч в корень GS-Core с заменой файлов.
3. Зарегистрируй новую Discord-команду:
   node deploy-commands.js
4. Запусти:
   node index.js

Как привязать:
1. Открой @GameSyndicateGatherBot.
2. Отправь /start.
3. Нажми «Привязать Discord».
4. Скопируй шестизначный код.
5. В Discord выполни:
   /linktelegram code:123456
6. Бот подтвердит привязку и в Discord, и в Telegram.

Код действует 10 минут и используется один раз.

Проверка/отвязка:
- /linktelegram — показать состояние.
- /linktelegram unlink:true — отвязать аккаунт.
