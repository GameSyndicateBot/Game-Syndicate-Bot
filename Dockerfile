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

RUN mkdir -p /opt/gs-data \
    && cp /app/data/achievements.json /opt/gs-data/achievements.json \
    && cp /app/data/cards.json /opt/gs-data/cards.json \
    && test -f /opt/gs-data/achievements.json \
    && test -f /opt/gs-data/cards.json

RUN mkdir -p /app/data /app/database/backups /data/backups \
    && touch /app/database/database.sqlite \
    && chmod -R 777 /app/database /data /opt/gs-data

CMD ["sh", "-c", "mkdir -p /app/data /app/database/backups && cp -f /opt/gs-data/achievements.json /app/data/achievements.json && cp -f /opt/gs-data/cards.json /app/data/cards.json && chmod -R 777 /app/database && echo '✅ Data-файлы восстановлены' && ls -la /app/data && exec node index.js"]