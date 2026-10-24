#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm ci --cache "${TMPDIR:-/tmp}/photo-review-npm"
fi
exec node server.js
