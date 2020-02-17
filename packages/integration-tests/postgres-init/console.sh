#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username joist --dbname joist
