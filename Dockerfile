FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
ENV NPM_CONFIG_FETCH_TIMEOUT=300000

# Постоянное хранилище Bothost.
# Значения из панели переменных окружения смогут переопределить эти пути.
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

# Сохраняем обязательные JSON-файлы вне /app/data,
# потому что Bothost может перекрывать эту папку при запуске.
RUN mkdir -p /opt/gs-data \
    && cp /app/data/achievements.json /opt/gs-data/achievements.json \
    && cp /app/data/cards.json /opt/gs-data/cards.json \
    && test -f /opt/gs-data/achievements.json \
    && test -f /opt/gs-data/cards.json \
    && chmod -R 755 /opt/gs-data

# На старте:
# 1. восстанавливаем JSON-файлы;
# 2. создаём папки постоянного хранилища;
# 3. запускаем бота.
#
# database/db.js сам скопирует старую /app/database/database.sqlite
# в /app/shared/database.sqlite, если постоянной базы ещё нет.
CMD ["sh", "-c", "mkdir -p /app/data /app/shared/backups && cp -f /opt/gs-data/achievements.json /app/data/achievements.json && cp -f /opt/gs-data/cards.json /app/data/cards.json && chmod -R 777 /app/shared /app/data && echo '✅ Data-файлы восстановлены' && echo \"📁 DATABASE_PATH=$DATABASE_PATH\" && echo \"📁 BACKUP_DIR=$BACKUP_DIR\" && ls -la /app/shared && exec node index.js"]
