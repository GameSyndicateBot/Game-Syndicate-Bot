ИСПРАВЛЕНИЕ УСТАНОВКИ TELEGRAM-БОТА ДЛЯ GS-CORE(17)

Причина ошибки ETIMEDOUT:
package-lock.json содержал ссылки на внутренний npm-сервер OpenAI.
Этот патч заменяет их на официальный https://registry.npmjs.org/.

УСТАНОВКА

1. Останови Discord-бота сочетанием Ctrl+C.
2. Распакуй содержимое этого ZIP в корень GS-Core с заменой package-lock.json.
3. Дважды нажми setup-telegram.bat.
4. Когда появится запрос, вставь токен от BotFather и нажми Enter.
5. Запусти бота:

   node index.js

Должны появиться строки:
✅ Бот Game Syndicate запущен!
✅ GS Telegram Bot запущен: @имя_бота

Если токена ещё нет:
- открой в Telegram @BotFather;
- /newbot;
- задай имя;
- задай username, оканчивающийся на bot;
- скопируй выданный токен.

ВАЖНО:
Не публикуй токен и не отправляй его другим людям.
