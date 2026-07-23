#!/bin/sh
set -eu

cd /app

# Старые update-архивы могли оставить отключённые файлы.
# Удаляем их только из слоя приложения; постоянное хранилище /app/shared не затрагивается.
rm -f \
  /app/commands/linktelegram.js \
  /app/events/interactionCreate.js \
  /app/startTelegramBot.js \
  /app/crossGatherings.js \
  /app/ecosystemDb.js \
  /app/systems/riddleSystem.js \
  /app/images/createRiddleCard.js \
  /app/images/riddle/createRiddleCard.js

echo '🧹 Устаревшие файлы очищены'
node /app/scripts/verify-build.js

mkdir -p /app/data /app/shared/backups
cp -f /opt/gs-data/achievements.json /app/data/achievements.json
cp -f /opt/gs-data/cards.json /app/data/cards.json
chmod -R 777 /app/shared /app/data

echo '✅ Data-файлы восстановлены'
echo "📁 DATABASE_PATH=${DATABASE_PATH:-/app/shared/database.sqlite}"
echo "📁 BACKUP_DIR=${BACKUP_DIR:-/app/shared/backups}"
echo '=== BACKUP SERVICE V5 CHECK ==='
grep 'SCHEDULED_BACKUP_SYSTEM_V5 loaded' /app/services/automaticBackups.js
! grep -q 'installCriticalBackupTracking' /app/services/automaticBackups.js
sha256sum /app/services/automaticBackups.js
ls -la /app/shared

node /app/scripts/storageDiagnostics.js
node /app/scripts/restoreDatabaseFromDiscord.js

# Bothost Web Terminal разрешает только ограниченный набор команд, поэтому
# slash-команды Discord регистрируются автоматически при каждом развёртывании.
# Ошибка регистрации не должна останавливать самого бота: причина останется в логах.
if [ "${AUTO_DEPLOY_COMMANDS:-1}" = "1" ]; then
  echo '🚀 Автоматическая регистрация Discord slash-команд...'
  if node /app/deploy-commands.js prod; then
    echo '✅ Discord slash-команды зарегистрированы автоматически'
  else
    echo '⚠️ Автоматическая регистрация команд завершилась ошибкой. Проверь TOKEN, CLIENT_ID и PROD_GUILD_ID/GUILD_ID.'
  fi
else
  echo '⏭️ Автоматическая регистрация команд отключена: AUTO_DEPLOY_COMMANDS=0'
fi

exec node /app/index.js
