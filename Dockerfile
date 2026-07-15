FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=300000 \
    DATABASE_PATH=/data/database.sqlite \
    BACKUP_DIR=/data/backups

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
RUN mkdir -p /data/backups && chown -R node:node /app /data

USER node

CMD ["node", "index.js"]
