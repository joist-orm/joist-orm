#!/bin/bash

set -e

(cd packages/integration-tests && ../../node_modules/.bin/ts-node ../migration-utils/build/index.js)

(cd packages/integration-tests && yarn test)

