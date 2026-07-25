#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
output="${1:-backups/olrigbank-$(date +%Y%m%d-%H%M%S).dump}"

docker compose -p soccotash exec -T database sh -c \
  'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$output"

echo "Database backup written to $output"
