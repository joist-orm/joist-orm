#!/bin/bash

set -e

echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc

for p in utils codegen graphql-codegen migration-utils orm ; do
  ./bump.sh ./packages/$p/package.json
done

for p in utils codegen graphql-codegen migration-utils orm ; do
  cd ./packages/$p
  npm publish --non-interactive
  cd ../..
done

for p in utils codegen graphql-codegen migration-utils orm ; do
  rm ./packages/$p/package.json.bak
  git checkout ./packages/$p/package.json
done
