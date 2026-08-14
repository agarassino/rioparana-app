#!/usr/bin/env bash
# Scrape the PNA index and push every station to the shared cache.
#
# Prefectura only answers Argentine residential IPs, so the server cannot do
# this itself. Run it from a machine inside Argentina. This is a stopgap: once
# the app ships with index scraping, any user's phone keeps the cache warm.
#
# Takes APP_API_KEY from the environment, then ~/.config/rioparana/push.env,
# then EXPO_PUBLIC_APP_API_KEY in .env.local.

set -euo pipefail

if [ -z "${APP_API_KEY:-}" ] && [ -f "$HOME/.config/rioparana/push.env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.config/rioparana/push.env"
fi

cd "$(dirname "$0")/.."

API_BASE="${API_BASE_URL:-https://api.rioparana.com.ar}"
PNA_URL="https://contenidosweb.prefecturanaval.gob.ar/alturas/"
CONFIG="server/src/config/stations.ts"

if [ -z "${APP_API_KEY:-}" ] && [ -f .env.local ]; then
  # Tolerate surrounding quotes, trailing carriage returns and stray spaces.
  APP_API_KEY="$(
    grep -E '^EXPO_PUBLIC_APP_API_KEY=' .env.local |
      head -1 | cut -d= -f2- | tr -d '\r' |
      sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
          -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
  )"
fi

if [ -z "${APP_API_KEY:-}" ]; then
  echo "$(date '+%F %T') APP_API_KEY not set and not found in .env.local" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -sS -m 45 \
  -H 'User-Agent: ParanaInfo-Push/1.0' -H 'Accept: text/html' \
  "$PNA_URL" -o "$WORK/index.html"

python3 scripts/build-river-payload.py "$WORK/index.html" "$CONFIG" "$WORK/payload.json"

response=$(curl -sS -m 45 -w '\n%{http_code}' \
  -X POST \
  -H "x-api-key: $APP_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary "@$WORK/payload.json" \
  "$API_BASE/river")

body=$(printf '%s' "$response" | sed '$d')
status=$(printf '%s' "$response" | tail -n1)

echo "$(date '+%F %T') HTTP $status $body"
[ "$status" = "200" ]
