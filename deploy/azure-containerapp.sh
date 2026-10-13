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
#   PG_PASSWORD='...' ./deploy/azure-containerapp.sh        # or it prompts for it
# Optional: API_KEY='...' to reuse an existing access key (a new one is generated otherwise).
set -euo pipefail

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

# The spec holds secrets, so it lives in a private temp file that is always removed.
umask 077
SPEC=$(mktemp --suffix=.yaml)
trap 'rm -f "$SPEC"' EXIT

cat > "$SPEC" <<YAML
location: $LOCATION
identity:
  type: UserAssigned
  userAssignedIdentities:
    $IDENTITY_ID: {}
properties:
  managedEnvironmentId: $ENV_ID
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: true
      targetPort: 80
      transport: auto
      allowInsecure: false
    registries:
      - server: $ACR.azurecr.io
        identity: $IDENTITY_ID
    secrets:
      - name: pg-password
        value: "$PG_PASSWORD"
      - name: api-key
        value: "$API_KEY"
  template:
    containers:
      - name: web
        image: $ACR.azurecr.io/acura-web:$IMAGE_TAG
        resources:
          cpu: 0.25
          memory: 0.5Gi
        env:
          - name: API_URL
            value: http://localhost:3000
      - name: api
        image: $ACR.azurecr.io/acura-api:$IMAGE_TAG
        resources:
          cpu: 0.5
          memory: 1Gi
        env:
          - name: PGHOST
            value: $PG_SERVER.postgres.database.azure.com
          - name: PGPORT
            value: "5432"
          - name: PGUSER
            value: $PG_ADMIN
          - name: PGDATABASE
            value: $PG_DATABASE
          - name: PGPASSWORD
            secretRef: pg-password
          - name: DATABASE_SSL
            value: require
          - name: DB_POOL_MAX
            value: "5"
          - name: API_KEY
            secretRef: api-key
        volumeMounts:
          - volumeName: uploads
            mountPath: /data/uploads
    scale:
      minReplicas: 0
      maxReplicas: 1
    volumes:
      - name: uploads
        storageType: AzureFile
        storageName: uploads
        # The share can't be chowned; mount it as the image's "node" user (uid/gid 1000).
        mountOptions: uid=1000,gid=1000,dir_mode=0755,file_mode=0644
YAML

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
