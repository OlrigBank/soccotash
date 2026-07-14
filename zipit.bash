#!/usr/bin/env bash
set -euo pipefail

OUTPUT="../soccotash-render-deploy-no-images.zip"

rm -f "$OUTPUT"

zip -r "$OUTPUT" . \
  -x ".git/*" \
  -x ".idea/*" \
  -x ".env" \
  -x "*/.env" \
  -x "*.env.local" \
  -x "*/.env.local" \
  -x "backups/*" \
  -x "*.dump" \
  -x "airbnb-*.ics" \
  -x "node_modules/*" \
  -x "site/node_modules/*" \
  -x "site/dist/*" \
  -x "site/.astro/*" \
  -x ".vite/*" \
  -x "site/.vite/*" \
  -x "*.zip" \
  -x "*.png" \
  -x "*.PNG" \
  -x "*.jpeg" \
  -x "*.JPEG" \
  -x "*.jpg" \
  -x "*.JPG" \
  -x "**/*.png" \
  -x "**/*.PNG" \
  -x "**/*.jpeg" \
  -x "**/*.JPEG" \
  -x "**/*.jpg" \
  -x "**/*.JPG" \
  -x "**/*.log"

# Force image directory structure to be included, even when images are excluded.
find site/public/media/images -type d | sed 's#$#/#' | zip -q "$OUTPUT" -@
