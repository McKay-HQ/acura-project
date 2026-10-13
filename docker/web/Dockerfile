# Build context is the repo root (see docker-compose.yml): docker build -f docker/web/Dockerfile .

# Build the React app...
FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/tsconfig.json web/vite.config.ts web/index.html ./
COPY web/public ./public
COPY web/src ./src
RUN npm run build

# ...then serve the static files with nginx, which also proxies /api and /uploads to the API.
FROM nginx:1.27-alpine
# The nginx image renders templates/*.template into conf.d/ at startup, filling in ${API_URL}.
ENV API_URL=http://api:3000
COPY docker/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
