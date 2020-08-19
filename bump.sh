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
pattern="1.0.0-bump"
major="1"
minor="0"
patch=$(git log --first-parent --format=%H | wc -l)
version="${major}.${minor}.${patch}"
sed -i.bak "s/${pattern}/${version}/g" "${file}"
