#!/bin/zsh
set -euo pipefail
APP_ROOT="${MISSION_CONTROL_APP_ROOT:-/Users/macclaw/projects/mission-control/mission-control-app}"
cd "$APP_ROOT"
export MISSION_CONTROL_APP_ROOT="$APP_ROOT"
export NODE_ENV=production
case " ${NODE_OPTIONS:-} " in
  *" --dns-result-order=ipv4first "*) ;;
  *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first" ;;
esac
if command -v npm >/dev/null 2>&1; then
  exec npm exec tsx -- scripts/listing-research-worker.ts
fi
if [ -x /opt/homebrew/bin/npm ]; then
  exec /opt/homebrew/bin/npm exec tsx -- scripts/listing-research-worker.ts
fi
if [ -x /usr/local/bin/npm ]; then
  exec /usr/local/bin/npm exec tsx -- scripts/listing-research-worker.ts
fi
echo "npm not found for listing research worker" >&2
exit 127
