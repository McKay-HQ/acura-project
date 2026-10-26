# bin/api, bin/web

Run a command with Node in the API's or the web app's dev container, so nothing needs Node on the host. The arguments are the command, passed through as they are; with none, you get a shell.

```sh
./bin/api [-h] [command [args...]]
./bin/web [-h] [command [args...]]
```

| Option |                                                              |
| ------ | ------------------------------------------------------------ |
| `-h`   | Show this page (only as the first argument; later ones pass) |

The containers are the `api-dev` and `web-dev` services in `docker-compose.yml`: the `dev` stage of each package's `docker/Dockerfile`, which is Node 22 and the package's dependencies. They mount the repo at `/repo` and run as you, so files they write are yours. The command runs from the same place in the repo as your current directory (from the package when you're outside the repo), which makes `./bin/web npm run check` at the root the repo-wide check. Their `dev` profile keeps them out of `docker compose up` and `build`; the first run builds the image.

Use `bin/api` for files under `api/` and `bin/web` for files under `web/`. For repo-wide commands from the root, either works.

## Examples

```sh
./bin/web npm run check                 # lint and typecheck everything, from the repo root
./bin/web npx eslint --fix web/src      # fix one folder
cd api && ../bin/api npm run lint:openapi
./bin/api npm install express@latest    # changes api/package.json and api/node_modules on the host
./bin/web                               # a shell in the web container
```

After a package's `package.json` changes, rebuild its image: `docker compose build web-dev` (or `api-dev`).

## Needs

Docker with the compose plugin (see [docker.md](docker.md)).
