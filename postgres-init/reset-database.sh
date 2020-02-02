#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<-EOSQL
    DROP DATABASE joist;
    CREATE DATABASE joist;
    GRANT ALL PRIVILEGES ON DATABASE joist TO joist ;
EOSQL
