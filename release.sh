#!/bin/bash

set -e

echo "npmAuthToken: ${NPM_TOKEN}" >> .yarnrc.yml

for p in utils codegen graphql-codegen migration-utils orm test-utils ; do
  ./bump.sh ./packages/$p/package.json
done

for p in utils codegen graphql-codegen migration-utils orm test-utils ; do
  cd ./packages/$p
  yarn npm publish
  cd ../..
done

for p in utils codegen graphql-codegen migration-utils orm test-utils ; do
  rm ./packages/$p/package.json.bak
  git checkout ./packages/$p/package.json
done
