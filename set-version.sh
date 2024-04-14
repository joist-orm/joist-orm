#!/bin/bash

# Sets `version: ...` in our package.json.
#
# Would love to use `npm version ${...}` but in Node 18, npm started failing
# on yarn's `workspace:*` URLs. :-/
#

version=$1

set_version() {
  local dir=$1
  local file="${dir}/package.json"
  local pattern=$(grep -o "\"version\": \"[[:digit:]]\+\.[[:digit:]]\+\.[[:digit:]]\+\"" < "${file}")
  sed -i.bak "s/${pattern}/\"version\": \"${version}\"/" "${file}"
}

# Maybe use https://github.com/yarnpkg/yarn/issues/6066#issuecomment-1907033865
for dir in . ./packages/codegen \
  ./packages/graphql-codegen \
  ./packages/graphql-resolver-utils \
  ./packages/migration-utils \
  ./packages/plugins/join-preloading \
  ./packages/orm \
  ./packages/utils \
  ./packages/test-utils
do
  set_version $dir
done
