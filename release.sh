#!/bin/bash

set -e

echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc

for p in utils codegen graphql-codegen migration-utils orm ; do
  ./bump.sh ./packages/$p/package.json
done

echo "npmAuthToken: ${NPM_TOKEN}" >> .yarnrc.yml

for p in utils codegen graphql-codegen migration-utils orm ; do
  cd ./packages/$p
  yarn npm publish
  cd ../..
done

for p in utils codegen graphql-codegen migration-utils orm ; do
  rm ./packages/$p/package.json.bak
  git checkout ./packages/$p/package.json
done
