# Telegram-бот Game Syndicate

Telegram-бот встроен в основной проект GS-Core и запускается вместе с Discord-ботом.

## Подключение

1. Создай бота через `@BotFather` командой `/newbot`.
2. В корневом `.env` добавь:

```env
TELEGRAM_BOT_TOKEN=токен_от_BotFather
```

3. В BotFather отключи Privacy Mode:

```text
/setprivacy → выбери бота → Disable
```

Это нужно, чтобы бот видел ответы с временем, количеством игроков и комментарием в группе.

4. Установи зависимости в корне GS-Core:

```bash
npm install
```

5. Запускай как обычно:

```bash
node index.js
```

В терминале должны появиться две строки запуска: Discord-бота и Telegram-бота.

## Команды BotFather

Через `/setcommands`:

```text
start - открыть информацию о боте
gather - создать сбор игроков
cancel - отменить создание сбора
```

## Аватар

Для `/setuserpic` используй `telegram/assets/gs-bot-avatar.png`.

## Использование

Добавь бота в группу, затем введи `/gather` и следуй подсказкам.
