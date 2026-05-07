#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
ENV_FILE="${CLAUDE_MODEL_PROXY_ENV_FILE:-$HOME/.claude-model-proxy.env}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

export CLAUDE_MODEL_PROXY_FOREGROUND=1
exec "$ROOT_DIR/start.sh"
