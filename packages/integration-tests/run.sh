#!/bin/bash

if [ "${DATABASE_CONNECTION_INFO}" = "" ]; then
  export $(grep -v '^#' local.env | xargs -d '\n')
fi

./node_modules/.bin/ts-node-dev -r tsconfig-paths/register "$@"
