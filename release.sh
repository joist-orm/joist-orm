#!/bin/bash

set -e

yarn build

(cd packages/integration-tests && exec yarn test)

for p in codegen migration-utils orm ; do
  ./bump.sh ./packages/$p/package.json
done

for p in codegen migration-utils orm ; do
  cd ./packages/$p
  yarn publish --non-interactive --otp $1
  cd ../..
done

for p in codegen migration-utils orm ; do
  rm ./packages/$p/package.json.bak
  git checkout ./packages/$p/package.json
done
