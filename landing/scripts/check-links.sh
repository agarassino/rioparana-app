#!/usr/bin/env bash
# Check that every listed service still answers.
#
# Directory links rot: businesses close, domains lapse, servers go down. A
# directory pointing at a dead site is worse than one that omits the entry.
#
# Some hosts answer 403 or 406 to a plain user agent and 200 to a browser, so
# each URL is tried both ways and only counted as broken when both fail.

set -uo pipefail
cd "$(dirname "$0")/.."

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
broken=0

while IFS=$'\t' read -r id url; do
  a=$(curl -s -m 15 -o /dev/null -w '%{http_code}' -L -A "$UA" "$url" 2>/dev/null)
  b=$(curl -s -m 15 -o /dev/null -w '%{http_code}' -L "$url" 2>/dev/null)
  if [ "$a" = "200" ] || [ "$b" = "200" ]; then
    printf 'ok      %-28s %s\n' "$id" "$url"
  else
    printf 'ROTO    %-28s %s  (%s/%s)\n' "$id" "$url" "$a" "$b"
    broken=$((broken + 1))
  fi
done < <(python3 -c "
import json
for s in json.load(open('data/servicios.json', encoding='utf-8')):
    print(s['id'], s['contacto'], sep='\t')
")

echo
if [ "$broken" -gt 0 ]; then
  echo "$broken enlace(s) sin responder. Reintentar antes de dar de baja: una caída puede ser pasajera."
  exit 1
fi
echo "todos los enlaces responden"
