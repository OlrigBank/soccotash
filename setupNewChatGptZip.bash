#!/usr/bin/env bash

set -Eeuo pipefail

BASE_DIR="${SOCCOTASH_BASE_DIR:-/home/bryan/WebstormProjects/ChatGPT}"
CURRENT_DIR="$BASE_DIR/soccotash"
PREVIOUS_DIR="$BASE_DIR/soccotash-last"
REPORT_PREFIX="comparison-between-old-and-new"

log() {
    printf '%s\n' "$*"
}

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

command -v unzip >/dev/null 2>&1 || fail "The 'unzip' command is not installed. Install it with: sudo apt install unzip"
command -v diff >/dev/null 2>&1 || fail "The 'diff' command is not installed."

[[ -d "$BASE_DIR" ]] || fail "Base directory does not exist: $BASE_DIR"
[[ -d "$CURRENT_DIR" ]] || fail "Current directory does not exist: $CURRENT_DIR"

# Locate and validate the ZIP before changing either source directory.
mapfile -d '' -t zip_entries < <(
    find "$BASE_DIR" -maxdepth 1 -type f -iname '*.zip' -printf '%T@\t%p\0' | sort -z -nr
)

((${#zip_entries[@]} > 0)) || fail "No ZIP file was found in $BASE_DIR"
newest_zip="${zip_entries[0]#*$'\t'}"
unzip -tq "$newest_zip" >/dev/null || fail "The newest ZIP file is invalid or unreadable: $newest_zip"

mkdir -p "$PREVIOUS_DIR"

log "1. Emptying: $PREVIOUS_DIR"
find "$PREVIOUS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +

log "2. Moving current soccotash contents into soccotash-last"
shopt -s dotglob nullglob
current_items=("$CURRENT_DIR"/*)
if ((${#current_items[@]} > 0)); then
    mv -- "${current_items[@]}" "$PREVIOUS_DIR"/
else
    log "   The soccotash directory was already empty."
fi
shopt -u dotglob nullglob

log "3. Extracting the newest ZIP file from: $BASE_DIR"
log "   Newest ZIP: $(basename "$newest_zip")"
log "   Extracting into: $CURRENT_DIR"
mkdir -p "$CURRENT_DIR"
unzip -q -o "$newest_zip" -d "$CURRENT_DIR"

log "4. Selecting the next comparison report number"
highest_version=0
shopt -s nullglob
for report_file in "$BASE_DIR"/"$REPORT_PREFIX"\(*\).md; do
    report_name=$(basename "$report_file")
    if [[ "$report_name" =~ ^comparison-between-old-and-new\(([0-9]+)\)\.md$ ]]; then
        version="${BASH_REMATCH[1]}"
        if ((10#$version > highest_version)); then
            highest_version=$((10#$version))
        fi
    fi
done
shopt -u nullglob

next_version=$((highest_version + 1))
report_path="$BASE_DIR/${REPORT_PREFIX}(${next_version}).md"
summary_report_path="$BASE_DIR/${SUMMARY_PREFIX}(${next_version}).md"

log "   Creating full report: $report_path"
{
    printf '# Comparison between old and new (%d)\n\n' "$next_version"
    printf -- '- Generated: `%s`\n' "$(date --iso-8601=seconds)"
    printf -- '- Previous version: `%s`\n' "$PREVIOUS_DIR"
    printf -- '- New version: `%s`\n' "$CURRENT_DIR"
    printf -- '- Source ZIP: `%s`\n\n' "$newest_zip"
    printf '## Differences\n\n'
    printf '````diff\n'

    # diff returns 1 when differences are found, which is expected.
    diff -ruN --exclude='.git' -- "$PREVIOUS_DIR" "$CURRENT_DIR" || diff_status=$?
    diff_status=${diff_status:-0}

    if ((diff_status > 1)); then
        fail "The diff command failed with status $diff_status"
    fi

    printf '````\n'

    if ((diff_status == 0)); then
        printf '\nNo content differences were found.\n'
    fi
} > "$report_path"

log "5. Creating changed/new files summary: $summary_report_path"
new_count=0
changed_count=0
summary_rows=()

# Sort paths lexically so files appear in directory-hierarchy order.
while IFS= read -r -d '' relative_path; do
    new_path="$CURRENT_DIR/$relative_path"
    old_path="$PREVIOUS_DIR/$relative_path"

    if [[ ! -f "$old_path" ]]; then
        summary_rows+=("NEW" "$relative_path")
        ((new_count += 1))
    elif ! cmp -s -- "$old_path" "$new_path"; then
        summary_rows+=("CHANGED" "$relative_path")
        ((changed_count += 1))
    fi
done < <(
    find "$CURRENT_DIR" \
        -type d -name '.git' -prune -o \
        -type f -printf '%P\0' \
        | LC_ALL=C sort -z
)

{
    printf '# Changed and new files (%d)\n\n' "$next_version"
    printf -- '- Generated: `%s`\n' "$(date --iso-8601=seconds)"
    printf -- '- Previous version: `%s`\n' "$PREVIOUS_DIR"
    printf -- '- New version: `%s`\n' "$CURRENT_DIR"
    printf -- '- Source ZIP: `%s`\n' "$newest_zip"
    printf -- '- New files: **%d**\n' "$new_count"
    printf -- '- Changed files: **%d**\n\n' "$changed_count"

    if ((${#summary_rows[@]} == 0)); then
        printf 'No new or changed files were found.\n'
    else
        printf 'Files are listed in `soccotash` directory-hierarchy order.\n\n'
        printf '| Status | File |\n'
        printf '|---|---|\n'

        for ((i = 0; i < ${#summary_rows[@]}; i += 2)); do
            status="${summary_rows[i]}"
            relative_path="${summary_rows[i + 1]}"
            # Escape table separators. Backticks make spaces and punctuation clear.
            markdown_path=${relative_path//|/\|}
            printf '| %s | `%s` |\n' "$status" "$markdown_path"
        done
    fi
} > "$summary_report_path"

log ""
log "Completed successfully."
log "New source directory: $CURRENT_DIR"
log "Previous source directory: $PREVIOUS_DIR"
log "Full comparison report: $report_path"
log "Changed/new summary: $summary_report_path"