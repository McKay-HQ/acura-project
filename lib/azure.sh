# shellcheck shell=bash
# Azure names and lookups shared by the scripts in bin/. Source it after common.sh.
# Every name can be overridden from the environment, e.g. RG=other ./bin/deploy.

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

# True when the container app already exists.
app_exists() {
    az containerapp show --only-show-errors -n "$APP" -g "$RG" -o none 2>/dev/null
}

# The app's public address, e.g. https://acura.<random>.centralus.azurecontainerapps.io
app_url() {
    echo "https://$(az containerapp show --only-show-errors -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
}

# The value of one of the app's secrets (pg-password, api-key).
app_secret() {
    az containerapp secret list --only-show-errors -n "$APP" -g "$RG" --show-values --query "[?name=='$1'].value | [0]" -o tsv
}

# The custom domains bound to the app, as compact JSON ([] when there are none).
app_custom_domains() {
    local json
    json=$(az containerapp show --only-show-errors -n "$APP" -g "$RG" --query properties.configuration.ingress.customDomains -o json | jq -c '. // []')
    echo "${json:-[]}"
}
