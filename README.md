# RSX Type-S Project

A self-hosted tracker for the 2002 Acura RSX Type-S project: the car, the parts haul (kept,
spare, for sale, unknown), the containers and sub-containers they're stored in, a record of
tossed parts, and the task list in four phases, all with photos.

The app has three sections:

- **Home:** the car, the Phase 1 "before it drives" list, donut charts of the haul by container
  (part count and estimated value), mods and recent work, and upgrades to consider.
- **Parts:** Parts (cards or table, filters, a detail page per part), Containers (a detail page per
  top-level container, grouped by sub-container) and Tossed. Every tag, status and fitment pill
  is clickable and filters the list to just that value.
- **Tasks:** grouped by phase (1 Before Driving, 2 Priority, 3 Non-Priority, 4 Performance), each
  with a detail page listing its parts. A part's task phases show as `Phase N` tags.

| Container | What it does |
|---|---|
| `api` | Node.js + Express, in TypeScript. Domain logic, validation, photo processing (auto-rotate, resize, strip location data, thumbnails), serves photos. |
| `web` | React app in TypeScript, built with Vite, served by nginx. nginx forwards `/api` and `/uploads` to the API (`API_URL`, default `http://api:3000`), so everything is on one port. |
| `db` *(local only)* | PostgreSQL 16 for development and testing. In production, use a managed Postgres instead. |

## Quick start (local, with the bundled database)

You need Docker Desktop (Mac/Windows) or Docker Engine with the Compose plugin (Linux).

```sh
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:8080**. The default `.env` sets
`COMPOSE_FILE=docker-compose.yml:docker-compose.localdb.yml`, which adds the local Postgres container.

On the first start the API creates the tables and imports the starter inventory in `api/seed/`
(84 parts, 14 containers of which 6 are top-level, 11 tossed items, 24 tasks, 6 notes and 211 photos). Processing the photos
takes about a minute. The import runs once, and only against an empty database. Set
`SEED_ON_EMPTY=false` to start blank.

**Upgrading an existing install:** migrations run on startup, so `docker compose up -d --build` adds
sub-containers, icons, task phases and task parts to your existing data (statuses of `Unidentified`
become `Unknown`; task priorities become phases: Before driving → 1, Soon → 2, Later → 3). The
refreshed starter inventory is **not** re-imported into a database that already has data. To start
over from it, stop the app, delete `data/` (local database) or empty the managed database, and start
again.

## Using a managed database

The API reads its connection from environment variables, so any Postgres 13+ works
(Neon, Supabase, Render, Railway, DigitalOcean, AWS RDS, and so on).

1. Create a database with your provider and copy its connection string.
2. In `.env`:
   ```sh
   COMPOSE_FILE=docker-compose.yml          # drop the local database container
   DATABASE_URL=postgres://user:password@host:5432/dbname
   DATABASE_SSL=require                     # or no-verify if the provider uses a self-signed cert
   ```
3. `docker compose up -d --build`. Tables are created on first start, and the starter inventory is
   imported if the database is empty.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Connection string. Alternatively set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`. |
| `DATABASE_SSL` | `require` (TLS, certificate verified), `no-verify` (TLS, certificate not checked), or `disable`. When set, it overrides any `sslmode` in the URL. |
| `DATABASE_SSL_CA` | Optional CA certificate (PEM text, or a file path inside the container) for providers with a private CA. |
| `DB_POOL_MAX` | Maximum connections the API opens (default 10; lower it on small plans). |

If no database is configured the API exits with a clear message. Startup logs show the host and
database it connects to (never the password).

**Photos** are stored on disk in `${DATA_DIR}/uploads`, not in the database. On a host with ephemeral
disks, mount a persistent volume there. Object storage (S3/R2) would be a later addition.

## Deploy to Azure Container Apps

One container app runs both containers: nginx (`web`, public) and the API (`api`), which nginx
reaches at `localhost:3000`. Postgres is an Azure Database for PostgreSQL flexible server, and
photos live on an Azure Files share mounted into the API. Everything is in one resource group and
region.

