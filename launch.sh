#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/pip ]; then
  python3 -m venv .venv || { echo 'Install Python 3 with venv support, then retry.'; exit 1; }
fi
.venv/bin/pip install -q -r requirements.txt
exec .venv/bin/python server.py "$@"
