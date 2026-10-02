# server/Dockerfile
FROM node:20-slim

# ✅ Install git + build tools (Baileys-এর libsignal git থেকে আসে)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only package.json
COPY package.json ./

# ✅ --omit=dev (not --production), and NO --no-package-lock
RUN npm install --omit=dev --no-audit --no-fund

# Copy source
COPY . .

EXPOSE 3001

CMD ["node", "server.js"]