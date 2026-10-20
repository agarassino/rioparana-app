#!/usr/bin/env bash
# Explicitly approved release-device loop; sends real messages and a reply push.
set -euo pipefail
if [[ "${FEEDBACK_E2E_APPROVED:-}" != "1" ]]; then
  echo 'Explicit owner approval required: FEEDBACK_E2E_APPROVED=1' >&2
  exit 1
fi
: "${ADMIN_URL:?export the approved admin origin}"
: "${ADMIN_PASSWORD:?export the admin password, not its hash}"
MARKER="$(date +%s)"
export MARKER
maestro --platform android test -e MARKER="$MARKER" .maestro/feedback-send.yaml
node scripts/e2e-admin-reply.mjs
maestro --platform android test -e MARKER="$MARKER" .maestro/feedback-reply.yaml
echo "feedback e2e passed (marker $MARKER)"