**1. Settings** (re-paste in each new terminal; keep the saved password, don't regenerate it)

```sh
LOCATION=centralus RG=acura-project ACR=acuraproject PG_SERVER=acura-project-db
PG_ADMIN=acura_db_admin STORAGE=acuraprojectfiles ENV=acura-env
PG_PASSWORD="$(openssl rand -base64 30 | tr -d '/+=')Aa1"   # first time only; save it
```

**2. Infrastructure** (once)

```sh
az group create -n $RG -l $LOCATION
for ns in Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.App Microsoft.OperationalInsights Microsoft.Storage Microsoft.ManagedIdentity; do
    az provider register --namespace $ns
done
az acr create -g $RG -n $ACR --sku Basic -l $LOCATION

az postgres flexible-server create -g $RG -n $PG_SERVER -l $LOCATION \
    --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
    --admin-user $PG_ADMIN --admin-password "$PG_PASSWORD" --public-access 0.0.0.0 --yes -o none
MYIP=$(curl -s https://api.ipify.org)       # optional: lets psql connect from this machine
az postgres flexible-server firewall-rule create -g $RG --server-name $PG_SERVER \
    --name home --start-ip-address $MYIP --end-ip-address $MYIP

az containerapp env create -n $ENV -g $RG -l $LOCATION
az storage account create -n $STORAGE -g $RG -l $LOCATION --sku Standard_LRS --kind StorageV2
az storage share-rm create --storage-account $STORAGE -g $RG --name uploads --quota 5
STORAGE_KEY=$(az storage account keys list -n $STORAGE -g $RG --query "[0].value" -o tsv)
az containerapp env storage set -n $ENV -g $RG --storage-name uploads \
    --azure-file-account-name $STORAGE --azure-file-account-key "$STORAGE_KEY" \
    --azure-file-share-name uploads --access-mode ReadWrite
```

`az postgres flexible-server create` prints the password in its output; use `-o none` (as above)
so it doesn't end up in your scrollback.

**3. Images**

```sh
./bin/build        # signs in to the registry, builds both images, pushes them
```

`IMAGE_TAG=... ./bin/build` pushes a different tag (default `latest`); `ACR=...` a different
registry.

**4. The app** (creates it the first time, updates it after)

```sh
PG_PASSWORD="$PG_PASSWORD" ./bin/deploy.sh
```

The app's definition (containers, sizes, secrets, scaling, the photo volume) is in
`bin/deploy.d/containerapp.yaml`; the script fills in its `${...}` placeholders and applies it.
It prints the app's URL and a new access key for making changes (pass `API_KEY=...` to keep an
existing one). The first start creates the tables and imports the starter inventory and photos,
which takes about a minute; follow it with
`az containerapp logs show -n acura -g acura-project --container api --follow`.

The app scales to zero when idle, so the first visit after a quiet spell takes a few seconds.

**Shipping changes:** `./bin/build`, then start a new revision so Azure pulls the new `latest`
images:

```sh
az containerapp update -n acura -g acura-project --revision-suffix "r$(date +%Y%m%d%H%M)"
```

## Access key (for a public host)

With `API_KEY` empty the app is open, which is fine on a home network. On a public host, set a long
random key:

```sh
API_KEY=$(openssl rand -hex 24)
```

- Viewing stays public. Adding, editing or deleting anything needs the key. The web app shows an
  **Unlock editing** button and remembers the key in that browser.
- `API_KEY_FOR_READS=true` makes the whole app private.
- API clients send `Authorization: Bearer <key>` (or `X-API-Key: <key>`).
- Photo files (`/uploads/...`) are not behind the key; their names are random UUIDs.

## Publish the images

The `api` and `web` services are named for the Azure Container Registry
(`acuraproject.azurecr.io/acura-api` and `acura-web`, built for `linux/amd64`).

```sh
./bin/build
```

