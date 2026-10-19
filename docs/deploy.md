# bin/deploy

Creates the Azure container app the first time and updates it after that. One app runs both containers: nginx (`web`, public) and the API (`api`, reached by nginx at `localhost:3000`).

```sh
./bin/deploy [-b] [-P] [-h]
```

| Option |                                                    |
| ------ | -------------------------------------------------- |
| `-b`   | Run `bin/build` first (build and push both images) |
| `-P`   | Don't run `git pull` first                         |
| `-h`   | Show this page                                     |

Lowercase options turn something on; uppercase ones turn a default off.

## Everyday use

```sh
./bin/deploy -b       # pull, build, push, roll out
```

## First deploy

```sh
PG_PASSWORD='the database password' ./bin/deploy -b
```

It prompts for the password if `PG_PASSWORD` isn't set, creates the app, and prints the app's URL and a new **access key** for making changes. Save the key. The first start loads the starter inventory and photos, which takes a few minutes; until then the site returns 502.

## What it does

1. Checks the Container Apps environment and its `uploads` photo storage.
2. Creates the managed identity the app uses to pull images and grants it `AcrPull` on the registry (once; the first time it waits a minute for the permission to apply).
3. Fills in `bin/deploy.d/containerapp.yaml` and applies it with `az containerapp create` or `update`. The filled-in copy holds secrets, so it lives in a private temp file that is always deleted.
4. Waits for the new revision to start and the API to answer (up to 15 minutes, since the first start loads the starter data); the deploy fails if it doesn't come up.

Every run creates a new revision (`revisionSuffix`), so Azure pulls the current images even when the tag hasn't changed.

Exit status: 0 when deployed, 1 on errors.

## What carries over between deploys

On an update the script reads these from the running app, unless you set them:

- **Database password** (`pg-password` secret); set `PG_PASSWORD` to change it.
- **Access key** (`api-key` secret); set `API_KEY` to change it.
- **Custom domains** and their certificates (see [azure.md](azure.md#custom-domain)).

## Environment

| Variable                                 | Default                                            |
| ---------------------------------------- | -------------------------------------------------- |
| `LOCATION`                               | `centralus`                                        |
| `RG`                                     | `acura-project`                                    |
| `ACR`                                    | `acuraproject`                                     |
| `APP`                                    | `acura`                                            |
| `ENV`                                    | `acura-env`                                        |
| `IDENTITY`                               | `acura-pull`                                       |
| `PG_SERVER` / `PG_ADMIN` / `PG_DATABASE` | `acura-project-db` / `acura_db_admin` / `postgres` |
| `IMAGE_TAG`                              | `latest`                                           |
| `PG_PASSWORD`, `API_KEY`                 | read from the app's secrets on updates             |

## Changing the app's definition

Container sizes, scaling, environment variables and the photo volume are in `bin/deploy.d/containerapp.yaml`. Edit it and run `./bin/deploy`.

## Needs

`az` signed in, `envsubst` (`gettext-base`), `jq` and `curl`. The Azure resources from [azure.md](azure.md) must exist.
