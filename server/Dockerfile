FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --no-audit --no-fund || \
    npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]