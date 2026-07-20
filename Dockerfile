FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="Game Syndicate Bot" \
      org.opencontainers.image.version="4.0.1" \
      org.opencontainers.image.revision="stable-4-fix-20260720"

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
RUN chmod +x /app/scripts/container-entrypoint.sh \
    && node /app/scripts/verify-build.js \
    && test -f /app/services/automaticBackups.js \
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

CMD ["sh", "/app/scripts/container-entrypoint.sh"]
