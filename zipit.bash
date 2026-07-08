#!/usr/bin/env bash
zip -r ../soccotash-render-deploy.zip . \
  -x ".git/*" \
  -x ".idea/*" \
  -x "node_modules/*" \
  -x "site/node_modules/*" \
  -x "site/dist/*" \
  -x "site/.astro/*" \
  -x ".vite/*" \
  -x "site/.vite/*" \
  -x "*.zip" \
  -x "**/*.log"

