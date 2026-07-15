# Развёртывание GS-Core на Bothost

## Почему вчера не собралось
В старом `package-lock.json` несколько пакетов ссылались на внутренний реестр OpenAI (`packages.applied-caas-...internal.api.openai.org`). Bothost не может подключиться к этому адресу, поэтому `npm ci` завершался с `ETIMEDOUT`.

В этой версии ссылки заменены на публичный `https://registry.npmjs.org/`, а Dockerfile настроен на повторные попытки и увеличенные тайм-ауты.

## Что загрузить в GitHub
Закоммитьте и отправьте как минимум:
- `Dockerfile`
- `.dockerignore`
- `.gitignore`
- `.npmrc`
- `package-lock.json`
- `database/db.js`
- `utils/backupDatabase.js`
- `.env.example`

Не загружайте `.env`: токены задаются в панели Bothost через переменные окружения.

## Переменные окружения Bothost
Обязательно:
- `TOKEN` — токен Discord-бота
- `CLIENT_ID` — ID приложения Discord
- `GUILD_ID` — ID сервера

Для Telegram:
- `TELEGRAM_BOT_TOKEN`

Для постоянной базы:
- `DATABASE_PATH=/data/database.sqlite`
- `BACKUP_DIR=/data/backups`

Если Bothost позволяет подключить постоянный диск/том, смонтируйте его в `/data`.

## После обновления GitHub
В панели Bothost нажмите пересборку/обновление из GitHub. В логе установка должна идти с `registry.npmjs.org`, а не с адресом `internal.api.openai.org`.
