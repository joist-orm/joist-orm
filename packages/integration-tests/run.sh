#!/bin/bash

export $(grep -v '^#' env.local | xargs -d '\n')

./node_modules/.bin/ts-node-dev -r tsconfig-paths/register "$@"
