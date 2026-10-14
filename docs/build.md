# bin/build

Builds the `api` and `web` images and pushes them to the Azure Container Registry.

```sh
./bin/build [-p] [-h]
```

| Option | |
|---|---|
| `-p` | `git pull` first, then build what was pulled |
| `-h` | Show this page |

## What it does

1. Signs in to the registry (`az acr login`).
2. `docker compose build api web`, then `docker compose push api web`.

Images are `acuraproject.azurecr.io/acura-api` and `acura-web`, built for `linux/amd64`. Only the two app services are pushed, never the local database image.

## Environment

| Variable | Default | |
|---|---|---|
| `ACR` | `acuraproject` | Registry name; images go to `$ACR.azurecr.io` |
| `IMAGE_TAG` | `latest` | Tag to build and push |

These win over `IMAGE_REGISTRY` / `IMAGE_TAG` in `.env`, so the registry you sign in to is the one you push to.

## Needs

`az` signed in (`az login`) and Docker with the compose plugin.

## Examples

```sh
./bin/build                      # build and push :latest
./bin/build -p                   # pull, then build and push
IMAGE_TAG=2026-10-14 ./bin/build # push a dated tag (:latest is left as it was)
```

To build and roll out in one step, use `./bin/deploy -b` (see [deploy.md](deploy.md)).
