# server/Dockerfile
FROM node:20-slim

WORKDIR /app

# Copy only package.json (do NOT copy lockfile to avoid version conflicts)
COPY package.json ./

# Install exact versions — no lockfile, no cache
RUN rm -rf node_modules package-lock.json && \
    npm install --production --no-package-lock

# Copy the rest of the source
COPY . .

EXPOSE 3001

CMD ["node", "server.js"]