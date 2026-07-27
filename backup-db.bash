#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
output="${1:-backups/olrigbank-$(date +%Y%m%d-%H%M%S).dump}"

database_container="${SOCCOTASH_DATABASE_CONTAINER:-soccotash-database-1}"

docker exec "$database_container" sh -c \
  'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$output"

echo "Database backup written to $output"