It signs in with `az acr login`, then runs `docker compose build api web` and
`docker compose push api web` (naming the services so the local database image isn't pushed).
Set `IMAGE_TAG` for a tag other than `latest`, or `ACR` for another registry.

## Everyday commands

```sh
docker compose ps                 # status
docker compose logs -f api        # API logs
docker compose down               # stop (data is kept)
docker compose up -d --build      # rebuild after changing code
```

## Back up and restore

Local database: stop the containers and copy the whole `data/` folder. For a dump while running:

```sh
docker compose exec db pg_dump -U garage garage > garage-backup.sql
```

Managed database: use your provider's backups, or `pg_dump "$DATABASE_URL" > garage-backup.sql`.
Back up `data/uploads/` alongside it.

## Develop without Docker

Both packages are TypeScript (strict). The API compiles to `api/dist/` for production and runs
straight from source with `tsx` in development; the web app is type-checked, then bundled by Vite.

```sh
# terminal 1: API with reload on save (needs a Postgres you can reach)
cd api && npm install
DATABASE_URL=postgres://garage:garage-local@localhost:5432/garage DATABASE_SSL=disable npm run dev

# terminal 2: front end with hot reload, proxied to the API on :3000
cd web && npm install && npm run dev
```

With the local database container running (`docker compose up -d db`), it is reachable on
`localhost:5432`.

| Command (in `api/` or `web/`) | What it does |
|---|---|
| `npm run typecheck` | Type-check without building |
| `npm run build` | API: compile to `dist/`. Web: type-check, then build to `dist/` |
| `npm run format` | Format with Prettier (4-space indents; settings in `.prettierrc.json` at the root) |

`.editorconfig` at the root sets 4-space indents for editors that support it (YAML and Markdown
stay at 2).

## API

JSON in and out. Errors look like `{ "error": "...", "details": ["..."] }`. Anywhere an `:id` appears
you can pass the record's UUID **or** its `key` (e.g. `/api/parts/injen-intake`,
`/api/containers/box-engine`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check (also checks the database) |
| GET | `/api/config` | Whether a key is required; allowed statuses, task phases and container icons |
| POST | `/api/auth/check` | `{ ok: true }` if the presented key is valid |
| GET | `/api/summary` | Counts and value totals for the header |
| GET | `/api/tags` | Tags in use, with counts |
| GET | `/api/parts` | List parts. Filters: `status` (repeat or comma-separate), `tag` (any of; `Other cars` = fits isn't RSX; `Phase N` = linked to a task in that phase), `fits`, `container` (id, key or `none`; a top-level container includes its sub-containers), `q` (text search) |
| POST | `/api/parts` | Create. JSON, or multipart with `photos` files |
| GET / PATCH / DELETE | `/api/parts/:id` | Read, update, delete |
| POST | `/api/parts/:id/toss` | Move to Tossed with its photos. Body `{ reason?, tossedOn? }` |
| GET / POST | `/api/containers` | List (each with its parts) / create |
| GET / PATCH / DELETE | `/api/containers/:id` | Deleting a sub-container moves its parts up to the parent; deleting a top-level container leaves its parts unassigned and its sub-containers become top-level |
| GET / POST | `/api/tossed` | List / create |
| GET / PATCH / DELETE | `/api/tossed/:id` | |
| POST | `/api/{parts,containers,tossed}/:id/photos` | Add photos (multipart, field `photos`) |
| PUT | `/api/{parts,containers,tossed}/:id/photos/order` | `{ "ids": [...] }`; the first is the main photo |
| DELETE | `/api/photos/:photoId` | Delete one photo; returns the updated record |
| GET / POST | `/api/tasks` | List / create |
| GET / PATCH / DELETE | `/api/tasks/:id` | Read (with its parts), update, delete |
| GET / POST | `/api/notes` | Observation notes: `{ title, items: [...] }` |
| GET / PATCH / DELETE | `/api/notes/:id` | |

Fields:

- **Part:** `label`, `partNumber`, `fits`, `status` (`Verified` / `Unverified` / `Unknown`),
  `tags` (array, or comma-separated string in multipart), `valueLow`, `valueHigh`, `notes`,
  `containerId` (UUID or key, `null` to clear), `key`.
  "For sale", "Spare" and "Potential sale" are just tags. Responses also include `container`
  (with `icon` and its top-level parent as `top`), `tasks` and `phaseTags`.
- **Container:** `name`, `location`, `notes`, `key`, `parentId` (UUID or key of a top-level
  container, `null` for top-level; one level of nesting), `icon` (`trim`, `engine`, `electrical`,
  `other`, `askcody`, `none`, `hardware`, `box`), `sortOrder`.
- **Tossed:** `label`, `partNumber`, `reason`, `tossedOn` (`YYYY-MM-DD`), `key`.
- **Task:** `title`, `phase` (`1`–`4`), `notes` (the description), `done`, `partIds` (array of part
  UUIDs or keys; replaces the task's linked parts).
- **Note:** `title`, `items` (array of strings), `key`.

Example: tag a part for sale with a value range.

```sh
curl -X PATCH https://your-host/api/parts/rsx-spoiler-black \
  -H "Authorization: Bearer $API_KEY" -H "content-type: application/json" \
  -d '{"tags":["RSX OEM","For sale"],"valueLow":75,"valueHigh":150}'
```

## Project layout

```
docker-compose.yml           api + web
docker-compose.localdb.yml   adds the local Postgres for dev/testing
.env.example
bin/
  build                   build both images and push them to the registry
  deploy.sh               create or update the Azure container app
  deploy.d/
    containerapp.yaml     Azure Container Apps spec template
api/
  docker/            Dockerfile, .dockerignore, entrypoint
  migrations/        SQL schema, applied in order on startup
  seed/              starter data (seed.json) and photos
  src/
    index.ts         server startup
    config.ts        environment variables (database, key, uploads)
    routes.ts        HTTP endpoints
    types.ts         database rows, API responses and validated inputs
    services/        parts, containers, tossed, tasks, notes, summary
    lib/             validation, auth, photo processing, errors
web/
  docker/            Dockerfile, .dockerignore, nginx config template
  src/
    types.ts         models as the API returns them
    App.tsx          navigation, hash routes, data loading, access key
    components/      Home (charts), parts view (filters, table, cards), detail pages,
                     containers, tossed, tasks, forms
```
