#!/bin/bash
set -euo pipefail

SOURCE=${1:-main}
TARGET=${2:-release}
TITLE=${3:-"release: promote ${SOURCE} to stable"}
RANGE="${TARGET}..${SOURCE}"

mapfile -t subjects < <(jj log -r "$RANGE" --no-graph -T 'description.first_line() ++ "\n"' | tac)

printf "%s\n\n" "$TITLE"

if [ ${#subjects[@]} -eq 0 ]; then
  printf "No commits to promote from %s into %s.\n" "$SOURCE" "$TARGET"
  exit 0
fi

printf "Includes since the last stable release:\n"

for subject in "${subjects[@]}"; do
  if [ -n "$subject" ]; then
    printf -- "- %s\n" "$subject"
  fi
done
