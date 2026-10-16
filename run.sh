#!/usr/bin/env bash
# Creates the virtual environment on first run, then starts AutoMold 3D.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .venv/.installed ]; then
  [ -d .venv ] || python3.12 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.txt
  touch .venv/.installed
fi
exec .venv/bin/python -m automold3d.main "$@"
