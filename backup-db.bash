#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
output="${1:-backups/soccotash-$(date +%Y%m%d-%H%M%S).dump}"

docker compose exec -T database sh -c \
  'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$output"

echo "Database backup written to $output"
