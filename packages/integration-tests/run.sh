#!/bin/bash

export $(grep -v '^#' env.local | xargs)

./node_modules/.bin/ts-node-dev -r tsconfig-paths/register "$@"
