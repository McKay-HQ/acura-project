# RSX Type-S Project

A self-hosted tracker for the 2002 Acura RSX Type-S project: the car, the parts haul, the containers they're stored in, tossed parts, and the task list, all with photos.

- **Home:** the car, the Phase 1 list, charts of the haul by container, mods and upgrade ideas.
- **Parts:** Parts (cards or table, filters, a page per part), Containers and Tossed.
- **Tasks:** grouped into four phases, each with a page listing its parts.

It's a TypeScript API (Express + Postgres) and a React web app, each in its own container.

## Run locally

```sh
cp .env.example .env
docker compose up -d --build
```

Runs the app with a local Postgres at http://localhost:8080 and loads the starter inventory on first start. More in [docs/docker.md](docs/docker.md).

## Build the images

```sh
./bin/build
```

Pulls the latest code, then builds both images and pushes them to the Azure Container Registry. More in [docs/build.md](docs/build.md).

## Deploy

```sh
./bin/deploy -b
```

Pulls, builds and pushes the images, rolls out a new revision of the Azure container app, then syncs the catalog with it. First-time Azure setup is in [docs/azure.md](docs/azure.md); options in [docs/deploy.md](docs/deploy.md).

## Sync the catalog

```sh
./bin/sync
```

Two-way sync between the catalog and the live app: edits made on either side are copied to the other, edits to different fields are merged, and conflicting edits are reported, never overwritten. No rebuild or redeploy. More in [docs/sync.md](docs/sync.md).

## API

Interactive docs (Swagger UI) at **`/api/docs/`** on any running copy, e.g. http://localhost:8080/api/docs/; the spec is at `/api/openapi.json`. The docs come from `@openapi` annotations in `api/src/routes.ts` and `api/src/schemas.ts`.

## Docs

Everything else is in [docs/](docs/README.md). Each command shows its page with `-h`.

## Project layout

```
docker-compose.yml           api + web
docker-compose.localdb.yml   adds the local Postgres for dev/testing
.env.example
bin/                         commands (see docs/)
  build                      build both images and push them to the registry
  deploy                     create or update the Azure container app
  deploy.d/containerapp.yaml Azure Container Apps spec template
  replace-photos             swap a record's photos on the live app
  sync                       two-way sync of the catalog and the live app (sync.d/sync.py)
lib/                         shared bash for bin/ (common.sh, azure.sh)
docs/                        command pages, azure.md, docker.md, sync-design.md
tools/artifact/              Claude's side of the sync (artifact <-> api/seed)
api/
  docker/                    Dockerfile, .dockerignore, entrypoint
  migrations/                SQL schema, applied in order on startup
  scripts/                   lint-openapi.ts (npm run lint:openapi)
  seed/                      the catalog: starter data (seed.json), photos, history/
  src/                       routes.ts, schemas.ts, openapi.ts, services/, lib/, ...
web/
  docker/                    Dockerfile, .dockerignore, nginx config template
  src/                       App.tsx, components/, types.ts, ...
```
