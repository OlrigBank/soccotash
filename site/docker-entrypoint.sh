#!/bin/sh
set -eu

node ./scripts/wait-for-db.mjs
npm run db:migrate
exec "$@"
