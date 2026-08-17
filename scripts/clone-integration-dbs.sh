#!/usr/bin/env bash
set -euo pipefail

docker compose exec -T db psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<'SQL'
  DROP DATABASE IF EXISTS joist_stock WITH (FORCE);
  CREATE DATABASE joist_stock WITH TEMPLATE joist OWNER joist;
  DROP DATABASE IF EXISTS joist_preloading WITH (FORCE);
  CREATE DATABASE joist_preloading WITH TEMPLATE joist OWNER joist;
  DROP DATABASE IF EXISTS joist_lazy WITH (FORCE);
  CREATE DATABASE joist_lazy WITH TEMPLATE joist OWNER joist;
  DROP DATABASE IF EXISTS joist_lazy_preloading WITH (FORCE);
  CREATE DATABASE joist_lazy_preloading WITH TEMPLATE joist OWNER joist;
SQL
