#!/usr/bin/env bash
set -euo pipefail
docker compose down
npm --prefix site ci
npm --prefix site run build
docker compose build
