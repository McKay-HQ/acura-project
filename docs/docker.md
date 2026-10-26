# Docker

The app is two images, built from each package's `docker/` folder:

| Service             | Image                               | Built from                                                     |
| ------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `api`               | `acuraproject.azurecr.io/acura-api` | `api/docker/Dockerfile` (Node, TypeScript compiled to `dist/`) |
| `web`               | `acuraproject.azurecr.io/acura-web` | `web/docker/Dockerfile` (Vite build, served by nginx)          |
| `db` _(local only)_ | `postgres:16-alpine`                | `localdb` profile in `docker-compose.yml`                      |

nginx serves the web app and forwards `/api` and `/uploads` to the API (`API_URL`, default `http://api:3000`), so everything is on one port.

## Run it locally

```sh
cp .env.example .env
docker compose up -d --build
```

Open http://localhost:8080. The default `.env` sets `COMPOSE_PROFILES=localdb`, which adds a local Postgres, and points `DATABASE_URL` at it.

On the first start the API creates the tables and imports the starter inventory in `api/seed/` (84 parts, 14 containers, 11 tossed items, 24 tasks, 6 notes and their photos), which takes about a minute. The import runs once, and only into an empty database; set `SEED_ON_EMPTY=false` to start blank.

```sh
docker compose ps                 # status
docker compose logs -f api        # API logs
docker compose down               # stop (data is kept)
docker compose up -d --build      # rebuild after changing code
```

## Node for development

The `api` image has production dependencies only and the `web` image is nginx only, so `api-dev` and `web-dev` (the `dev` stage of each Dockerfile) run Node commands in development, through `./bin/api` and `./bin/web` ([node.md](node.md)).

## Using a managed database

Any Postgres 13+ works. In `.env`:

```sh
# COMPOSE_PROFILES=localdb              # commented out: no local database container
DATABASE_URL=postgres://user:password@host:5432/dbname
DATABASE_SSL=require                     # or no-verify for a self-signed certificate
```

| Variable          | Purpose                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`    | Connection string, or set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` |
| `DATABASE_SSL`    | `require`, `no-verify` or `disable`; overrides any `sslmode` in the URL            |
| `DATABASE_SSL_CA` | Optional CA certificate (PEM text or a path in the container)                      |
| `DB_POOL_MAX`     | Maximum connections the API opens (default 10)                                     |

## Access key

With `API_KEY` empty the app is open, which is fine on a home network. Set a long random key (`openssl rand -hex 24`) on a public host: viewing stays public, changes need the key (the web app asks once per browser), and `API_KEY_FOR_READS=true` makes the whole app private. API clients send `Authorization: Bearer <key>`.

## Photos

Photos are files in `${DATA_DIR}/uploads` (`./data/uploads` by default), not in the database. On Azure they live on a file share instead (see [azure.md](azure.md)).

## Upgrades

Migrations run when the API starts, so `docker compose up -d --build` upgrades an existing database in place. The starter inventory is never re-imported into a database that has data; to start over from it, stop the app and delete `data/`.

## Back up

Stop the containers and copy `data/`, or while running:

```sh
docker compose exec db pg_dump -U garage garage > garage-backup.sql
```

## Publishing images

`./bin/build` signs in to the registry and runs `docker compose build api web` and `docker compose push api web`. The image names come from `IMAGE_REGISTRY` and `IMAGE_TAG` (see `.env.example`). Without Compose:

```sh
docker build -f api/docker/Dockerfile api
docker build -f web/docker/Dockerfile web
```
