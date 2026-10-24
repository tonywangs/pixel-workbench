#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm ci --cache "${TMPDIR:-/tmp}/contact-sheet-desk-npm" --no-audit --no-fund
fi
exec node server.js
