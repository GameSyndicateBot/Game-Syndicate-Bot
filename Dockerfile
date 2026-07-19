FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
ENV NPM_CONFIG_FETCH_TIMEOUT=300000

ENV DATABASE_PATH=/app/shared/database.sqlite
ENV BACKUP_DIR=/app/shared/backups

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg62-turbo-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# Жёсткая проверка, что в Docker-образ попала именно новая простая
# система бэкапов. Если Bothost соберёт старый файл, сборка остановится.
RUN test -f /app/services/automaticBackups.js \
    && grep -q "SCHEDULED_BACKUP_SYSTEM_V5 loaded" /app/services/automaticBackups.js \
    && ! grep -q "installCriticalBackupTracking" /app/services/automaticBackups.js \
    && echo "✅ Verified SCHEDULED_BACKUP_SYSTEM_V5 during build" \
    && sha256sum /app/services/automaticBackups.js

RUN mkdir -p /opt/gs-data \
    && cp /app/data/achievements.json /opt/gs-data/achievements.json \
    && cp /app/data/cards.json /opt/gs-data/cards.json \
    && test -f /opt/gs-data/achievements.json \
    && test -f /opt/gs-data/cards.json \
    && chmod -R 755 /opt/gs-data

CMD ["sh", "-c", "rm -f /app/commands/linktelegram.js /app/events/interactionCreate.js /app/startTelegramBot.js /app/crossGatherings.js /app/systems/riddleSystem.js /app/images/createRiddleCard.js && echo '🧹 Устаревшие файлы очищены' && echo '🏷️ GS BUILD 36 STARTUP AUDIT' && mkdir -p /app/data /app/shared/backups && cp -f /opt/gs-data/achievements.json /app/data/achievements.json && cp -f /opt/gs-data/cards.json /app/data/cards.json && chmod -R 777 /app/shared /app/data && echo '✅ Data-файлы восстановлены' && echo \"📁 DATABASE_PATH=$DATABASE_PATH\" && echo \"📁 BACKUP_DIR=$BACKUP_DIR\" && echo '=== BACKUP SERVICE V5 CHECK ===' && grep 'SCHEDULED_BACKUP_SYSTEM_V5 loaded' /app/services/automaticBackups.js && ! grep -q 'installCriticalBackupTracking' /app/services/automaticBackups.js && sha256sum /app/services/automaticBackups.js && ls -la /app/shared && node scripts/storageDiagnostics.js && node scripts/restoreDatabaseFromDiscord.js && exec node index.js"]
