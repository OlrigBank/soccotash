#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and add the local secrets first." >&2
  exit 1
fi

docker compose up --build
