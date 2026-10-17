# RSX Type-S Project

A self-hosted tracker for the 2002 Acura RSX Type-S project: the car, the parts haul, the containers they're stored in, tossed parts, and the task list, all with photos.

- **Home:** the car, the Phase 1 list, charts of the haul by container, mods and upgrade ideas.
- **The Car:** condition notes and photos of the exterior, engine bay and interior (`web/src/car.ts`, photos in `web/public/car/`).
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

## GitHub Actions

Every push to `main` runs **Deploy**: when code changed it builds, rolls out, syncs and publishes a release with the next semantic version; otherwise it just syncs. Build, Sync and Release also run on their own from the Actions tab. One-time setup: `./bin/ci-setup`. More in [docs/ci.md](docs/ci.md).

## Sync the catalog

```sh
./bin/sync
```

Two-way sync between the catalog and the live app: edits made on either side are copied to the other, edits to different fields are merged, and conflicting edits are reported, never overwritten. No rebuild or redeploy. More in [docs/sync.md](docs/sync.md).

## API

Interactive docs (Swagger UI) at **`/api/docs/`** on any running copy, e.g. http://localhost:8080/api/docs/; the spec is at `/api/openapi.json`. The docs come from `@openapi` annotations in `api/src/routes.ts` and `api/src/schemas.ts`.

## Docs

Everything else is in [docs/](docs/README.md). Each command shows its page with `-h`.

## Conventions

**Branches.** `main` is what's live: every merge into it deploys (see [GitHub Actions](#github-actions)). It only takes changes through pull requests (squash or rebase, linear history, no force pushes, no deleting it), so every change goes on a branch named `<kind>/<short-description>`, e.g. `feat/task-steps`, `fix/photo-viewer-zoom`. The sync's branches are `sync/catalog-<date>-<time>`. With squash merges the pull request's title becomes the commit on `main`, so give the title a type too.

**Version labels.** Every pull request gets exactly one label, which decides how the next release raises the version ([docs/ci.md](docs/ci.md#versions)):

| Label      | For                                             | Release bump |
| ---------- | ----------------------------------------------- | ------------ |
| `breaking` | A breaking change, or a new page or section     | major        |
| `feature`  | A new feature or change in what the app does    | minor        |
| `fix`      | A fix, or anything else (docs, CI, refactoring) | patch        |
| `sync`     | A catalog sync from the app                     | none         |

The **Version label** check fails until a pull request has one. Pull requests the sync opens are labeled `sync`, so catalog changes alone never make a release.

**Commit messages** start with a type that says what kind of change it is: `feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, `style:`, `chore:`, `build:`, `test:`, with a scope when it helps (`feat(web): photo captions`, `fix(api): reject empty step text`). The type doesn't affect the version; the label does. The sync's pull requests are titled `chore(sync): catalog from the app ...` and merge themselves.

**Versions** are semantic, starting at `v1.0.0`, tagged and released by the workflows; local deploys aren't released.

**Code style.** TypeScript (strict) in `api/` and `web/`, formatted with Prettier: 4-space indentation, single quotes, 120 columns; YAML and Markdown use 2 spaces (`.prettierrc.json`, `.editorconfig`). The API is documented with `@openapi` blocks next to each route, and `npm run lint:openapi` checks them. ESLint (`eslint.config.js`) adds a few rules on top of the recommended ones: no single-letter names (`row`, not `r`; `_` for an unused parameter is fine), one variable per declaration, and `===` except for `== null`. Prettier runs inside ESLint (eslint-plugin-prettier), so a formatting problem is a lint error like any other, for code, docs, YAML, JSON, CSS and HTML alike. From the repo root, after `npm install`: `npm run lint` (code and formatting), `npm run typecheck` (both projects), or `npm run check` for both; `npm run lint:fix` (or `npm run format`) fixes what it can. On every pull request, the **Static Checks** workflow runs both typechecks and ESLint, and **Build Checks** builds the API and web app and runs the OpenAPI check. TypeScript and ESLint results (formatting included) are uploaded to GitHub code scanning as SARIF, so they show on the pull request's changed lines ([docs/ci.md](docs/ci.md#sarif)).

**Commands** live in `bin/` with no file extension, share helpers from `lib/`, and each prints its page in `docs/` with `-h`. Options: lowercase turns something on (`-b` build first, `-d` dry run), uppercase turns a default off (`-P` don't `git pull`, `-S` don't sync, `-C` don't commit).

**Records** (parts, containers, tossed parts, tasks, notes) have a human-readable `key` (`injen-intake`), usable anywhere the API takes an id, and a `version` that every write must send back as `If-Match`. Deletes are soft. Photos keep a stable file name (`source`) so the catalog and the app can match them.

**The catalog** in `api/seed/` is the bridge between the claude.ai artifact and the app ([docs/sync-design.md](docs/sync-design.md)). Edit records in the app or the artifact, not in `seed.json` by hand.

**Secrets** never go in the repo: `.env` is ignored, the app's database password and access key live as Container App secrets, and GitHub signs in to Azure without a stored key.

## Project layout

| Path                         | What's there                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `.github/workflows/`         | Build, Sync, Release and Deploy ([docs/ci.md](docs/ci.md))                                               |
| `.github/actions/azure/`     | Shared Azure sign-in steps for the workflows                                                             |
| `docker-compose.yml`         | The api and web containers                                                                               |
| `docker-compose.localdb.yml` | Adds a local Postgres for development                                                                    |
| `.env.example`               | Settings for local runs; copy to `.env`                                                                  |
| `CLAUDE.md`                  | Conventions for Claude working in this repo                                                              |
| `bin/build`                  | Build both images and push them to the registry                                                          |
| `bin/ci-setup`               | One-time Azure sign-in setup for GitHub Actions                                                          |
| `bin/deploy`                 | Create or update the Azure container app; `bin/deploy.d/containerapp.yaml` is its spec template          |
| `bin/replace-photos`         | Swap a record's photos on the live app                                                                   |
| `bin/sync`                   | Two-way sync of the catalog and the live app; the engine is `bin/sync.d/sync.py`                         |
| `lib/`                       | Shared bash for `bin/` (`common.sh`, `azure.sh`)                                                         |
| `docs/`                      | A page per command, plus `azure.md`, `docker.md`, `ci.md`, `sync-design.md`                              |
| `tools/artifact/`            | Claude's side of the sync (artifact ⇄ `api/seed/`)                                                       |
| `tools/sarif/`               | ESLint and TypeScript results as SARIF for GitHub code scanning                                          |
| `api/docker/`                | API Dockerfile and entrypoint                                                                            |
| `api/migrations/`            | SQL schema changes, applied in order on startup                                                          |
| `api/scripts/`               | `lint-openapi.ts` (`npm run lint:openapi`)                                                               |
| `api/seed/`                  | The catalog: `seed.json`, its photos, `sync-state.json`, `history/`                                      |
| `api/src/`                   | The API: `routes.ts`, `schemas.ts`, `openapi.ts`, `services/` (one per record type), `lib/`              |
| `web/docker/`                | Web Dockerfile and the nginx config template                                                             |
| `web/public/`                | Static files: icons, Home photos, The Car photos (`car/`)                                                |
| `web/src/`                   | The React app: `App.tsx`, `components/`, `car.ts` (The Car tab's photos and notes), `api.ts`, `types.ts` |
