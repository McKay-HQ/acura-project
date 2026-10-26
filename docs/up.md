# bin/up, bin/down

Starts the dev stack: Vite's dev server for the web app, which reloads the page as files in `web/` change, with the API and, when `.env` turns on the `localdb` profile, the local Postgres behind it.

```sh
./bin/up [-h]
./bin/down [-h]
```

| Option |                |
| ------ | -------------- |
| `-h`   | Show this page |

It runs `docker compose up -d --build --wait vite` and prints the address, http://localhost:5173 by default. The `vite` service in `docker-compose.yml` is the `web-dev` container (the `dev` stage of `web/docker/Dockerfile`, with the repo mounted, as your user) running `vite`; it forwards `/api` and `/uploads` to the `api` container, as nginx does in the built app. Running it again rebuilds anything that changed (an image after a `package.json` change, the API after a code change) and leaves the rest running.

`./bin/down` stops it: `docker compose --profile '*' down`, which turns on every profile and stops every container in `docker-compose.yml`, the built app's too, and keeps the data in `data/`.

The API runs its built image, so API changes need `./bin/up` again; only the web app reloads by itself. The built app (`docker compose up -d --build`, port 8080) can run alongside.

## Examples

```sh
./bin/up                             # start, or update after an API change
docker compose logs -f vite api      # follow the logs
./bin/down                           # stop everything
```

A plain `docker compose down` leaves `vite` running: services in a profile are only included when the profile is on. `./bin/down` turns every profile on.

## Environment

| Variable    | Default                          |
| ----------- | -------------------------------- |
| `VITE_PORT` | `5173`, from `.env` or the shell |

## Needs

Docker with the compose plugin (see [docker.md](docker.md)).
