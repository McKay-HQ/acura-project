# bin/sync

Makes the live app match the catalog in `api/seed/seed.json`, through the app's API. Only the differences are applied, so there is no rebuild or redeploy: new photos go straight to the app's photo storage (the Azure file share).

```sh
./bin/sync [-n] [-p] [-h]
```

| Option | |
|---|---|
| `-n` | Dry run: list the changes without making them |
| `-p` | `git pull` first, then sync what was pulled |
| `-h` | Show this page |

## Everyday use

```sh
./bin/sync -pn     # pull the latest catalog and see what would change
./bin/sync -p      # pull and apply
```

## What it compares

Records are matched by key (tasks by title):

| Record | Fields |
|---|---|
| Containers | name, location, notes, icon, order, parent container, photos |
| Parts | label, part number, fits, status, tags, values, notes, container, photos |
| Tossed | label, part number, reason, date, photos |
| Tasks | phase, notes, done, linked parts |
| Notes | title, items |

Missing records are created. Records that are in the app but not in the catalog are listed and left alone; nothing is deleted except photos that a record shouldn't have.

## Photos

Each photo remembers the file it was uploaded from (`source`). Catalog photos are named after their catalog id, e.g. `77dd58464b9a5e54c6bdc3f6f251c440.jpg`, so sync can tell which ones a record already has: it uploads the missing ones from `api/seed/photos`, removes the others, and puts them in the catalog's order.

## Environment

| Variable | Default |
|---|---|
| `APP_URL` | the Azure app's address (looked up with `az`) |
| `API_KEY` | the app's `api-key` secret (looked up with `az`) |

For a local copy: `APP_URL=http://localhost:8080 API_KEY=... ./bin/sync`.

## Needs

`python3` (part of Ubuntu), and `az` signed in unless both `APP_URL` and `API_KEY` are set.
