#!/bin/sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$APP_ROOT"
# This ZIP contains Windows binaries. Linux/macOS must supply a native Node.js 22+ runtime.
if [ -x "resources/runtime/node" ]; then
  NODE_BIN="$APP_ROOT/resources/runtime/node"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
else
  printf '%s\n' 'Native Node.js 22+ is required on Linux/macOS; this ZIP bundles Windows x64 only.' >&2
  exit 1
fi
export ENGEE_AGENT_PORT="${ENGEE_AGENT_PORT:-3081}"
printf '%s\n' "Engee Agent: http://127.0.0.1:$ENGEE_AGENT_PORT/"
printf '%s\n' 'For local GGUF inference, provide a native llama-server runtime; remote providers require only Node.js.'
exec "$NODE_BIN" "$APP_ROOT/resources/web/server.mjs"
