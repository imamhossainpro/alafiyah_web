# server/Dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

# ✅ SSH-এর বদলে HTTPS দিয়ে GitHub ব্যবহার করুন (কোনো SSH key লাগবে না)
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git@github.com:"

RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]