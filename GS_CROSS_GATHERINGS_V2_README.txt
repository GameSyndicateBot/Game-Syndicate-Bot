GS CROSS-PLATFORM GATHERINGS v2

Добавлено:
- создание сборов в Telegram и Discord;
- единый список участников;
- защита от двойной записи привязанного аккаунта;
- уведомления только записавшимся за 30 и 10 минут;
- уведомление в момент старта;
- кнопка «Запустить сейчас»;
- Telegram- и Discord-упоминания на соответствующих платформах.

Установка:
1. Ctrl + C.
2. Распаковать ZIP в корень GS-Core с заменой.
3. node deploy-commands.js
4. node index.js
5. В нужном Discord-канале выполнить /setgatherchannel

Discord:
 /gather game:Goose Goose Duck time:20:00 players:8

Telegram:
 /gather

Если указанное время сегодня прошло, сбор назначается на завтра.
