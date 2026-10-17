# bin/access-key

Prints the deployed app's access key: the `api-key` secret of the Azure container app, which unlocks changes in the app (and reads too, when the app is set to require the key for them).

```sh
./bin/access-key [-h]
```

| Option |                |
| ------ | -------------- |
| `-h`   | Show this page |

Only the key is printed, so it can be captured. To change the key, see [azure.md](azure.md#secrets).

## Examples

```sh
./bin/access-key              # then paste it into the app's Unlock form
./bin/access-key | clip.exe   # straight to the Windows clipboard, from WSL
```

## Environment

| Variable    | Default                  |
| ----------- | ------------------------ |
| `RG`, `APP` | `acura-project`, `acura` |

## Needs

`az` signed in (see [azure.md](azure.md)).
