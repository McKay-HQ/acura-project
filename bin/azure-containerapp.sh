#!/usr/bin/env bash
# Creates (or updates) the RSX Type-S Project container app in Azure Container Apps.
#
# One app runs both containers: nginx ("web", public on port 80) and the API ("api",
# reached by nginx at localhost:3000). Photos live on the Azure Files share "uploads"
# that is attached to the Container Apps environment.
#
# Expects these to exist already (see README, "Deploy to Azure Container Apps"):
#   resource group, container registry with the acura-api and acura-web images,
#   PostgreSQL flexible server, Container Apps environment with storage "uploads".
#
# Usage:
#   PG_PASSWORD='...' ./bin/azure-containerapp.sh        # or it prompts for it
# Optional: API_KEY='...' to reuse an existing access key (a new one is generated otherwise).
set -euo pipefail

command -v envsubst >/dev/null || { echo "envsubst is missing: sudo apt install -y gettext-base" >&2; exit 1; }

LOCATION=${LOCATION:-centralus}
RG=${RG:-acura-project}
ACR=${ACR:-acuraproject}
PG_SERVER=${PG_SERVER:-acura-project-db}
PG_ADMIN=${PG_ADMIN:-acura_db_admin}
PG_DATABASE=${PG_DATABASE:-postgres}
ENV=${ENV:-acura-env}
APP=${APP:-acura}
IDENTITY=${IDENTITY:-acura-pull}
IMAGE_TAG=${IMAGE_TAG:-latest}

if [ -z "${PG_PASSWORD:-}" ]; then
    read -rsp "Database password for $PG_ADMIN: " PG_PASSWORD
    echo
fi
NEW_KEY=0
if [ -z "${API_KEY:-}" ]; then
    API_KEY=$(openssl rand -hex 24)
    NEW_KEY=1
fi

echo "Checking the environment and its photo storage..."
ENV_ID=$(az containerapp env show -n "$ENV" -g "$RG" --query id -o tsv)
az containerapp env storage show -n "$ENV" -g "$RG" --storage-name uploads -o none

echo "Creating the identity the app uses to pull images..."
az identity create -n "$IDENTITY" -g "$RG" -l "$LOCATION" -o none
IDENTITY_ID=$(az identity show -n "$IDENTITY" -g "$RG" --query id -o tsv)
PRINCIPAL_ID=$(az identity show -n "$IDENTITY" -g "$RG" --query principalId -o tsv)
ACR_ID=$(az acr show -n "$ACR" -g "$RG" --query id -o tsv)
if [ -z "$(az role assignment list --assignee "$PRINCIPAL_ID" --scope "$ACR_ID" --role AcrPull --query '[0].id' -o tsv)" ]; then
    az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
        --role AcrPull --scope "$ACR_ID" -o none
    echo "Waiting a minute for the registry permission to take effect..."
    sleep 60
fi

# Fill in the spec template. It ends up holding secrets, so it goes in a private temp
# file that is always removed. Only the variables listed here are substituted.
SPEC_TEMPLATE="$(dirname "$0")/../deploy/containerapp.yaml"
SPEC_VARS='${LOCATION} ${IDENTITY_ID} ${ENV_ID} ${ACR} ${IMAGE_TAG} ${PG_SERVER} ${PG_ADMIN} ${PG_DATABASE} ${PG_PASSWORD} ${API_KEY}'
export LOCATION IDENTITY_ID ENV_ID ACR IMAGE_TAG PG_SERVER PG_ADMIN PG_DATABASE PG_PASSWORD API_KEY
umask 077
SPEC=$(mktemp --suffix=.yaml)
trap 'rm -f "$SPEC"' EXIT
envsubst "$SPEC_VARS" < "$SPEC_TEMPLATE" > "$SPEC"

if az containerapp show -n "$APP" -g "$RG" -o none 2>/dev/null; then
    echo "Updating container app $APP..."
    az containerapp update -n "$APP" -g "$RG" --yaml "$SPEC" -o none
else
    echo "Creating container app $APP..."
    az containerapp create -n "$APP" -g "$RG" --yaml "$SPEC" -o none
fi

URL=$(az containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)
echo
echo "App: https://$URL"
echo "The first start creates the tables and loads the starter inventory and photos (about a minute)."
echo "Watch it with: az containerapp logs show -n $APP -g $RG --container api --follow"
if [ "$NEW_KEY" = 1 ]; then
    echo
    echo "Access key for making changes (save it in your password manager; the app asks for it once per browser):"
    echo "  $API_KEY"
fi
