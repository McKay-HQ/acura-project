# GitHub Actions

`.github/workflows/deploy.yml` builds, deploys and syncs on every push to `main`, so you no longer need to run `bin/deploy` or `bin/sync` yourself.

| What changed | What the run does |
|---|---|
| Code (`api/src/`, `api/migrations/`, `api/docker/`, `api/scripts/`, `api/*.json`, `web/`, `docker-compose.yml`, `bin/build`, `bin/deploy`, `bin/deploy.d/`, `lib/`, the workflow) | Builds both images, pushes them tagged with the commit, rolls out a new revision, waits for it to answer, then syncs (`bin/deploy -b`) |
| Anything else, e.g. the catalog in `api/seed/` | Syncs the catalog with the app (`bin/sync`) |

Whatever the sync pulls from the app is committed back to `main` by `github-actions[bot]`. Commits made with the workflow's token don't start another run.

A run fails (red X) if the build or deploy fails, or if the sync finds a **conflict**: the same field changed in both the catalog and the app. Settle it locally with `./bin/sync -c` (catalog wins) or `./bin/sync -a` (app wins), see [sync.md](sync.md).

## Running it by hand

Actions tab > **Deploy** > **Run workflow**. With "Build and deploy even if no code changed" ticked it always builds and deploys; otherwise it only syncs, which is how to pull changes made in the app without pushing anything.

Runs never overlap: a push while a run is going waits for it.

## Setup

Once, from WSL (signed in with `az login`):

```sh
./bin/ci-setup
```

Until then the workflow is skipped. See [ci-setup.md](ci-setup.md). The workflow signs in to Azure with OpenID Connect, so no password or key is stored in GitHub.

## The local commands still work

`./bin/deploy -b` and `./bin/sync` are unchanged, for when you want to deploy from your machine. Images from the workflow are tagged with the commit (`acura-api:<sha>`); local builds use `latest`.
