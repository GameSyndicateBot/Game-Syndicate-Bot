FROM node:22-bookworm-slim

# Bothost монтирует Git-проект в /app при запуске.
# Поэтому рабочую копию и node_modules держим вне /app,
# чтобы монтирование не скрыло установленные зависимости.
WORKDIR /usr/src/gs-core

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    libsqlite3-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

CMD ["node", "index.js"]
