# Build context is api/ (see docker-compose.yml): docker build -f api/docker/Dockerfile api
# ---- build: compile TypeScript to dist/ ----
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production dependencies and compiled output only ----
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# dist/ sits next to migrations/ and seed/, so the '../migrations' and '../seed' paths resolve.
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY seed ./seed
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data/uploads

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The entrypoint fixes ownership of the mounted uploads folder, then drops to the
# unprivileged "node" user to run the server.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
