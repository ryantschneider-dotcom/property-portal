#!/bin/zsh
set -euo pipefail
APP_ROOT="/Users/macclaw/projects/mission-control/mission-control-app"
PLIST_SRC="$APP_ROOT/launchd/com.pier.listing-research-worker.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.pier.listing-research-worker.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$PLIST_SRC" "$PLIST_DST"
chmod 644 "$PLIST_DST"
launchctl bootout gui/$(id -u) "$PLIST_DST" >/dev/null 2>&1 || true
launchctl bootstrap gui/$(id -u) "$PLIST_DST"
launchctl enable gui/$(id -u)/com.pier.listing-research-worker
launchctl kickstart -k gui/$(id -u)/com.pier.listing-research-worker
launchctl print gui/$(id -u)/com.pier.listing-research-worker | sed -n '1,80p'
