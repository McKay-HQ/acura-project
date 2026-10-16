# Docs

| Page | What it covers |
|---|---|
| [docker.md](docker.md) | Running the app locally with Docker Compose, using a managed database, backups |
| [azure.md](azure.md) | Setting up Azure once, deploying, custom domain, logs |
| [build.md](build.md) | `bin/build`: build and push the images |
| [deploy.md](deploy.md) | `bin/deploy`: create or update the Azure container app |
| [sync.md](sync.md) | `bin/sync`: make the live app match the catalog (data and photos) |
| [replace-photos.md](replace-photos.md) | `bin/replace-photos`: swap a record's photos on the live app |

The API documents itself: open `/api/docs/` on any running copy of the app.

## Help in the terminal

Every command prints its page with `-h`, formatted by [glow](https://github.com/charmbracelet/glow) when it is installed (plain markdown otherwise). To install glow on Ubuntu/WSL:

```sh
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list
sudo apt update && sudo apt install -y glow
```
