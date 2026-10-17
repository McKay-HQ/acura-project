# bin/sync

Two-way sync between the catalog (`api/seed/`) and the live app, through the app's API. Changes made on either side since the last sync are copied to the other; no rebuild or redeploy is needed.

```sh
./bin/sync [-d] [-C] [-c | -a] [-P] [-h]
```

| Option |                                                           |
| ------ | --------------------------------------------------------- |
| `-d`   | Dry run: list the changes without making them             |
| `-C`   | Don't commit the updated catalog or open its pull request |
| `-c`   | Settle conflicts in favor of the catalog                  |
| `-a`   | Settle conflicts in favor of the app                      |
| `-P`   | Don't run `git pull` first                                |
| `-h`   | Show this page                                            |

Lowercase options turn something on; uppercase ones turn a default off.

## Everyday use

```sh
./bin/sync         # pull the latest catalog, sync both ways, push what came from the app
```

Then tell Claude to "pull app changes into the artifact" if the app side changed.

## How it decides

Each record (matched by key) is compared three ways: the catalog, the app, and how both looked at the last sync (`api/seed/sync-state.json`).

- **Changed on one side:** copied to the other, including creates and deletes. Photos added in the app are downloaded into `api/seed/photos/`.
- **Changed on both sides, different fields:** merged.
- **The same field changed on both sides:** a **conflict**. It's reported and that record is left alone on both sides until you pick a side with `-c` or `-a`, or make them match.

Writes to the app carry the version the sync just read (`If-Match`). If someone saves an edit in the app at that moment, the app refuses the write (412), nothing is overwritten, and the record is reported; the next run picks it up.

When the run pulled anything from the app, it commits the changes to `api/seed/` (and nothing else) on a new `sync/catalog-<date>-<time>` branch off `origin/main`, whatever branch you're on, pushes it and opens a pull request into `main`, labeled `sync` (no version bump), that merges itself (with auto-merge once checks pass, if the repo allows auto-merge; otherwise right away). Without `gh` signed in, it prints the branch to open a pull request for. Your current branch is left as it was (its `api/seed/` goes back to its last commit); `git pull` brings the catalog in once the pull request is merged. `-C` skips all of this.

Exit status: 0 in sync, 3 when conflicts were left, 1 on errors.

## Environment

| Variable  | Default                                          |
| --------- | ------------------------------------------------ |
| `APP_URL` | the Azure app's address (looked up with `az`)    |
| `API_KEY` | the app's `api-key` secret (looked up with `az`) |

For a local copy: `APP_URL=http://localhost:8080 API_KEY=... ./bin/sync -C`.

## Needs

`python3` (part of Ubuntu), `git`, `gh` signed in (to open the catalog pull request), and `az` signed in unless both `APP_URL` and `API_KEY` are set. Design notes: [sync-design.md](sync-design.md).
