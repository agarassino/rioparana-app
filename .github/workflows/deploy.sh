#!/usr/bin/env bash
# Ask Coolify to redeploy one application and fail loudly if it refuses.
# Usage: deploy.sh <uuid> <nombre>

set -euo pipefail

UUID="$1"
NAME="$2"
COOLIFY="${COOLIFY_URL:-http://100.89.213.31:8000}"

response=$(curl -sS -m 60 -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  "${COOLIFY}/api/v1/deploy?uuid=${UUID}")

body=$(printf '%s' "$response" | sed '$d')
status=$(printf '%s' "$response" | tail -n1)

echo "$NAME -> HTTP $status"
echo "$body"

if [ "$status" != "200" ]; then
  echo "::error::el deploy de $NAME no fue aceptado (HTTP $status)"
  exit 1
fi
