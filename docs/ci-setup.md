# bin/ci-setup

One-time setup so the GitHub Actions workflow ([ci.md](ci.md)) can deploy to Azure. Safe to run again.

```sh
./bin/ci-setup [-h]
```

## What it does

1. Creates an app registration `acura-github-deploy` in Microsoft Entra ID (or reuses it).
2. Adds federated credentials that trust GitHub Actions runs of `patrick-vandy/acura-project` in the `production` environment, under both forms of name GitHub uses for the repo (`owner/repo`, and `owner@id/repo@id`, looked up with `gh`). The workflow signs in with a short-lived token from GitHub; nothing secret is stored.
3. Grants it **Contributor** on the `acura-project` resource group (build and push images, update the container app, read its secrets for the sync).
4. Sets the repository variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` with the GitHub CLI (`gh`) if it's installed and signed in; otherwise it prints them for you to add under Settings > Secrets and variables > Actions > Variables.

## Environment

| Variable | Default |
|---|---|
| `REPO` | `patrick-vandy/acura-project` |
| `SP_NAME` | `acura-github-deploy` |
| `SUBJECT` | none; an extra subject to trust, copied from an Azure sign-in error |
| `RG` | `acura-project` |

## Needs

`az` signed in as someone who can create app registrations and assign roles on the resource group (the subscription owner can). Optional: `gh` (`sudo apt install gh`, then `gh auth login`).
