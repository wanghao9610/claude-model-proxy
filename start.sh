#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname "$0")" && pwd)
. "$SCRIPT_DIR/scripts/ensure-node.sh"

NODE_BIN=$(ensure_node)
exec "$NODE_BIN" "$SCRIPT_DIR/proxy.mjs"
