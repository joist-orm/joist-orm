#!/bin/bash
set -e

# This only initializes our initial database and user/password; see migrations/ for actual table changes.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER joist PASSWORD 'local';
    CREATE DATABASE joist;
    GRANT ALL PRIVILEGES ON DATABASE joist TO joist;
EOSQL
