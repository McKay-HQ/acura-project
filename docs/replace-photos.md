# bin/replace-photos

Replaces the photos of a part, container or tossed item on the deployed app: uploads the new files, then deletes the photos the record had before.

```sh
./bin/replace-photos [-h] <parts|containers|tossed> <key-or-id> <photo>...
```

| Option |                |
| ------ | -------------- |
| `-h`   | Show this page |

The first photo becomes the main one. If the upload fails (wrong key, bad file, or someone changed the record meanwhile), nothing is deleted. Each write sends the record's version (`If-Match`). For catalog photos, `bin/sync` is usually the better tool.

## Examples

```sh
./bin/replace-photos containers box-hw hardware.jpg ask-cody.jpg
./bin/replace-photos parts injen-intake intake-1.jpg intake-2.jpg

# a local copy instead of Azure
APP_URL=http://localhost:8080 API_KEY=... ./bin/replace-photos parts injen-intake intake.jpg
```

## Environment

| Variable    | Default                                          |
| ----------- | ------------------------------------------------ |
| `APP_URL`   | the Azure app's address (looked up with `az`)    |
| `API_KEY`   | the app's `api-key` secret (looked up with `az`) |
| `RG`, `APP` | `acura-project`, `acura`                         |

## Needs

`curl` and `jq`; `az` signed in unless both `APP_URL` and `API_KEY` are set.
