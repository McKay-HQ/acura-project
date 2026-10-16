# Azure

The app runs as one **Container App** with two containers: nginx (`web`, public) and the API (`api`), which nginx reaches at `localhost:3000`. Around it:

| Resource | Name | Purpose |
|---|---|---|
| Resource group | `acura-project` | Holds everything, in `centralus` |
| Container registry | `acuraproject` | The `acura-api` and `acura-web` images |
| PostgreSQL flexible server | `acura-project-db` | The database (Burstable B1ms) |
| Container Apps environment | `acura-env` | Hosts the app, with the photo share attached as `uploads` |
| Storage account / file share | `acuraprojectfiles` / `uploads` | Photos, mounted at `/data/uploads` in the API |
| Managed identity | `acura-pull` | Lets the app pull images from the registry |
| Container app | `acura` | The app itself |

The app scales to zero when idle (the first visit after a quiet spell takes a few seconds) and to at most one copy.

## Day to day

```sh
./bin/deploy -b                                                          # ship changes
az containerapp logs show -n acura -g acura-project --container api --follow   # API logs
az containerapp revision list -n acura -g acura-project -o table         # revisions
```

## One-time setup

Install the Azure CLI in WSL and sign in:

```sh
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
az login --use-device-code
az extension add --name containerapp --upgrade
sudo apt install -y jq gettext-base postgresql-client
```

Settings (re-paste in each new terminal; generate the password only the first time and save it):

```sh
LOCATION=centralus RG=acura-project ACR=acuraproject PG_SERVER=acura-project-db
PG_ADMIN=acura_db_admin STORAGE=acuraprojectfiles ENV=acura-env
PG_PASSWORD="$(openssl rand -base64 30 | tr -d '/+=')Aa1"
```

Resources:

```sh
az group create -n $RG -l $LOCATION
for ns in Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.App \
          Microsoft.OperationalInsights Microsoft.Storage Microsoft.ManagedIdentity; do
    az provider register --namespace $ns
done

az acr create -g $RG -n $ACR --sku Basic -l $LOCATION

az postgres flexible-server create -g $RG -n $PG_SERVER -l $LOCATION \
    --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
    --admin-user $PG_ADMIN --admin-password "$PG_PASSWORD" --public-access 0.0.0.0 --yes -o none
MYIP=$(curl -s https://api.ipify.org)      # optional: lets psql connect from this machine
az postgres flexible-server firewall-rule create -g $RG --server-name $PG_SERVER \
    --name home --start-ip-address $MYIP --end-ip-address $MYIP

az containerapp env create -n $ENV -g $RG -l $LOCATION
az storage account create -n $STORAGE -g $RG -l $LOCATION --sku Standard_LRS --kind StorageV2
az storage share-rm create --storage-account $STORAGE -g $RG --name uploads --quota 5
STORAGE_KEY=$(az storage account keys list -n $STORAGE -g $RG --query "[0].value" -o tsv)
az containerapp env storage set -n $ENV -g $RG --storage-name uploads \
    --azure-file-account-name $STORAGE --azure-file-account-key "$STORAGE_KEY" \
    --azure-file-share-name uploads --access-mode ReadWrite
```

`--public-access 0.0.0.0` allows connections from Azure services, which is how the app reaches the database. `-o none` keeps the password out of the command's output.

Then build, push and create the app:

```sh
PG_PASSWORD="$PG_PASSWORD" ./bin/deploy -b
```

It prints the URL and an access key; save the key. See [deploy.md](deploy.md).

## Custom domain

For a subdomain such as `acura.mckayhq.com`:

1. Get the app's address and verification ID:
   ```sh
   az containerapp show -n acura -g acura-project --query properties.configuration.ingress.fqdn -o tsv
   az containerapp show -n acura -g acura-project --query properties.customDomainVerificationId -o tsv
   ```
2. At the DNS host add a **CNAME** `acura` → the app's address, and a **TXT** `asuid.acura` → the verification ID.
3. Once `nslookup -type=CNAME acura.mckayhq.com` answers, bind it (this also issues a free, auto-renewing certificate; allow 5–15 minutes):
   ```sh
   az containerapp hostname add  -n acura -g acura-project --hostname acura.mckayhq.com
   az containerapp hostname bind -n acura -g acura-project --hostname acura.mckayhq.com \
       --environment acura-env --validation-method CNAME
   ```

`bin/deploy` keeps domains that are already bound.

## Secrets

The app keeps two secrets: `pg-password` (the database password) and `api-key` (the access key for changes). `bin/deploy` reuses them on every update. To change one, pass it once: `API_KEY=... ./bin/deploy` or `PG_PASSWORD=... ./bin/deploy` (after changing the database password with `az postgres flexible-server update -g acura-project -n acura-project-db -p '...' -o none`).

## Troubleshooting

- **502 right after the first deploy:** the API is still loading the starter inventory; watch the API logs until it prints `API listening on :3000`.
- **Image pull errors on the first deploy:** the registry permission can take a few minutes to apply; run `./bin/deploy` again.
