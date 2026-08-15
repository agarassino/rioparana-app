#!/usr/bin/env bash
# Install the river push as a system LaunchDaemon.
#
# A LaunchAgent only loads once a user logs in, so an unattended reboot leaves
# the push dead until somebody sits at the machine. A daemon survives that,
# which matters when the machine has to keep the cache warm for weeks.
#
# Run with sudo:  sudo ./scripts/install-push-daemon.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run me with sudo" >&2
  exit 1
fi

TARGET_USER="${SUDO_USER:-}"
if [ -z "$TARGET_USER" ]; then
  echo "cannot tell which user to run as; set SUDO_USER" >&2
  exit 1
fi

USER_HOME="$(dscl . -read "/Users/$TARGET_USER" NFSHomeDirectory | awk '{print $2}')"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.syloper.rioparana.push"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"
LOG="${USER_HOME}/Library/Logs/rioparana-push.log"

# Drop the per-user agent so the two do not both fire.
AGENT="${USER_HOME}/Library/LaunchAgents/${LABEL}.plist"
if [ -f "$AGENT" ]; then
  sudo -u "$TARGET_USER" launchctl unload "$AGENT" 2>/dev/null || true
  rm -f "$AGENT"
  echo "removed the LaunchAgent"
fi

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>UserName</key>
    <string>${TARGET_USER}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${USER_HOME}</string>
    </dict>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${REPO}/scripts/push-river.sh</string>
    </array>

    <!-- Prefectura publishes two readings a day, at 00:00 and 12:00. -->
    <key>StartCalendarInterval</key>
    <array>
        <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>15</integer></dict>
        <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>15</integer></dict>
        <dict><key>Hour</key><integer>14</integer><key>Minute</key><integer>15</integer></dict>
        <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>15</integer></dict>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${LOG}</string>

    <key>StandardErrorPath</key>
    <string>${LOG}</string>
</dict>
</plist>
PLIST_EOF

chown root:wheel "$PLIST"
chmod 644 "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"

# Come back up on its own after a power cut.
pmset -a autorestart 1

echo "daemon installed: $PLIST"
echo "log: $LOG"
echo
echo "to remove it:"
echo "  sudo launchctl unload $PLIST && sudo rm $PLIST"
