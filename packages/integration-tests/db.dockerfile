FROM postgres

# These scripts are only run once on initial db creation; if you need to re-run, use `docker-compose rm db`.
COPY postgres-init /docker-entrypoint-initdb.d/
COPY bin/psql-console.sh /
COPY bin/reset-database.sh /
