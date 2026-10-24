#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm ci --cache "${TMPDIR:-/tmp}/svg-export-desk-npm"
fi
exec npm start
