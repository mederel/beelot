#!/usr/bin/env bash
# Applies Beelot's Zitadel settings (US-075, US-076, ADR-003) and writes to .env the OpenID Connect client and the token
# of beelot-jobs, the service account of the scheduled jobs. Safe to run any number of times: every step looks up what
# exists before creating or changing it.
#
# Local stack (docker compose up -d --wait): run it without arguments. Zitadel Cloud: set ZITADEL_URL, BEELOT_URL,
# ZITADEL_TOKEN (a service account with the IAM owner role) and the SMTP_* variables.
#
# Optional variables:
#   ZITADEL_URL         Zitadel's URL (default http://localhost:8081)
#   BEELOT_URL          Beelot's URL, for the redirect URIs (default http://localhost:8080)
#   ZITADEL_TOKEN       service account token (default: read from the local zitadel-api container)
#   ENV_FILE            where to write the client and the jobs token (default .env at the repository root)
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SENDER
#                       mail server (default: the local Mailpit, without authentication)
#   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
#                       Google and GitHub sign-in, with the callback URL $ZITADEL_URL/idps/callback
set -euo pipefail

cd "$(dirname "$0")/.."

ZITADEL_URL=${ZITADEL_URL:-http://localhost:8081}
ZITADEL_URL=${ZITADEL_URL%/}
BEELOT_URL=${BEELOT_URL:-http://localhost:8080}
BEELOT_URL=${BEELOT_URL%/}
ENV_FILE=${ENV_FILE:-.env}
SMTP_HOST=${SMTP_HOST:-mailpit}
SMTP_PORT=${SMTP_PORT:-1025}
SMTP_USER=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_SENDER=${SMTP_SENDER:-no-reply@beelot.localhost}
PROJECT_NAME=Beelot
APP_NAME=beelot-web
# The felt green of styles.css.
PRIMARY_COLOR=#0d9678

for tool in curl jq; do
  command -v "$tool" > /dev/null || { echo "provision.sh needs $tool" >&2; exit 1; }
done

if [[ -z ${ZITADEL_TOKEN:-} ]]; then
  ZITADEL_TOKEN=$(docker compose cp zitadel-api:/zitadel/bootstrap/beelot-setup.pat - | tar -xO)
fi

log() { echo "• $*"; }

# api METHOD PATH [JSON]: calls Zitadel and prints the response. A change that changes nothing ("not changed",
# "already exists") is not an error. The token and the body reach curl through a file descriptor and stdin, never as
# arguments, which other users of the machine could read in the process list.
api() {
  local method=$1 path=$2 body=${3:-} response status
  response=$(curl -sS -w '\n%{http_code}' -X "$method" "$ZITADEL_URL$path" \
    -H @<(printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$ZITADEL_TOKEN") \
    ${body:+--data-binary @-} <<< "$body")
  status=${response##*$'\n'}
  response=${response%$'\n'*}
  if [[ $status != 2* ]]; then
    if grep -qiE 'not ?(been )?changed|no changes|already ?(exists|active)' <<< "$response"; then
      echo '{}'
      return
    fi
    echo "Zitadel answered $status to $method $path: $response" >&2
    exit 1
  fi
  echo "$response"
}

log "Waiting for Zitadel at $ZITADEL_URL"
for _ in $(seq 60); do
  curl -sf "$ZITADEL_URL/debug/ready" > /dev/null && break
  sleep 2
done
curl -sf "$ZITADEL_URL/debug/ready" > /dev/null || { echo "Zitadel is not ready" >&2; exit 1; }

log "Passwords: at least 12 characters, no required character classes"
api PUT /admin/v1/policies/password/complexity \
  '{"minLength": 12, "hasUppercase": false, "hasLowercase": false, "hasNumber": false, "hasSymbol": false}' > /dev/null

log "Lock after 10 wrong passwords or 10 wrong codes"
api PUT /admin/v1/policies/password/lockout '{"maxPasswordAttempts": 10, "maxOtpAttempts": 10}' > /dev/null

log "Sign-in: registration on, unknown usernames hidden, no passkey-only accounts"
login_policy=$(api GET /admin/v1/policies/login | jq '.policy
  | {allowUsernamePassword: true, allowRegister: true, allowExternalIdp: true, forceMfa: false,
     passwordlessType: "PASSWORDLESS_TYPE_NOT_ALLOWED", hidePasswordReset: false, ignoreUnknownUsernames: true,
     allowDomainDiscovery: false, disableLoginWithEmail: false, disableLoginWithPhone: true,
     defaultRedirectUri: "", passwordCheckLifetime, externalLoginCheckLifetime, mfaInitSkipLifetime,
     secondFactorCheckLifetime, multiFactorCheckLifetime}')
api PUT /admin/v1/policies/login "$login_policy" > /dev/null

log "Languages: English, French and Dutch"
api PUT /admin/v1/restrictions '{"allowedLanguages": {"list": ["en", "fr", "nl"]}}' > /dev/null

log "Branding: Beelot's colours"
api PUT /admin/v1/policies/label "{\"primaryColor\": \"$PRIMARY_COLOR\", \"primaryColorDark\": \"$PRIMARY_COLOR\",
  \"hideLoginNameSuffix\": true, \"disableWatermark\": true}" > /dev/null
api POST /admin/v1/policies/label/_activate '{}' > /dev/null

log "Email: $SMTP_HOST:$SMTP_PORT"
smtp_body=$(SMTP_PASSWORD=$SMTP_PASSWORD jq -n --arg host "$SMTP_HOST:$SMTP_PORT" --arg user "$SMTP_USER" \
  --arg sender "$SMTP_SENDER" --argjson tls "$([[ $SMTP_HOST == mailpit ]] && echo false || echo true)" \
  '{senderAddress: $sender, senderName: "Beelot", host: $host, user: $user, password: env.SMTP_PASSWORD,
    tls: $tls, description: "Beelot"}')
smtp_id=$(api POST /admin/v1/smtp/_search '{}' | jq -r '[.result[]? | select(.description == "Beelot")][0].id // empty')
if [[ -z $smtp_id ]]; then
  smtp_id=$(api POST /admin/v1/smtp "$smtp_body" | jq -r .id)
else
  api PUT "/admin/v1/smtp/$smtp_id" "$smtp_body" > /dev/null
fi
api POST "/admin/v1/smtp/$smtp_id/_activate" '{}' > /dev/null

log "Project $PROJECT_NAME and application $APP_NAME"
project_id=$(api POST /management/v1/projects/_search \
  "{\"queries\": [{\"nameQuery\": {\"name\": \"$PROJECT_NAME\", \"method\": \"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
  | jq -r '.result[0].id // empty')
if [[ -z $project_id ]]; then
  project_id=$(api POST /management/v1/projects "{\"name\": \"$PROJECT_NAME\"}" | jq -r .id)
fi
dev_mode=$([[ $BEELOT_URL == http://* ]] && echo true || echo false)
oidc_config=$(jq -n --arg beelot "$BEELOT_URL" --argjson dev "$dev_mode" \
  '{redirectUris: [$beelot + "/login/oauth2/code/zitadel"], postLogoutRedirectUris: [$beelot + "/"],
    responseTypes: ["OIDC_RESPONSE_TYPE_CODE"], grantTypes: ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
    appType: "OIDC_APP_TYPE_WEB", authMethodType: "OIDC_AUTH_METHOD_TYPE_BASIC", devMode: $dev,
    accessTokenType: "OIDC_TOKEN_TYPE_BEARER"}')
app=$(api POST "/management/v1/projects/$project_id/apps/_search" \
  "{\"queries\": [{\"nameQuery\": {\"name\": \"$APP_NAME\", \"method\": \"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
  | jq '.result[0] // empty')
client_secret=""
if [[ -z $app ]]; then
  created=$(api POST "/management/v1/projects/$project_id/apps/oidc" \
    "$(jq --arg name "$APP_NAME" '. + {name: $name}' <<< "$oidc_config")")
  client_id=$(jq -r .clientId <<< "$created")
  client_secret=$(jq -r .clientSecret <<< "$created")
else
  app_id=$(jq -r .id <<< "$app")
  client_id=$(jq -r .oidcConfig.clientId <<< "$app")
  api PUT "/management/v1/projects/$project_id/apps/$app_id/oidc_config" "$oidc_config" > /dev/null
  # Zitadel shows a secret only once: keep the one already written, else generate a new one.
  if [[ -f $ENV_FILE ]] && grep -q "^BEELOT_ZITADEL_CLIENT_ID=$client_id$" "$ENV_FILE"; then
    client_secret=$(sed -n 's/^BEELOT_ZITADEL_CLIENT_SECRET=//p' "$ENV_FILE")
  fi
  if [[ -z $client_secret ]]; then
    client_secret=$(api POST "/management/v1/projects/$project_id/apps/$app_id/oidc_config/_generate_client_secret" \
      '{}' | jq -r .clientSecret)
  fi
fi

# add_idp TYPE NAME CLIENT_ID CLIENT_SECRET SCOPES_JSON: an external identity provider, shown on the sign-in page.
add_idp() {
  local type=$1 name=$2 id=$3 secret=$4 scopes=$5 idp_id body
  body=$(IDP_SECRET=$secret jq -n --arg name "$name" --arg id "$id" --argjson scopes "$scopes" \
    '{name: $name, clientId: $id, clientSecret: env.IDP_SECRET, scopes: $scopes,
      providerOptions: {isLinkingAllowed: true, isCreationAllowed: true, isAutoCreation: true, isAutoUpdate: false}}')
  idp_id=$(api POST /admin/v1/idps/templates/_search \
    "{\"queries\": [{\"idpNameQuery\": {\"name\": \"$name\", \"method\": \"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
    | jq -r '.result[0].id // empty')
  if [[ -z $idp_id ]]; then
    idp_id=$(api POST "/admin/v1/idps/$type" "$body" | jq -r .id)
  else
    api PUT "/admin/v1/idps/$type/$idp_id" "$body" > /dev/null
  fi
  api POST /admin/v1/policies/login/idps "{\"idpId\": \"$idp_id\"}" > /dev/null
}
if [[ -n ${GOOGLE_CLIENT_ID:-} && -n ${GOOGLE_CLIENT_SECRET:-} ]]; then
  log "Google sign-in"
  add_idp google Google "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" '["openid", "profile", "email"]'
fi
if [[ -n ${GITHUB_CLIENT_ID:-} && -n ${GITHUB_CLIENT_SECRET:-} ]]; then
  log "GitHub sign-in"
  add_idp github GitHub "$GITHUB_CLIENT_ID" "$GITHUB_CLIENT_SECRET" '["read:user", "user:email"]'
fi

log "Email confirmation codes: valid 24 hours"
code_generator=$(api GET /admin/v1/secretgenerators/SECRET_GENERATOR_TYPE_VERIFY_EMAIL_CODE | jq '.secretGenerator
  | {length, includeLowerLetters, includeUpperLetters, includeDigits, includeSymbols, expiry: "86400s"}')
api PUT /admin/v1/secretgenerators/SECRET_GENERATOR_TYPE_VERIFY_EMAIL_CODE "$code_generator" > /dev/null

log "Service account beelot-jobs: manages the organization's users, nothing else"
jobs_id=$(api POST /management/v1/users/_search \
  '{"queries": [{"userNameQuery": {"userName": "beelot-jobs", "method": "TEXT_QUERY_METHOD_EQUALS"}}]}' \
  | jq -r '.result[0].id // empty')
if [[ -z $jobs_id ]]; then
  jobs_id=$(api POST /management/v1/users/machine \
    '{"userName": "beelot-jobs", "name": "Beelot jobs", "accessTokenType": "ACCESS_TOKEN_TYPE_BEARER"}' | jq -r .userId)
fi
api POST /management/v1/orgs/me/members "{\"userId\": \"$jobs_id\", \"roles\": [\"ORG_USER_MANAGER\"]}" > /dev/null
# Zitadel shows a token only once: keep the one already written while Zitadel still accepts it, else create one.
api_token=""
if [[ -f $ENV_FILE ]]; then
  api_token=$(sed -n 's/^BEELOT_ZITADEL_API_TOKEN=//p' "$ENV_FILE")
fi
if [[ -n $api_token ]] && [[ $(curl -sS -o /dev/null -w '%{http_code}' -X POST "$ZITADEL_URL/v2/users" \
    -H @<(printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$api_token") \
    --data-binary '{"query": {"limit": 1}}') != 200 ]]; then
  api_token=""
fi
if [[ -z $api_token ]]; then
  api_token=$(api POST "/management/v1/users/$jobs_id/pats" '{"expirationDate": "2099-01-01T00:00:00Z"}' \
    | jq -r .token)
fi

log "Writing the client and the jobs token to $ENV_FILE"
touch "$ENV_FILE"
(
  umask 077
  { grep -v '^BEELOT_ZITADEL_' "$ENV_FILE" || true
    echo "BEELOT_ZITADEL_ISSUER=$ZITADEL_URL"
    echo "BEELOT_ZITADEL_CLIENT_ID=$client_id"
    echo "BEELOT_ZITADEL_CLIENT_SECRET=$client_secret"
    echo "BEELOT_ZITADEL_API_TOKEN=$api_token"
  } > "$ENV_FILE.new"
)
mv "$ENV_FILE.new" "$ENV_FILE"
log "Done"
