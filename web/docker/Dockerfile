# Build context is  (see docker-compose.yml): docker build -f docker/Dockerfile web

# Node and the web dependencies: the web-dev service in docker-compose.yml stops here (bin/web).
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build the React app...
FROM dev AS build
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# ...then serve the static files with nginx, which also proxies /api and /uploads to the API.
FROM nginx:1.27-alpine
# The nginx image renders templates/*.template into conf.d/ at startup, filling in ${API_URL}.
ENV API_URL=http://api:3000
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
