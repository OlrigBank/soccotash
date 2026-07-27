#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage: ./restore-db.bash backups/filename.dump" >&2
  exit 2
fi

backup_file="$1"
docker compose stop site >/dev/null
trap 'docker compose start site >/dev/null' EXIT

database_container="${SOCCOTASH_DATABASE_CONTAINER:-soccotash-database-1}"

docker exec -i "$database_container" sh -c \
  'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$backup_file"

echo "Database restored from $backup_file"
