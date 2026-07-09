#!/usr/bin/env bash
# Deep-clean generated/build files from the Soccotash / OlrigBank Astro WebStorm project.
# Safe by default: preserves source, content, images, config, docs, .git, .idea, package.json and package-lock.json.

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=0
ASSUME_YES=0
KEEP_NODE_MODULES=0

usage() {
  cat <<'EOF'
Usage:
  ./deep-clean-webstorm-project.bash [options]

Options:
  --dry-run             Show what would be removed, but remove nothing.
  -y, --yes             Do not ask for confirmation.
  --keep-node-modules   Do not remove node_modules folders.
  -h, --help            Show this help.

Recommended use from the project root:
  ./deep-clean-webstorm-project.bash --dry-run
  ./deep-clean-webstorm-project.bash -y

After cleaning, reinstall/build with:
  npm --prefix site ci
  npm --prefix site run build
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -y|--yes)
      ASSUME_YES=1
      shift
      ;;
    --keep-node-modules)
      KEEP_NODE_MODULES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

cd "$PROJECT_ROOT"

# Guardrail: this should look like the Soccotash/Astro project root.
if [[ ! -f "render.yaml" || ! -d "site" || ! -f "site/package.json" || ! -f "site/astro.config.mjs" ]]; then
  cat >&2 <<EOF
This does not look like the expected project root:
  $PROJECT_ROOT

Expected to find:
  render.yaml
  site/package.json
  site/astro.config.mjs

Move this script to ~/WebstormProjects/soccotash, or run it from the project root.
EOF
  exit 1
fi

# Generated directories to remove. These are safe to recreate.
DIR_NAMES=(
  dist
  .astro
  .vite
  .cache
  coverage
  .turbo
  .parcel-cache
  .netlify
  .vercel
)

if [[ "$KEEP_NODE_MODULES" -eq 0 ]]; then
  DIR_NAMES+=(node_modules)
fi

# Generated/cache files to remove. Lock files are intentionally not included.
FILE_PATTERNS=(
  "*.tsbuildinfo"
  ".eslintcache"
  "npm-debug.log*"
  "yarn-debug.log*"
  "yarn-error.log*"
  "pnpm-debug.log*"
  ".DS_Store"
  "Thumbs.db"
)

# Build list of matching generated directories, excluding .git.
mapfile -d '' DIRS_TO_REMOVE < <(
  find "$PROJECT_ROOT" \
    -path "$PROJECT_ROOT/.git" -prune -o \
    -type d \( $(printf -- '-name %q -o ' "${DIR_NAMES[@]}" | sed 's/ -o $//') \) \
    -print0
)

# Build list of matching generated files, excluding .git.
mapfile -d '' FILES_TO_REMOVE < <(
  find "$PROJECT_ROOT" \
    -path "$PROJECT_ROOT/.git" -prune -o \
    -type f \( $(printf -- '-name %q -o ' "${FILE_PATTERNS[@]}" | sed 's/ -o $//') \) \
    -print0
)

TOTAL=$(( ${#DIRS_TO_REMOVE[@]} + ${#FILES_TO_REMOVE[@]} ))

echo "Project root: $PROJECT_ROOT"
echo "Generated directories/files found: $TOTAL"
echo

if [[ "$TOTAL" -eq 0 ]]; then
  echo "Nothing to clean."
  exit 0
fi

echo "Will remove:"
for p in "${DIRS_TO_REMOVE[@]}" "${FILES_TO_REMOVE[@]}"; do
  printf '  %s\n' "${p#$PROJECT_ROOT/}"
done

echo
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run only. Nothing was removed."
  exit 0
fi

if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Remove these generated files/directories? Type yes to continue: " REPLY
  if [[ "$REPLY" != "yes" ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

# Remove files first, then directories.
for p in "${FILES_TO_REMOVE[@]}"; do
  rm -f -- "$p"
done

for p in "${DIRS_TO_REMOVE[@]}"; do
  rm -rf -- "$p"
done

echo "Clean complete."
echo
echo "Next recommended commands:"
echo "  npm --prefix site ci"
echo "  npm --prefix site run build"
