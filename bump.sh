#!/bin/bash

# Generates a version number based on the current pattern + number of git commits.
#
# Currently hard-coded to make 0.N.X releases where N == the existing minor digit
# in the file and X == the number of git commits.
#
# Usage:
#   ./bump.sh package.json
#

file=$1
pattern=$(grep -o "0\.[[:digit:]]\+\.0-bump" < "${file}" | head -n 1)
minor=$(echo "${pattern}"| grep -o "^0\.[[:digit:]]\+")
patch=$(git log --first-parent --format=%H | wc -l)
version="${minor}.${patch}"
sed -i.bak "s/${pattern}/${version}/g" "${file}"
