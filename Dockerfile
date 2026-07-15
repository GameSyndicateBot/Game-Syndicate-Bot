FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
ENV NPM_CONFIG_FETCH_TIMEOUT=300000

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

#Проверяем обязательные файлы.
#Если Bothost их не загрузил, сборка остановится здесь.
RUN echo "=== Проверка папки /app/data ===" \
    && ls -la /app \
    && ls -la /app/data \
    && test -f /app/data/achievements.json \
    && test -f /app/data/cards.json

#Создаём каталоги для базы и резервных копий.
#Выдаём пользователю node права на чтение и запись.
RUN mkdir -p /app/database/backups /data/backups \
    && chown -R node:node /app /data \
    && chmod -R 775 /app/database /data

USER node

CMD ["node", "index.js"]