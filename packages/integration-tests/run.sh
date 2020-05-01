#!/bin/bash

export $(grep -v '^#' local.env | sed 's/\"/\\\"/g' | xargs)

./node_modules/.bin/ts-node "$@"
