#!/bin/bash

export $(grep -v '^#' local.env | sed 's/\"/\\\"/g' | xargs)

export NODE_OPTIONS=--max-old-space-size=8096

../.././node_modules/.bin/ts-node "$@"
