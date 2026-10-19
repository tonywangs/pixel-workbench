#!/bin/sh
set -eu
cd "$(dirname "$0")"
node -e "if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 or newer is required')"
if [ ! -d node_modules ]; then
  npm ci
fi
exec node server.js
